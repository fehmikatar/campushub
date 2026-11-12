"""manage.py setup_roles [--demo]

Creates the Etudiant, Formateur and Administrateur groups (SQLite) when they are missing.
--demo (DJANGO_DEBUG=True only) also creates the local demo users etudiant1, etudiant2,
formateur1 and admin1, each with exactly one role and the public demo password.

Idempotent and safe on real data: an existing user is never given a new password, and a user who
already holds a different role is left as it is (with a warning) instead of being changed.
"""

from django.conf import settings
from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from django.core.management.base import BaseCommand, CommandError

# Legacy local groups only; they never authorize the Keycloak API.
ETUDIANT, FORMATEUR, ADMINISTRATEUR = "Etudiant", "Formateur", "Administrateur"
ROLES_BY_PRIORITY = (ADMINISTRATEUR, FORMATEUR, ETUDIANT)

DEMO_PASSWORD = "campushub123"  # public, documented: local development only (DEBUG)
DEMO_USERS = (
    ("etudiant1", ETUDIANT),
    ("etudiant2", ETUDIANT),
    ("formateur1", FORMATEUR),
    ("admin1", ADMINISTRATEUR),
)


class Command(BaseCommand):
    help = "Create the CampusHub role groups; with --demo (DEBUG only) also the local demo users."

    def add_arguments(self, parser):
        parser.add_argument("--demo", action="store_true",
                            help=f"also create {', '.join(name for name, _ in DEMO_USERS)} (DEBUG only)")

    def handle(self, *args, demo=False, **options):
        if demo and not settings.DEBUG:
            raise CommandError("--demo only works with DJANGO_DEBUG=True: the demo users share a public "
                               "password. Nothing was changed.")
        groups = {}
        for name in ROLES_BY_PRIORITY:
            groups[name], created = Group.objects.get_or_create(name=name)
            self.stdout.write(f"Group {name}: {'created' if created else 'already exists'}")
        if demo:
            for username, role in DEMO_USERS:
                self.stdout.write(f"User {username} ({role}): {self.demo_user(username, groups[role])}")

    def demo_user(self, username: str, group: Group) -> str:
        User = get_user_model()
        user = User.objects.filter(username=username).first()
        if user is None:
            user = User.objects.create_user(username=username, password=DEMO_PASSWORD)
            user.groups.add(group)
            return "created"
        roles = set(user.groups.filter(name__in=ROLES_BY_PRIORITY).values_list("name", flat=True))
        if roles == {group.name}:
            return "already exists (password unchanged)"
        if not roles:
            user.groups.add(group)
            return "already exists, role added (password unchanged)"
        self.stderr.write(self.style.WARNING(
            f"User {username} already has the role(s) {', '.join(sorted(roles))}: left unchanged."))
        return "left unchanged"
