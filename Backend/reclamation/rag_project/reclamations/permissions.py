"""CRUD authorization uses only the principal returned by config.auth (highest role wins)."""

from rest_framework.exceptions import NotFound
from rest_framework.permissions import BasePermission

from config.auth import Principal

ETUDIANT = "ETUDIANT"
ENSEIGNANT = "ENSEIGNANT"
ADMIN = "ADMIN"

NOT_FOUND = "Reclamation not found."


def user_role(user) -> str | None:
    """Local Django users, groups and superuser flags confer no API privileges."""
    return user.role if isinstance(user, Principal) else None


class HasRole(BasePermission):
    role = None

    def has_permission(self, request, view):
        return user_role(request.user) == self.role


class IsEtudiant(HasRole):
    """A student, and on a given reclamation: its author. Another student's reclamation is
    reported as not found (404), never as forbidden, so its existence is not revealed."""

    role = ETUDIANT
    message = "Only students can do this."

    def has_object_permission(self, request, view, obj):
        if not obj.author_sub or obj.author_sub != request.user.sub:
            raise NotFound(NOT_FOUND)
        return True


class IsAdministrateur(HasRole):
    role = ADMIN
    message = "Only administrators can do this."


class DenyAll(BasePermission):
    message = "This operation is not available."

    def has_permission(self, request, view):
        return False
