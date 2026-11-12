"""Keycloak authentication (realm campushub) for every API endpoint except /api/health.

Team contract (Documentation/regles-communes-keycloak.txt):
  - RS256 tokens only, issued by KEYCLOAK_ISSUER_URI (exact match), signed with one of the realm's
    public keys (JWKS), which are cached ~10 minutes. The audience ("account") is not checked.
  - identity = "sub" (a UUID); role = the highest CampusHub role found in realm_access.roles
    (ADMIN > ENSEIGNANT > ETUDIANT). Other Keycloak roles and any legacy "role" claim are ignored.
  - 401: missing, malformed, invalid or expired token. 403: valid token without a CampusHub role.
    503: Keycloak unreachable and the signing key not cached, or authentication not configured.

This service never issues tokens: login, registration and passwords belong to Keycloak.
Flow: bearer_token(request) -> verify_token(token) [SigningKeys.get(kid) + jwt.decode]
      -> principal_from(claims) -> request.principal (see config.api.ApiView).
"""

import http.client
import json
import logging
import re
import threading
import time
import urllib.error
import urllib.request
from dataclasses import dataclass

import jwt
from django.conf import settings

log = logging.getLogger("rag.auth")

ALGORITHM = "RS256"                                # the only accepted signing algorithm
ROLES_BY_PRIORITY = ("ADMIN", "ENSEIGNANT", "ETUDIANT")
REQUIRED_CLAIMS = ["exp", "iat", "iss", "sub"]
# A fresh token may look issued slightly "in the future": the issuer's clock can be ahead, and the
# Docker Desktop VM clock can step back between issue and use (measured). Same allowance as Spring
# Security's default (the Gateway). Only for iat: exp and nbf stay strict (no longer lifetime).
IAT_CLOCK_SKEW = 60
UUID = re.compile(r"^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$")
MAX_TOKEN_LENGTH = 16 * 1024

KEYS_MAX_AGE = 10 * 60         # public keys are re-downloaded after 10 minutes (team rule)
KEYS_STALE_MAX_AGE = 60 * 60   # if Keycloak is down, keys already downloaded keep working up to 1 hour
MIN_FETCH_INTERVAL = 10        # at most one JWKS download attempt every 10 s
FETCH_TIMEOUT = 3              # seconds (team rule for calls to other services)
MAX_JWKS_BYTES = 1 << 20

# Client-facing messages: never the token, a key, a host name or an exception text.
MISSING = "Authentication required: send the header 'Authorization: Bearer <token>'."
MALFORMED = "The Authorization header must be 'Bearer <token>'."
INVALID = "Invalid token."
EXPIRED = "The token has expired."
NO_ROLE = "Access denied: this account has no CampusHub role."
UNAVAILABLE = "Authentication service unavailable, please retry later."
NOT_CONFIGURED = "Authentication is not configured on this service."

CHALLENGE = 'Bearer realm="campushub"'                                 # RFC 6750
INVALID_CHALLENGE = 'Bearer realm="campushub", error="invalid_token"'


class AuthError(Exception):
    """An authentication failure: HTTP status + a message that is safe to show to the client."""

    def __init__(self, status: int, message: str, challenge: str | None = None):
        super().__init__(message)
        self.status, self.message, self.challenge = status, message, challenge


def _invalid(message: str = INVALID) -> AuthError:
    return AuthError(401, message, INVALID_CHALLENGE)


@dataclass(frozen=True)
class Principal:
    """The authenticated caller, attached to the request as `request.principal`."""
    sub: str                   # Keycloak user id (UUID, lowercase)
    role: str                  # highest CampusHub role
    roles: tuple[str, ...]     # every CampusHub role of the user, highest first
    username: str = ""          # bounded display snapshot from verified claims; never authorization

    @property
    def is_authenticated(self) -> bool:
        return True

    @property
    def is_anonymous(self) -> bool:
        return False


# ---------------------------------------------------------------- signing keys (JWKS)

class KeysUnavailable(Exception):
    """The JWKS endpoint could not be read: network error, HTTP error or unusable answer."""


class _NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        return None


# Keycloak is always reached on an internal address (keycloak:8080, localhost:8180):
# no proxy from the environment, no redirects.
_opener = urllib.request.build_opener(urllib.request.ProxyHandler({}), _NoRedirect())


def _now() -> float:
    return time.monotonic()


def download_keys(uri: str) -> dict:
    """{kid: RSA public key} for every RS256 signing key published at `uri`."""
    request = urllib.request.Request(uri, headers={"Accept": "application/json"})
    try:
        with _opener.open(request, timeout=FETCH_TIMEOUT) as response:
            body = response.read(MAX_JWKS_BYTES + 1)
        if len(body) > MAX_JWKS_BYTES:
            raise ValueError("JWKS answer too large")
        jwks = json.loads(body)
    except urllib.error.HTTPError as exc:
        exc.close()
        raise KeysUnavailable(f"HTTP {exc.code}") from exc
    except (OSError, ValueError, http.client.HTTPException) as exc:  # URLError and timeouts are OSError
        raise KeysUnavailable(f"{type(exc).__name__}: {exc}") from exc

    keys = {}
    for jwk in (jwks.get("keys") if isinstance(jwks, dict) else None) or []:
        if not (isinstance(jwk, dict) and isinstance(jwk.get("kid"), str) and jwk.get("kty") == "RSA"
                and jwk.get("use", "sig") == "sig" and jwk.get("alg", ALGORITHM) == ALGORITHM):
            continue  # e.g. the realm's RSA-OAEP encryption key
        try:
            keys[jwk["kid"]] = jwt.PyJWK(jwk, algorithm=ALGORITHM).key
        except (jwt.PyJWTError, ValueError, TypeError):
            continue
    if not keys:
        raise KeysUnavailable("no RS256 signing key in the JWKS answer")
    return keys


class SigningKeys:
    """The realm's public keys for one JWKS address, downloaded on demand and cached.

    - Fresh for KEYS_MAX_AGE: requests are checked against the cache, Keycloak is not called.
    - A token signed with an unknown key id triggers a refresh (normal key rotation).
    - At most one download attempt every MIN_FETCH_INTERVAL seconds, so neither forged key ids
      nor a Keycloak outage turn every request into a (3 s) network call.
    - If a refresh fails, keys already downloaded keep working until KEYS_STALE_MAX_AGE.
      A key that was never downloaded cannot be checked: 503.
    """

    def __init__(self, uri: str):
        self.uri = uri
        self._cache = ({}, float("-inf"))   # (keys, monotonic time of the last successful download)
        self._attempted_at = float("-inf")
        self._last_failed = False
        self._lock = threading.Lock()

    def get(self, kid: str):
        keys, fetched_at = self._cache
        if kid in keys and _now() - fetched_at < KEYS_MAX_AGE:
            return keys[kid]                                 # common case: no lock, no network

        with self._lock:
            now = _now()
            keys, fetched_at = self._cache
            fresh = kid in keys and now - fetched_at < KEYS_MAX_AGE  # another thread may have refreshed
            if not fresh and now - self._attempted_at >= MIN_FETCH_INTERVAL:
                self._refresh(now)
                keys, fetched_at = self._cache

            if kid in keys and now - fetched_at < KEYS_STALE_MAX_AGE:
                return keys[kid]
            if kid not in keys and not self._last_failed:
                raise _invalid()                             # Keycloak answered: this key does not exist
            raise AuthError(503, UNAVAILABLE)                # the key cannot be checked right now

    def _refresh(self, now: float) -> None:
        self._attempted_at = now
        try:
            keys = download_keys(self.uri)
        except KeysUnavailable as exc:
            self._last_failed = True
            log.warning("Cannot download the Keycloak signing keys from %s (%s).", self.uri, exc)
            return
        self._cache, self._last_failed = (keys, now), False


_signing_keys: dict[str, SigningKeys] = {}
_signing_keys_lock = threading.Lock()


def signing_keys(uri: str) -> SigningKeys:
    with _signing_keys_lock:
        if uri not in _signing_keys:
            _signing_keys[uri] = SigningKeys(uri)
        return _signing_keys[uri]


def reset_signing_keys() -> None:
    """Forget every downloaded key (used by tests)."""
    with _signing_keys_lock:
        _signing_keys.clear()


# ---------------------------------------------------------------- request -> principal

def keycloak_config() -> tuple[str, str]:
    """(issuer, JWKS address) from the settings, read at call time."""
    issuer = (getattr(settings, "KEYCLOAK_ISSUER_URI", "") or "").strip()
    jwks_uri = (getattr(settings, "KEYCLOAK_JWKS_URI", "") or "").strip()
    if issuer and not jwks_uri:
        jwks_uri = f"{issuer.rstrip('/')}/protocol/openid-connect/certs"
    return issuer, jwks_uri


def bearer_token(request) -> str:
    header = request.META.get("HTTP_AUTHORIZATION", "")
    if not header.strip():
        raise AuthError(401, MISSING, CHALLENGE)
    parts = header.split()
    if len(parts) != 2 or parts[0].lower() != "bearer" or len(parts[1]) > MAX_TOKEN_LENGTH:
        raise AuthError(401, MALFORMED, INVALID_CHALLENGE)
    return parts[1]


def verify_token(token: str, issuer: str, keys: SigningKeys) -> dict:
    """Signature + claims check. Returns the claims or raises AuthError (401 / 503)."""
    try:
        header = jwt.get_unverified_header(token)
    except jwt.PyJWTError:
        raise _invalid() from None
    if header.get("alg") != ALGORITHM:
        raise _invalid()   # HS256, "none" or any other algorithm: refused before any key lookup
    kid = header.get("kid")
    if not isinstance(kid, str) or not kid:
        raise _invalid()

    key = keys.get(kid)
    try:
        claims = jwt.decode(token, key, algorithms=[ALGORITHM], issuer=issuer, options={
            "require": REQUIRED_CLAIMS, "verify_aud": False, "verify_iat": False,
            "enforce_minimum_key_length": True})
    except jwt.ExpiredSignatureError:
        raise _invalid(EXPIRED) from None
    except jwt.PyJWTError as exc:
        log.debug("Rejected token: %s", exc)  # PyJWT's reason, never the token itself
        raise _invalid() from None
    iat = claims["iat"]  # checked here instead of by PyJWT (no skew allowance there without exp's)
    if isinstance(iat, bool) or not isinstance(iat, (int, float)) or iat > time.time() + IAT_CLOCK_SKEW:
        log.debug("Rejected token: iat missing, not a number or more than %d s ahead", IAT_CLOCK_SKEW)
        raise _invalid()
    return claims


def campushub_roles(claims: dict) -> tuple[str, ...]:
    """CampusHub roles in realm_access.roles, highest first (every other role is ignored)."""
    realm_access = claims.get("realm_access")
    roles = realm_access.get("roles") if isinstance(realm_access, dict) else None
    if not isinstance(roles, list):
        return ()
    granted = {role for role in roles if isinstance(role, str)}
    return tuple(role for role in ROLES_BY_PRIORITY if role in granted)


def principal_from(claims: dict) -> Principal:
    sub = claims.get("sub")
    if not isinstance(sub, str) or not UUID.match(sub):
        raise _invalid()
    roles = campushub_roles(claims)
    if not roles:
        raise AuthError(403, NO_ROLE)
    username = claims.get("preferred_username")
    if not isinstance(username, str) or not username.strip() or len(username) > 150:
        username = sub.lower()
    return Principal(sub=sub.lower(), role=roles[0], roles=roles, username=username.strip())


_reported_unconfigured = False


def authenticate(request) -> Principal:
    """The caller of a protected endpoint, or AuthError. Never lets anonymous requests through."""
    global _reported_unconfigured
    issuer, jwks_uri = keycloak_config()
    if not issuer or not jwks_uri.startswith(("http://", "https://")):
        if not _reported_unconfigured:
            _reported_unconfigured = True
            log.error("KEYCLOAK_ISSUER_URI / KEYCLOAK_JWKS_URI is not configured: protected "
                      "endpoints answer 503 until it is.")
        raise AuthError(503, NOT_CONFIGURED)

    token = bearer_token(request)
    try:
        return principal_from(verify_token(token, issuer, signing_keys(jwks_uri)))
    except AuthError:
        raise
    except Exception:  # an unexpected failure must refuse the request, never become a 500
        log.exception("Unexpected error while checking a token; request refused.")
        raise _invalid() from None
