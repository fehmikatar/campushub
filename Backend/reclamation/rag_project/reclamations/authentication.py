"""DRF adapter for the shared Keycloak verifier. No local users or token cache."""

from rest_framework.authentication import BaseAuthentication

from config import auth


class KeycloakAuthentication(BaseAuthentication):
    def authenticate(self, request):
        # AuthError is translated by our exception handler without DRF changing 401 to 403.
        principal = auth.authenticate(request)
        request.principal = principal
        return principal, None  # request.user is the principal; never retain the raw JWT

    def authenticate_header(self, request):
        return auth.CHALLENGE
