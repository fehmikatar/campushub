"""Knowledge-base documents: every CampusHub role reads, only ADMIN changes (documents/views.py,
config.api.ApiView.write_roles).

Real Keycloak verification (RS256 test tokens, local fake JWKS), real views and the real indexing
pipeline with the offline fake embedder, temporary PDF / Chroma folders. Every refusal is checked
against a full snapshot of the PDFs, the SQLite rows and the three Chroma collections, plus spies on
the body parser, the document services, the vector writes and the embedding provider.
"""

import hashlib
import json
from contextlib import ExitStack
from unittest import mock

from django.conf import settings
from django.contrib.auth.models import User
from django.core.files.uploadedfile import SimpleUploadedFile
from django.core.handlers.wsgi import WSGIRequest
from django.test import Client
from django.test.client import BOUNDARY, MULTIPART_CONTENT, encode_multipart

from config import auth
from documents import views as document_views
from documents.models import Document
from rag import embeddings, vectorstore

from . import fake_keycloak as kc
from .test_rag import FakeEmbedder, IndexTestCase, pdf_bytes

FORBIDDEN = {"error": document_views.WRITE_FORBIDDEN}
COLLECTIONS = ("COLLECTION_PAGES", "COLLECTION_RULES", "COLLECTION_AMBIGUITIES")
TEACHER_ID = kc.ENSEIGNANT_ID


class CountingEmbedder(FakeEmbedder):
    def __init__(self):
        self.calls = 0

    def embed_documents(self, texts):
        self.calls += 1
        return super().embed_documents(texts)

    def embed_query(self, text):
        self.calls += 1
        return super().embed_query(text)


def as_user(roles, sub=kc.ETUDIANT_ID, **claims) -> Client:
    return Client(headers=kc.auth_headers(kc.make_token(sub=sub, roles=list(roles), **claims)))


def multipart(name="Nouveau.pdf", pages=("Article 9 : contenu inventé.",), **fields):
    return encode_multipart(BOUNDARY, {"file": SimpleUploadedFile(name, pdf_bytes(list(pages)),
                                                                  content_type="application/pdf"), **fields})


class DocumentPermissionTests(IndexTestCase):
    def setUp(self):
        super().setUp()
        self.embedder = CountingEmbedder()
        embeddings.set_embedder(self.embedder)
        self.admin = as_user(["ADMIN"], kc.ADMIN_ID)
        self.student = as_user(["ETUDIANT"])
        self.teacher = as_user(["ENSEIGNANT"], TEACHER_ID)
        self.run_command("ingest_regulation")                       # the read-only regulation (JSON)
        created = self.admin.generic("POST", "/api/documents", multipart("Guide des stages.pdf",
                                     ["Article 1 : le stage dure 8 semaines."]), MULTIPART_CONTENT)
        self.assertEqual(created.status_code, 201, created.content)
        self.doc = created.json()
        self.url = f"/api/documents/{self.doc['id']}"
        self.regulation_url = f"/api/documents/{Document.objects.get(origin=Document.Origin.JSON).pk}"
        self.embedder.calls = 0

    # ------------------------------------------------------------ helpers
    def state(self):
        pdfs = {p.name: hashlib.sha256(p.read_bytes()).hexdigest() for p in settings.RAG["PDF_DIR"].iterdir()}
        rows = list(Document.objects.order_by("pk").values())
        vectors = {name: sorted((h.id, h.text) for h in vectorstore.get_all(settings.RAG[name])) for name in COLLECTIONS}
        return pdfs, rows, vectors

    def mutations(self):
        """Every changing request the API accepts (with and without the final slash), on an uploaded
        PDF, on the read-only regulation and on a missing id."""
        body = multipart()
        return [("POST", "/api/documents", body, MULTIPART_CONTENT),
                ("POST", "/api/documents/", body, MULTIPART_CONTENT),
                ("PUT", self.url, body, MULTIPART_CONTENT), ("PUT", f"{self.url}/", body, MULTIPART_CONTENT),
                ("PATCH", self.url, json.dumps({"filename": "Renommé.pdf"}), "application/json"),
                ("DELETE", self.url, "", None), ("DELETE", f"{self.url}/", "", None),
                ("PUT", self.regulation_url, body, MULTIPART_CONTENT), ("DELETE", self.regulation_url, "", None),
                ("DELETE", "/api/documents/999999", "", None)]

    def send(self, client, method, path, body="", content_type=None, **extra):
        kwargs = {"content_type": content_type} if content_type else {}
        return client.generic(method, path, body, **kwargs, **extra)

    def spies(self, stack: ExitStack) -> dict:
        targets = {"body parsed": (WSGIRequest, "_load_post_and_files"),
                   "upload read": (document_views, "uploaded_files"),
                   "pdf checked": (document_views, "check_pdf"),
                   "pdf added": (document_views, "add_uploaded_pdf"),
                   "pdf replaced": (document_views, "replace_uploaded_pdf"),
                   "pdf deleted": (document_views, "delete_uploaded_pdf"),
                   "vectors written": (vectorstore, "upsert"),
                   "vectors deleted": (vectorstore, "delete_where")}
        return {label: stack.enter_context(mock.patch.object(owner, name, wraps=getattr(owner, name), autospec=True))
                for label, (owner, name) in targets.items()}

    def assert_untouched(self, before, spies):
        self.assertEqual(self.state(), before)
        self.assertEqual(self.embedder.calls, 0)  # no embedding provider call (no quota spent)
        self.assertEqual({label: spy.call_count for label, spy in spies.items() if spy.call_count}, {})

    # ------------------------------------------------------------ reads: every role
    def test_every_role_reads_documents(self):
        before = self.state()
        for label, client in (("ETUDIANT", self.student), ("ENSEIGNANT", self.teacher), ("ADMIN", self.admin)):
            with self.subTest(role=label):
                for path in ("/api/documents", "/api/documents/"):
                    listed = client.get(path)
                    self.assertEqual((listed.status_code, listed.json()["count"]), (200, 2))
                for path in (self.url, f"{self.url}/"):
                    self.assertEqual(client.get(path).json()["sha256"], self.doc["sha256"])
                self.assertEqual(client.head(self.url).status_code, 200)
                self.assertEqual(client.options(self.url).status_code, 200)
                self.assertEqual(client.get("/api/documents/999999").status_code, 404)
        self.assertEqual(self.state(), before)
        self.assertEqual(self.embedder.calls, 0)

    # ------------------------------------------------------------ changes: ADMIN only
    def test_students_and_teachers_cannot_change_anything(self):
        callers = {"ETUDIANT": self.student, "ENSEIGNANT": self.teacher,
                   "ETUDIANT + ENSEIGNANT": as_user(["ETUDIANT", "ENSEIGNANT"], TEACHER_ID)}
        before = self.state()
        with ExitStack() as stack:
            spies = self.spies(stack)
            for label, client in callers.items():
                for method, path, body, content_type in self.mutations():
                    with self.subTest(role=label, method=method, path=path):
                        response = self.send(client, method, path, body, content_type)
                        self.assertEqual((response.status_code, response.json()), (403, FORBIDDEN))
                        self.assertEqual(response["Content-Type"], "application/json; charset=utf-8")
            self.assert_untouched(before, spies)

    def test_large_forbidden_upload_is_refused_before_its_body_is_read(self):
        big = multipart("Gros.pdf", ["x"] * 5) + b"\0" * (3 * 1024 * 1024)  # > Django's 2.5 MB memory limit
        before = self.state()
        with ExitStack() as stack:
            spies = self.spies(stack)
            response = self.send(self.student, "POST", "/api/documents", big, MULTIPART_CONTENT)
            self.assertEqual(response.status_code, 403)
            self.assert_untouched(before, spies)  # no temporary upload file either: never parsed

    def test_admin_keeps_the_whole_lifecycle(self):
        created = self.send(self.admin, "POST", "/api/documents/", multipart("Syllabus.pdf", ["Article 2 : Python."]),
                            MULTIPART_CONTENT)
        self.assertEqual(created.status_code, 201, created.content)
        url = f"/api/documents/{created.json()['id']}"
        replaced = self.send(self.admin, "PUT", url, multipart("x.pdf", ["Page 1.", "Page 2."]), MULTIPART_CONTENT)
        self.assertEqual((replaced.status_code, replaced.json()["page_count"]), (200, 2))
        self.assertGreater(self.embedder.calls, 0)  # the normal indexing still runs for an ADMIN
        patched = self.send(self.admin, "PATCH", url, json.dumps({"filename": "y.pdf"}), "application/json")
        self.assertEqual((patched.status_code, patched["Allow"]), (405, "GET, PUT, DELETE, HEAD, OPTIONS"))
        self.assertEqual(self.send(self.admin, "DELETE", f"{url}/").status_code, 204)
        self.assertEqual(self.send(self.admin, "DELETE", url).status_code, 404)              # existing 404
        self.assertEqual(self.send(self.admin, "POST", "/api/documents", "", MULTIPART_CONTENT).status_code, 400)
        self.assertEqual(self.send(self.admin, "DELETE", self.regulation_url).status_code, 409)  # read-only JSON
        highest_wins = as_user(["ETUDIANT", "ADMIN"], kc.ADMIN_ID)
        self.assertEqual(self.send(highest_wins, "DELETE", self.url).status_code, 204)

    # ------------------------------------------------------------ authentication first
    def test_authentication_failures_come_before_the_role_check(self):
        tokens = {"missing": None, "malformed": "not-a-jwt",
                  "expired": kc.make_token(sub=kc.ADMIN_ID, roles=["ADMIN"], expires_in=-120),
                  "wrong issuer": kc.make_token(sub=kc.ADMIN_ID, roles=["ADMIN"], issuer="http://localhost:9999/realms/x"),
                  "wrong signature": kc.make_token(key=kc.IMPOSTOR_KEY, sub=kc.ADMIN_ID, roles=["ADMIN"])}
        before = self.state()
        with ExitStack() as stack:
            spies = self.spies(stack)
            for label, token in tokens.items():
                client = Client(headers=kc.auth_headers(token)) if token else Client()
                for method, path, body, content_type in [("GET", "/api/documents", "", None)] + self.mutations():
                    with self.subTest(token=label, method=method, path=path):
                        response = self.send(client, method, path, body, content_type)
                        self.assertEqual(response.status_code, 401)
                        self.assertIn("Bearer", response["WWW-Authenticate"])
            no_role = as_user(["offline_access"], kc.ADMIN_ID)  # valid token, no CampusHub role
            self.assertEqual(self.send(no_role, "GET", "/api/documents").json(), {"error": auth.NO_ROLE})
            self.assertEqual(self.send(no_role, "DELETE", self.url).status_code, 403)
            self.assert_untouched(before, spies)

    def test_keycloak_unreachable_is_still_503(self):
        before = self.state()
        with kc.keycloak_settings(kc.closed_port_url()):
            auth.reset_signing_keys()
            response = self.send(self.admin, "DELETE", self.url)
        auth.reset_signing_keys()
        self.assertEqual(response.status_code, 503)
        self.assertEqual(self.state(), before)

    # ------------------------------------------------------------ only the verified token decides
    def test_role_spoofing_is_ignored(self):
        forged = {"role": "ADMIN", "roles": "ADMIN", "is_admin": "true", "sub": kc.ADMIN_ID}
        headers = {"HTTP_X_ROLE": "ADMIN", "HTTP_X_ROLES": "ADMIN", "HTTP_X_USER_ID": kc.ADMIN_ID,
                   "HTTP_X_FORWARDED_USER": "admin"}
        attempts = [
            (self.student, "POST", f"/api/documents?role=ADMIN&sub={kc.ADMIN_ID}", multipart(**forged), MULTIPART_CONTENT),
            (self.student, "PUT", self.url, multipart(**forged), MULTIPART_CONTENT),
            (self.student, "DELETE", self.url, json.dumps(forged), "application/json"),
            (self.teacher, "DELETE", f"{self.url}?admin_id={kc.ADMIN_ID}", json.dumps(forged), "application/json"),
            # claims a CampusHub service must ignore: the old "role" claim, a client role, a name
            (as_user(["ETUDIANT"], role="ADMIN"), "DELETE", self.url, "", None),
            (as_user(["ETUDIANT"], resource_access={"campushub-frontend": {"roles": ["ADMIN"]}}),
             "DELETE", self.url, "", None),
            (as_user(["ENSEIGNANT"], TEACHER_ID, preferred_username="admin"), "DELETE", self.url, "", None),
        ]
        before = self.state()
        for client, method, path, body, content_type in attempts:
            with self.subTest(method=method, path=path):
                self.assertEqual(self.send(client, method, path, body, content_type, **headers).status_code, 403)
        # a local Django superuser is not an API identity: no Bearer token -> 401
        superuser = User.objects.create_superuser("root", "root@example.invalid", "local-pass")
        session = Client()
        session.force_login(superuser)
        self.assertEqual(self.send(session, "DELETE", self.url).status_code, 401)
        self.assertEqual(self.send(Client(HTTP_AUTHORIZATION="Basic cm9vdDpsb2NhbC1wYXNz"), "DELETE",
                                   self.url).status_code, 401)
        self.assertEqual(self.state(), before)
        self.assertEqual(self.embedder.calls, 0)

    # ------------------------------------------------------------ nothing else changed
    def test_other_endpoints_keep_their_rules(self):
        for client in (self.student, self.teacher):  # write_roles is set on the document views only
            answer = client.post("/api/academic-assistant/ask", json.dumps({"question": "Combien dure le PFE ?"}),
                                 content_type="application/json")
            self.assertEqual(answer.status_code, 200, answer.content)
            conversation = client.post("/api/conversations", json.dumps({"title": "Mes questions"}),
                                       content_type="application/json")
            self.assertEqual(conversation.status_code, 201, conversation.content)
            self.assertEqual(client.get("/api/academic-rules").status_code, 200)
        self.assertEqual(Client().get("/api/health").status_code, 200)  # still public
