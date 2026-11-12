"""Container health check: the public GET /api/health of this container answers 200 {"status": "UP"}.

It reads the RAG index counts only (SQLite / ChromaDB), never a token, MongoDB or a provider.
"""

import json
import os
import sys
import urllib.request

url = f"http://127.0.0.1:{os.environ.get('PORT', '8087')}/api/health"
opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
try:
    with opener.open(url, timeout=4) as response:
        healthy = response.status == 200 and json.load(response).get("status") == "UP"
except Exception:
    healthy = False
sys.exit(0 if healthy else 1)
