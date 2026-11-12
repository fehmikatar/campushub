import uuid

import jwt
from jwt import PyJWKClient
from jwt.exceptions import PyJWKClientConnectionError
from django.conf import settings
from rest_framework.authentication import BaseAuthentication
from rest_framework.exceptions import APIException, AuthenticationFailed, PermissionDenied

# Du plus élevé au plus faible : on garde le premier trouvé.
ROLES = ['ADMIN', 'ENSEIGNANT', 'ETUDIANT']

# Les clés publiques sont gardées en cache 10 minutes.
_jwks_client = PyJWKClient(
    settings.KEYCLOAK_JWKS_URI, cache_keys=True, cache_jwk_set=True, lifespan=600)


class AuthUnavailable(APIException):
    status_code = 503
    default_detail = "Service d'authentification indisponible, réessayez plus tard."
    default_code = 'auth_unavailable'


class KeycloakUser:
    is_authenticated = True

    def __init__(self, user_id, role):
        self.id = user_id        # uuid.UUID
        self.role = role


class KeycloakAuthentication(BaseAuthentication):
    def authenticate_header(self, request):
        # Obligatoire : sans cela, DRF répond 403 au lieu de 401.
        return 'Bearer'

    def authenticate(self, request):
        header = request.headers.get('Authorization')
        if not header:
            return None
        parts = header.split()
        if len(parts) != 2 or parts[0].lower() != 'bearer':
            raise AuthenticationFailed('En-tête Authorization invalide.')
        token = parts[1]

        try:
            if jwt.get_unverified_header(token).get('alg') != 'RS256':
                raise AuthenticationFailed('Token invalide.')
            signing_key = _jwks_client.get_signing_key_from_jwt(token)
            payload = jwt.decode(
                token,
                signing_key.key,
                algorithms=['RS256'],
                issuer=settings.KEYCLOAK_ISSUER_URI,
                options={'verify_aud': False, 'require': ['exp', 'iss', 'sub']},
            )
        except PyJWKClientConnectionError:
            raise AuthUnavailable()
        except jwt.ExpiredSignatureError:
            raise AuthenticationFailed('Token expiré.')
        except jwt.PyJWTError:
            raise AuthenticationFailed('Token invalide.')

        try:
            user_id = uuid.UUID(str(payload['sub']))
        except ValueError:
            raise AuthenticationFailed('Token invalide.')

        realm_access = payload.get('realm_access')
        roles = realm_access.get('roles', []) if isinstance(realm_access, dict) else []
        role = next((r for r in ROLES if r in roles), None)
        if role is None:
            raise PermissionDenied('Accès interdit : aucun rôle CampusHub.')

        return (KeycloakUser(user_id, role), token)
