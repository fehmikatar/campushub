import os
from pathlib import Path

from django.core.exceptions import ImproperlyConfigured

try:  # confort en local : lit le fichier .env s'il existe
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

BASE_DIR = Path(__file__).resolve().parent.parent


def env_list(name, default=''):
    return [v.strip() for v in os.environ.get(name, default).split(',') if v.strip()]


DEBUG = os.environ.get('DEBUG', 'False').lower() in ('1', 'true', 'yes')

SECRET_KEY = os.environ.get('SECRET_KEY')
if not SECRET_KEY:
    if DEBUG:
        SECRET_KEY = 'dev-only-insecure-key'      # jamais utilisable hors DEBUG
    else:
        raise ImproperlyConfigured('La variable SECRET_KEY est obligatoire.')

ALLOWED_HOSTS = env_list('ALLOWED_HOSTS', 'localhost,127.0.0.1')

INSTALLED_APPS = [
    'django.contrib.contenttypes',
    'django.contrib.auth',
    'rest_framework',
    'enrollments',
]

MIDDLEWARE = [
    'enrollments.middleware.ChunkedBodyMiddleware',
    'django.middleware.common.CommonMiddleware',
]

ROOT_URLCONF = 'config.urls'
WSGI_APPLICATION = 'config.wsgi.application'

DATABASES = {
    'default': {
        'ENGINE': 'django.db.backends.postgresql',
        'NAME': os.environ.get('DB_NAME', 'enrollment_db'),
        'USER': os.environ.get('DB_USER', 'postgres'),
        'PASSWORD': os.environ.get('DB_PASSWORD', ''),
        'HOST': os.environ.get('DB_HOST', 'localhost'),
        'PORT': os.environ.get('DB_PORT', '5432'),
    }
}

DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'
USE_TZ = True
TIME_ZONE = 'UTC'



# --- Keycloak ---
KEYCLOAK_ISSUER_URI = os.environ.get(
    'KEYCLOAK_ISSUER_URI', 'http://localhost:8180/realms/campushub')
KEYCLOAK_JWKS_URI = (os.environ.get('KEYCLOAK_JWKS_URI')
                     or KEYCLOAK_ISSUER_URI + '/protocol/openid-connect/certs')
KEYCLOAK_ISSUER = KEYCLOAK_ISSUER_URI
KEYCLOAK_JWKS_URL = KEYCLOAK_JWKS_URI

# --- Eureka ---
EUREKA_ENABLED = os.environ.get('EUREKA_ENABLED', 'True').lower() in ('1', 'true', 'yes')
EUREKA_SERVER = os.environ.get(
    'EUREKA_CLIENT_SERVICEURL_DEFAULTZONE', 'http://localhost:8761/eureka/')
EUREKA_INSTANCE_HOST = os.environ.get('EUREKA_INSTANCE_HOST', 'localhost')
SERVICE_PORT = int(os.environ.get('PORT', '8083'))

REST_FRAMEWORK = {
    'DEFAULT_AUTHENTICATION_CLASSES': ['enrollments.authentication.KeycloakAuthentication'],
    'DEFAULT_PERMISSION_CLASSES': ['enrollments.permissions.IsAuthenticatedJWT'],
    'DEFAULT_RENDERER_CLASSES': ['rest_framework.renderers.JSONRenderer'],
}
