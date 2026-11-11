import os

from django.core.wsgi import get_wsgi_application

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')

application = get_wsgi_application()

from enrollments.eureka import register_in_background  # noqa: E402

register_in_background()
