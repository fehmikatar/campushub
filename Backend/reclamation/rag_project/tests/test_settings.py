"""
Container-ready settings: configurable storage paths and safe DEBUG / SECRET_KEY handling.

Settings are evaluated at import time, so each case imports `config.settings` in a fresh Python
process with explicit environment variables. Explicit variables win over the local .env
(python-dotenv never overrides them). Importing the settings never opens the database and never
creates files, and no embedding/LLM provider is called.
"""

import json
import os
import subprocess
import sys
import tempfile
from pathlib import Path
from unittest import mock

from django.conf import settings
from django.core.management.utils import get_random_secret_key
from django.test import SimpleTestCase

from config import settings as project_settings

BASE_DIR = settings.BASE_DIR
PRINT_SETTINGS = (
    "import json, config.settings as s; print(json.dumps({"
    "'db': str(s.DATABASES['default']['NAME']), 'chroma': str(s.RAG['CHROMA_DIR']), "
    "'pdfs': str(s.RAG['PDF_DIR']), 'regulation': str(s.RAG['REGULATION_DIR']), "
    "'debug': s.DEBUG, 'hosts': s.ALLOWED_HOSTS}))"
)
LOCAL_DEV = {"DJANGO_DEBUG": "True", "DJANGO_SECRET_KEY": ""}


def import_settings(**variables):
    """Run `import config.settings` in a new interpreter with these environment variables."""
    env = {**os.environ, **variables}
    return subprocess.run([sys.executable, "-c", PRINT_SETTINGS], cwd=BASE_DIR, env=env,
                          capture_output=True, text=True, timeout=120)


def load_settings(**variables) -> dict:
    result = import_settings(**variables)
    if result.returncode != 0:
        raise AssertionError(f"settings failed to load:\n{result.stderr[-2000:]}")
    return json.loads(result.stdout)


class DatabasePathTests(SimpleTestCase):
    def test_default_path_is_unchanged(self):
        with mock.patch.dict(os.environ):
            os.environ.pop("DJANGO_DB_PATH", None)
            self.assertEqual(project_settings.env_path("DJANGO_DB_PATH", "db.sqlite3"),
                             BASE_DIR / "db.sqlite3")
        for empty in ("", "   "):
            loaded = load_settings(**LOCAL_DEV, DJANGO_DB_PATH=empty)
            self.assertEqual(Path(loaded["db"]), BASE_DIR / "db.sqlite3")

    def test_absolute_path_overrides_default_without_creating_anything(self):
        with tempfile.TemporaryDirectory() as tmp:
            volume_db = Path(tmp) / "volume" / "db.sqlite3"  # its folder does not exist
            loaded = load_settings(**LOCAL_DEV, DJANGO_DB_PATH=str(volume_db))
            self.assertEqual(Path(loaded["db"]), volume_db)
            self.assertFalse(volume_db.parent.exists())

    def test_relative_path_is_resolved_against_the_project(self):
        loaded = load_settings(**LOCAL_DEV, DJANGO_DB_PATH="var/test.sqlite3")
        self.assertEqual(Path(loaded["db"]), BASE_DIR / "var" / "test.sqlite3")

    def test_tests_never_use_the_configured_database_file(self):
        # Django runs the test suite on an in-memory SQLite database, whatever DJANGO_DB_PATH says.
        from django.db import connection
        self.assertTrue(connection.is_in_memory_db())


class StorageDirectoryTests(SimpleTestCase):
    def test_one_volume_can_hold_sqlite_chroma_and_pdfs(self):
        with tempfile.TemporaryDirectory() as tmp:
            volume = Path(tmp) / "data"
            loaded = load_settings(**LOCAL_DEV, DJANGO_DB_PATH=str(volume / "db.sqlite3"),
                                   RAG_CHROMA_DIR=str(volume / "chroma"), RAG_PDF_DIR=str(volume / "pdfs"))
            self.assertEqual([Path(loaded[k]).parent for k in ("db", "chroma", "pdfs")], [volume] * 3)
            self.assertEqual(Path(loaded["regulation"]), BASE_DIR / "data" / "regulation")
            self.assertFalse(volume.exists())

    def test_empty_values_mean_the_defaults(self):
        loaded = load_settings(**LOCAL_DEV, RAG_CHROMA_DIR="", RAG_PDF_DIR="", RAG_REGULATION_DIR="")
        self.assertEqual(Path(loaded["chroma"]), BASE_DIR / "data" / "chroma")
        self.assertEqual(Path(loaded["pdfs"]), BASE_DIR / "data" / "pdfs")
        self.assertEqual(Path(loaded["regulation"]), BASE_DIR / "data" / "regulation")


class SecuritySettingsTests(SimpleTestCase):
    def test_debug_off_requires_a_strong_secret_key(self):
        for weak in ("", "change-me", "django-insecure-" + "x" * 60, "a" * 60):
            with self.subTest(secret=weak[:20]):
                result = import_settings(DJANGO_DEBUG="False", DJANGO_SECRET_KEY=weak)
                self.assertNotEqual(result.returncode, 0)
                self.assertIn("ImproperlyConfigured", result.stderr)
                self.assertIn("DJANGO_SECRET_KEY", result.stderr)

    def test_debug_off_with_a_random_secret_key_starts(self):
        loaded = load_settings(DJANGO_DEBUG="False", DJANGO_SECRET_KEY=get_random_secret_key())
        self.assertFalse(loaded["debug"])

    def test_empty_debug_value_means_off(self):
        result = import_settings(DJANGO_DEBUG="", DJANGO_SECRET_KEY="")
        self.assertIn("ImproperlyConfigured", result.stderr)

    def test_local_development_needs_no_secret_key(self):
        loaded = load_settings(**LOCAL_DEV)
        self.assertTrue(loaded["debug"])

    def test_allowed_hosts_are_trimmed_and_default_when_empty(self):
        loaded = load_settings(**LOCAL_DEV, DJANGO_ALLOWED_HOSTS=" reclamation-service , localhost ,")
        self.assertEqual(loaded["hosts"], ["reclamation-service", "localhost"])
        self.assertEqual(load_settings(**LOCAL_DEV, DJANGO_ALLOWED_HOSTS="")["hosts"],
                         ["localhost", "127.0.0.1"])

    def test_error_message_never_contains_the_rejected_value(self):
        rejected = "short-but-secret-value"
        result = import_settings(DJANGO_DEBUG="False", DJANGO_SECRET_KEY=rejected)
        self.assertNotIn(rejected, result.stderr + result.stdout)
