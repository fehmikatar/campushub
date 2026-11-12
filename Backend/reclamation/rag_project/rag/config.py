from django.conf import settings


def cfg(key):
    """Read a value from settings.RAG at call time (so override_settings works in tests)."""
    return settings.RAG[key]
