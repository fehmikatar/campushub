"""How long a provider asks us to wait after a 429 (rate limit / quota) response."""

import re

RETRY_IN = re.compile(r"retry in (\d+(?:\.\d+)?)\s*s", re.IGNORECASE)  # Gemini: "Please retry in 55.1s."


def retry_after(exc, default: float = 60.0, maximum: float = 120.0) -> float:
    """Seconds to wait, from the Retry-After header or the error message; `default` if absent."""
    response = getattr(exc, "response", None)
    header = response.headers.get("retry-after") if response is not None else None
    try:
        seconds = float(header) if header else None
    except ValueError:
        seconds = None
    if seconds is None:
        match = RETRY_IN.search(str(exc))
        seconds = float(match.group(1)) if match else default
    return min(max(seconds, 1.0), maximum)
