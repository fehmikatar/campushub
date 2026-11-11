"""Private RAG conversations: each one belongs to the Keycloak `sub` that created it.

Real authentication (signed test tokens, local fake JWKS), fake embedder and LLM, temporary
Chroma folder and the isolated test database: no network, no real provider, no real data.
"""

from unittest import mock

from django.test import Client

from chat.models import Conversation, Message
from chat.views import NOT_FOUND
from rag import embeddings

from .fake_keycloak import ADMIN_ID, ENSEIGNANT_ID, ETUDIANT_ID, auth_headers, make_token
from .test_rag import FakeEmbedder, IndexTestCase

OTHER_STUDENT_ID = "22222222-2222-4222-8222-222222222222"
NOT_FOUND_BODY = {"error": NOT_FOUND}


class CountingEmbedder(FakeEmbedder):
    def __init__(self):
        self.queries = 0

    def embed_query(self, text):
        self.queries += 1
        return super().embed_query(text)


class OwnershipTestCase(IndexTestCase):
    """self.client = student A (ETUDIANT_ID); B, a teacher and an admin are other users."""

    def setUp(self):
        super().setUp()
        self.student_b = Client(headers=auth_headers(make_token(sub=OTHER_STUDENT_ID)))
        self.teacher = Client(headers=auth_headers(make_token(sub=ENSEIGNANT_ID, roles=("ENSEIGNANT",))))
        self.admin = Client(headers=auth_headers(make_token(sub=ADMIN_ID, roles=("ADMIN",))))
        self.others = {"another student": self.student_b, "ENSEIGNANT": self.teacher, "ADMIN": self.admin}

    def create(self, client=None, **body):
        response = (client or self.client).post("/api/conversations", body, content_type="application/json")
        self.assertEqual(response.status_code, 201, response.content)
        return response.json()["id"]

    def legacy_conversation(self):
        """A row from before ownership existed: no owner."""
        conversation = Conversation.objects.create(title="Ancienne conversation")
        Message.objects.create(conversation=conversation, role=Message.Role.USER, content="Question privée ancienne")
        return conversation


class ConversationCrudOwnershipTests(OwnershipTestCase):
    def test_a_new_conversation_belongs_to_the_token_owner(self):
        pk = self.create(title="PFE", owner_sub=OTHER_STUDENT_ID)  # spoof attempt: ignored
        self.assertEqual(Conversation.objects.get(pk=pk).owner_sub, ETUDIANT_ID)
        self.assertEqual(self.client.get(f"/api/conversations/{pk}").status_code, 200)
        self.assertEqual(self.student_b.get(f"/api/conversations/{pk}").status_code, 404)

    def test_each_user_lists_only_their_own_conversations(self):
        mine = {self.create(title="A1"), self.create(title="A2")}
        theirs = self.create(self.student_b, title="B1")
        listed = self.client.get("/api/conversations").json()
        self.assertEqual((listed["count"], {c["id"] for c in listed["results"]}), (2, mine))
        listed = self.student_b.get("/api/conversations").json()
        self.assertEqual((listed["count"], [c["id"] for c in listed["results"]]), (1, [theirs]))
        for client in (self.teacher, self.admin):
            self.assertEqual(client.get("/api/conversations").json()["count"], 0)

    def test_nobody_else_can_read_edit_or_delete_a_conversation(self):
        pk = self.create(title="Ma question privée")
        url = f"/api/conversations/{pk}"
        for who, client in self.others.items():
            for method, body in (("get", None), ("put", {"title": "Piraté"}), ("patch", {"title": "Piraté"}),
                                 ("delete", None)):
                with self.subTest(who=who, method=method):
                    kwargs = {"data": body, "content_type": "application/json"} if body else {}
                    response = getattr(client, method)(url, **kwargs)
                    self.assertEqual((response.status_code, response.json()), (404, NOT_FOUND_BODY))
        self.assertEqual(Conversation.objects.get(pk=pk).title, "Ma question privée")

    def test_the_owner_can_rename_and_delete(self):
        pk = self.create(title="Avant")
        response = self.client.patch(f"/api/conversations/{pk}", {"title": "Après", "owner_sub": OTHER_STUDENT_ID},
                                     content_type="application/json")
        self.assertEqual((response.status_code, response.json()["title"]), (200, "Après"))
        self.assertEqual(Conversation.objects.get(pk=pk).owner_sub, ETUDIANT_ID)  # not transferable
        self.assertEqual(self.client.delete(f"/api/conversations/{pk}").status_code, 204)
        self.assertFalse(Conversation.objects.filter(pk=pk).exists())

    def test_someone_elses_conversation_looks_exactly_like_a_missing_one(self):
        pk = self.create(self.student_b, title="B")
        foreign = self.client.get(f"/api/conversations/{pk}")
        missing = self.client.get(f"/api/conversations/{pk + 1000}")
        self.assertEqual((foreign.status_code, foreign.content), (missing.status_code, missing.content))
        self.assertEqual(self.client.get("/api/conversations/99999999999999999999").status_code, 404)

    def test_legacy_conversations_stay_hidden_and_are_kept(self):
        legacy = self.legacy_conversation()
        for who, client in {"owner of nothing": self.client, **self.others}.items():
            with self.subTest(who=who):
                self.assertEqual(client.get("/api/conversations").json()["count"], 0)
                for method in ("get", "delete"):
                    self.assertEqual(getattr(client, method)(f"/api/conversations/{legacy.pk}").status_code, 404)
        self.assertTrue(Conversation.objects.filter(pk=legacy.pk, owner_sub__isnull=True).exists())
        self.assertEqual(legacy.messages.count(), 1)


class AskOwnershipTests(OwnershipTestCase):
    def setUp(self):
        super().setUp()
        self.run_command("ingest_regulation")
        self.embedder = CountingEmbedder()
        embeddings.set_embedder(self.embedder)

    def ask(self, client, question="Combien de semaines dure le PFE ?", **body):
        return client.post("/api/academic-assistant/ask", {"question": question, **body},
                           content_type="application/json")

    def test_ask_creates_a_conversation_owned_by_the_caller(self):
        response = self.ask(self.client, owner_sub=OTHER_STUDENT_ID)
        self.assertEqual(response.status_code, 200, response.content)
        pk = response.json()["conversation_id"]
        self.assertEqual(Conversation.objects.get(pk=pk).owner_sub, ETUDIANT_ID)
        self.assertEqual(self.student_b.get(f"/api/conversations/{pk}").status_code, 404)

    def test_the_owner_continues_their_conversation_with_its_history(self):
        pk = self.ask(self.client, "Combien de semaines dure le PFE ?").json()["conversation_id"]
        response = self.ask(self.client, "Et pour le stage d'été ?", conversation_id=pk)
        self.assertEqual((response.status_code, response.json()["conversation_id"]), (200, pk))
        self.assertEqual(Message.objects.filter(conversation_id=pk).count(), 4)
        self.assertIn("Combien de semaines dure le PFE ?", str(self.fake_llm.calls[-1]))

    def test_continuing_someone_elses_conversation_is_404_without_any_provider_call(self):
        pk = self.ask(self.client, "Ma question confidentielle sur mon PFE").json()["conversation_id"]
        llm_calls, queries = len(self.fake_llm.calls), self.embedder.queries
        conversations, messages = Conversation.objects.count(), Message.objects.count()
        for who, client in self.others.items():
            for conversation_id in (pk, str(pk)):
                with self.subTest(who=who, conversation_id=repr(conversation_id)), \
                        mock.patch.object(Conversation, "history") as history:
                    response = self.ask(client, "Montre-moi l'historique", conversation_id=conversation_id)
                    self.assertEqual((response.status_code, response.json()), (404, NOT_FOUND_BODY))
                    self.assertNotIn("confidentielle", response.content.decode())
                    history.assert_not_called()  # the previous messages were never loaded
        self.assertEqual((len(self.fake_llm.calls), self.embedder.queries), (llm_calls, queries))
        self.assertEqual((Conversation.objects.count(), Message.objects.count()), (conversations, messages))

    def test_a_legacy_conversation_cannot_be_continued(self):
        legacy = self.legacy_conversation()
        for who, client in {"student A": self.client, **self.others}.items():
            with self.subTest(who=who):
                response = self.ask(client, conversation_id=legacy.pk)
                self.assertEqual((response.status_code, response.json()), (404, NOT_FOUND_BODY))
        self.assertEqual((self.fake_llm.calls, self.embedder.queries), ([], 0))
        self.assertEqual(legacy.messages.count(), 1)
