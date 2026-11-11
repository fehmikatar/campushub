from django.db import models


class Document(models.Model):
    """One source document (a PDF file, or a prepared JSON extract of a PDF).

    Its chunks live in the ChromaDB pages collection, keyed by `external_id`.
    """

    class Status(models.TextChoices):
        PENDING = "pending", "Pending"
        PROCESSING = "processing", "Processing"
        READY = "ready", "Ready"
        FAILED = "failed", "Failed"

    class Origin(models.TextChoices):
        PDF = "pdf", "PDF file"
        JSON = "json", "Prepared JSON extract"

    filename = models.CharField(max_length=255, unique=True)
    external_id = models.CharField(max_length=255, unique=True, null=True, blank=True,
                                   help_text="document_id used in vector metadata")
    title = models.CharField(max_length=255, blank=True)
    origin = models.CharField(max_length=10, choices=Origin.choices, default=Origin.PDF)
    academic_year = models.CharField(max_length=20, blank=True)
    sha256 = models.CharField(max_length=64, blank=True)
    page_count = models.PositiveIntegerField(default=0)
    chunk_count = models.PositiveIntegerField(default=0)
    embed_model = models.CharField(max_length=200, blank=True)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.PENDING)
    error = models.TextField(blank=True)
    ingested_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["filename"]

    def __str__(self):
        return self.title or self.filename

    @property
    def doc_key(self) -> str:
        return self.external_id or self.filename

    def to_dict(self) -> dict:
        return {
            "id": self.pk, "filename": self.filename, "title": self.title, "origin": self.origin,
            "academic_year": self.academic_year, "status": self.status, "error": self.error,
            "page_count": self.page_count, "chunk_count": self.chunk_count,
            "embed_model": self.embed_model, "sha256": self.sha256, "ingested_at": self.ingested_at,
            "created_at": self.created_at, "updated_at": self.updated_at,
        }
