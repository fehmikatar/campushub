from django.db import models

TITLE_MAX_LENGTH = 200


class Conversation(models.Model):
    title = models.CharField(max_length=TITLE_MAX_LENGTH, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-updated_at"]

    def __str__(self):
        return self.title or f"Conversation {self.pk}"

    def history(self, limit: int) -> list[dict]:
        """Last `limit` messages as [{'role', 'content'}], oldest first."""
        if limit <= 0:
            return []
        recent = self.messages.order_by("-created_at", "-id")[:limit]
        return [{"role": m.role, "content": m.content} for m in reversed(recent)]

    def to_dict(self, message_count: int | None = None, with_messages: bool = False) -> dict:
        data = {"id": self.pk, "title": self.title, "created_at": self.created_at,
                "updated_at": self.updated_at}
        if with_messages:
            messages = [m.to_dict() for m in self.messages.all()]
            data.update(message_count=len(messages), messages=messages)
        elif message_count is not None:
            data["message_count"] = message_count
        return data


class Message(models.Model):
    class Role(models.TextChoices):
        USER = "user", "User"
        ASSISTANT = "assistant", "Assistant"

    conversation = models.ForeignKey(Conversation, on_delete=models.CASCADE, related_name="messages")
    role = models.CharField(max_length=20, choices=Role.choices)
    content = models.TextField()
    # assistant messages: {evidence, citation_check, official_decision, academic_year}
    sources = models.JSONField(default=list, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["created_at", "id"]

    def __str__(self):
        return f"{self.role}: {self.content[:50]}"

    def to_dict(self) -> dict:
        data = {"id": self.pk, "role": self.role, "content": self.content, "created_at": self.created_at}
        if isinstance(self.sources, dict):
            data.update(self.sources)
        return data
