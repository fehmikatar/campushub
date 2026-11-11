class RAGError(Exception):
    """An error with a message that is safe and useful to show to the user (API: 503)."""


class DocumentError(RAGError):
    """The submitted document itself is unusable: not a PDF, encrypted, no text… (API: 422)."""
