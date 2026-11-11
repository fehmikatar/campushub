from django.apps import AppConfig


class ReclamationsConfig(AppConfig):
    name = "reclamations"
    # Stored in MongoDB (config/db_router.py): ObjectId primary keys. The SQLite apps keep
    # settings.DEFAULT_AUTO_FIELD.
    default_auto_field = "django_mongodb_backend.fields.ObjectIdAutoField"
