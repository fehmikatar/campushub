from rest_framework.permissions import BasePermission


class IsAuthenticatedJWT(BasePermission):
    def has_permission(self, request, view):
        return bool(request.user and getattr(request.user, 'is_authenticated', False))
