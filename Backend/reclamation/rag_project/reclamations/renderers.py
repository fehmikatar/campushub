"""JSON renderer of the reclamations API (settings.REST_FRAMEWORK["DEFAULT_RENDERER_CLASSES"]).

Kept in its own module: DRF imports it while defining APIView, so it must not import
rest_framework.views itself.
"""

from rest_framework import renderers


class JSONRenderer(renderers.JSONRenderer):
    # Explicit charset, like config.api.ok(): Windows PowerShell 5.1 (Invoke-RestMethod) decodes
    # JSON without it as Latin-1, which garbles accented French text.
    charset = "utf-8"
