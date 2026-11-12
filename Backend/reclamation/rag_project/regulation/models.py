from django.db import models


class AcademicRule(models.Model):
    """A structured policy statement paraphrased from the regulation (e.g. VAL001).

    The French PDF text stays authoritative; rules help retrieval and citations.
    """

    rule_id = models.CharField(max_length=20, primary_key=True)
    document_id = models.CharField(max_length=255)
    academic_year = models.CharField(max_length=20)
    article = models.CharField(max_length=50)
    pages = models.JSONField(default=list)
    category = models.CharField(max_length=10, db_index=True)
    rule_type = models.CharField(max_length=40)
    rule = models.TextField()
    source_citation = models.CharField(max_length=255)
    authority = models.CharField(max_length=50, blank=True)
    automatable = models.BooleanField(default=False)

    class Meta:
        ordering = ["rule_id"]

    def __str__(self):
        return f"{self.rule_id} (art. {self.article})"

    def to_dict(self):
        return {
            "id": self.rule_id, "article": self.article, "pages": self.pages,
            "category": self.category, "rule_type": self.rule_type, "rule": self.rule,
            "source_citation": self.source_citation, "automatable": self.automatable,
            "academic_year": self.academic_year,
        }


class Ambiguity(models.Model):
    """A known contradiction or gap in the regulation, with its required handling."""

    amb_id = models.CharField(max_length=20, primary_key=True)
    document_id = models.CharField(max_length=255)
    academic_year = models.CharField(max_length=20)
    issue = models.CharField(max_length=255)
    pages = models.JSONField(default=list)
    details = models.TextField()
    handling = models.TextField()

    class Meta:
        ordering = ["amb_id"]
        verbose_name_plural = "ambiguities"

    def __str__(self):
        return f"{self.amb_id}: {self.issue}"

    def to_dict(self):
        return {"id": self.amb_id, "issue": self.issue, "pages": self.pages,
                "details": self.details, "handling": self.handling}


class DatasetVersion(models.Model):
    """Tracks what was imported (file hash + embedding model) so re-runs can skip work."""

    name = models.CharField(max_length=255, unique=True)  # e.g. "rules:esprit-reglement-…"
    sha256 = models.CharField(max_length=64)
    embed_model = models.CharField(max_length=200)
    item_count = models.PositiveIntegerField(default=0)
    ingested_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"{self.name} ({self.item_count} items)"
