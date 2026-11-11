"""Database router: reclamations live in MongoDB, everything else stays in SQLite.

- `reclamations` models -> the "mongodb" alias, for reads, writes and migrations;
- every other app (chat, documents, regulation, auth, contenttypes, sessions) -> "default" (SQLite);
- objects of the two databases are never related: a reclamation stores a Keycloak UUID string
  (and optional legacy integer id), not a foreign key;
- an app is only migrated on its own database: `migrate` creates no MongoDB collection and
  `migrate --database mongodb` creates no SQLite table.

`django_mongodb_backend.routers.MongoRouter` runs before this router (settings.DATABASE_ROUTERS):
it keeps embedded models (the history entries) from getting a collection of their own.
"""

from django.db import DEFAULT_DB_ALIAS

MONGODB = "mongodb"
MONGODB_APPS = frozenset({"reclamations"})


def database_for(app_label: str) -> str:
    return MONGODB if app_label in MONGODB_APPS else DEFAULT_DB_ALIAS


class DatabaseRouter:
    def db_for_read(self, model, **hints):
        return database_for(model._meta.app_label)

    def db_for_write(self, model, **hints):
        return database_for(model._meta.app_label)

    def allow_relation(self, obj1, obj2, **hints):
        return database_for(obj1._meta.app_label) == database_for(obj2._meta.app_label)

    def allow_migrate(self, db, app_label, model_name=None, **hints):
        return db == database_for(app_label)
