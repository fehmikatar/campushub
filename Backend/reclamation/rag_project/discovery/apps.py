from django.apps import AppConfig


class DiscoveryConfig(AppConfig):
    """Eureka registration. Deliberately no ready(): Django startup, tests, migrations and the
    runserver autoreloader never register anything. Only `manage.py eureka_register` does."""

    name = "discovery"
