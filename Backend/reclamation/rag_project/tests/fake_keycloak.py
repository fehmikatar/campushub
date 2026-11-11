"""An offline Keycloak for the tests: RSA test keys, a local JWKS server and signed tokens.

Nothing here contacts a real Keycloak. The keys are generated when the tests start (no private
key is stored in the repository) and the JWKS server listens on 127.0.0.1, on a free port.
"""

import base64
import json
import socket
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import jwt
from cryptography.hazmat.primitives.asymmetric import rsa
from django.test import override_settings

# The realm's issuer: in Docker too, tokens keep this browser-side address.
ISSUER = "http://localhost:8180/realms/campushub"
JWKS_PATH = "/realms/campushub/protocol/openid-connect/certs"

# Test users of keycloak/campushub-realm.json
ETUDIANT_ID = "11111111-1111-4111-8111-111111111111"
ENSEIGNANT_ID = "3f2b8c1e-5d4a-4c1b-9a0e-2d7f6b1c8e90"
ADMIN_ID = "99999999-9999-4999-8999-999999999999"

# Keycloak always adds these realm roles; they mean nothing to CampusHub.
DEFAULT_KEYCLOAK_ROLES = ["offline_access", "uma_authorization", "default-roles-campushub"]


class RsaKey:
    def __init__(self, kid: str, use: str = "sig", alg: str = "RS256"):
        self.kid, self.use, self.alg = kid, use, alg
        self.private = rsa.generate_private_key(public_exponent=65537, key_size=2048)

    def jwk(self) -> dict:
        public = json.loads(jwt.algorithms.RSAAlgorithm.to_jwk(self.private.public_key()))
        return {**public, "kid": self.kid, "use": self.use, "alg": self.alg}


KEY = RsaKey("campushub-test-key")
ROTATED_KEY = RsaKey("campushub-rotated-key")
IMPOSTOR_KEY = RsaKey(KEY.kid)                              # same key id, different key
ENCRYPTION_KEY = RsaKey("campushub-enc-key", use="enc", alg="RSA-OAEP")  # Keycloak publishes one too


class _QuietServer(ThreadingHTTPServer):
    daemon_threads = True

    def handle_error(self, request, client_address):
        pass  # e.g. a client that gave up (timeout test) before the answer was written


class FakeJwks:
    """A local JWKS endpoint. Tests change `keys`, `status` (e.g. 503) or `delay` at will."""

    def __init__(self, keys=(KEY,)):
        self.keys = list(keys)
        self.status = 200
        self.delay = 0.0
        self.requests = 0
        fake = self

        class Handler(BaseHTTPRequestHandler):
            def do_GET(self):
                fake.requests += 1
                if fake.delay:
                    time.sleep(fake.delay)
                if self.path != JWKS_PATH:
                    self.send_error(404)
                    return
                body = json.dumps({"keys": [k.jwk() for k in fake.keys + [ENCRYPTION_KEY]]}).encode()
                self.send_response(fake.status)
                self.send_header("Content-Type", "application/json")
                self.send_header("Content-Length", str(len(body)))
                self.end_headers()
                self.wfile.write(body)

            def log_message(self, *args):
                pass

        self._server = _QuietServer(("127.0.0.1", 0), Handler)
        threading.Thread(target=self._server.serve_forever, daemon=True).start()
        self.base_url = f"http://127.0.0.1:{self._server.server_port}"
        self.url = self.base_url + JWKS_PATH

    def reset(self, keys=(KEY,)):
        self.keys, self.status, self.delay, self.requests = list(keys), 200, 0.0, 0

    def stop(self):
        self._server.shutdown()
        self._server.server_close()


_shared = None


def shared_jwks() -> FakeJwks:
    """One JWKS server for every test that only needs valid tokens (started on first use)."""
    global _shared
    if _shared is None:
        _shared = FakeJwks()
    return _shared


def closed_port_url() -> str:
    """A JWKS address where nothing listens: an unreachable Keycloak."""
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        port = s.getsockname()[1]
    return f"http://127.0.0.1:{port}{JWKS_PATH}"


def keycloak_settings(jwks_url: str, issuer: str = ISSUER):
    """Point the service at a fake JWKS while keeping the real issuer (like the Docker setup)."""
    return override_settings(KEYCLOAK_ISSUER_URI=issuer, KEYCLOAK_JWKS_URI=jwks_url)


def claims(sub=ETUDIANT_ID, roles=("ETUDIANT",), issuer=ISSUER, expires_in=300, **extra) -> dict:
    now = int(time.time())
    return {"iss": issuer, "sub": sub, "aud": "account", "typ": "Bearer", "azp": "campushub-frontend",
            "iat": now, "exp": now + expires_in,
            "realm_access": {"roles": list(roles) + DEFAULT_KEYCLOAK_ROLES}, **extra}


def make_token(*, key: RsaKey = KEY, omit=(), header=None, **claim_args) -> str:
    """An RS256 token like Keycloak's. `omit` drops claims; `header` adds/overrides header fields
    (a None value removes the field, e.g. header={"kid": None})."""
    payload = claims(**claim_args)
    for name in omit:
        payload.pop(name, None)
    headers = {name: value for name, value in {"kid": key.kid, **(header or {})}.items() if value is not None}
    return jwt.encode(payload, key.private, algorithm="RS256", headers=headers)


def hs256_token(**claim_args) -> str:
    return jwt.encode(claims(**claim_args), "a-shared-secret-of-at-least-32-bytes!", algorithm="HS256",
                      headers={"kid": KEY.kid})


def unsigned_token(**claim_args) -> str:
    def part(data):
        return base64.urlsafe_b64encode(json.dumps(data).encode()).rstrip(b"=").decode()
    return f"{part({'alg': 'none', 'typ': 'JWT', 'kid': KEY.kid})}.{part(claims(**claim_args))}."


def auth_headers(token: str | None = None) -> dict:
    return {"Authorization": f"Bearer {token or make_token()}"}
