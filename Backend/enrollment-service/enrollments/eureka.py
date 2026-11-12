import logging
import threading
import time

from django.conf import settings

logger = logging.getLogger(__name__)


def _register_with_retry():
    import py_eureka_client.eureka_client as eureka_client

    while True:
        try:
            eureka_client.init(
                eureka_server=settings.EUREKA_SERVER,
                app_name='enrollment-service',
                instance_host=settings.EUREKA_INSTANCE_HOST,
                instance_port=settings.SERVICE_PORT,
                instance_id=f'{settings.EUREKA_INSTANCE_HOST}:enrollment-service:{settings.SERVICE_PORT}',
                should_discover=False,
            )
            logger.info('Enregistré dans Eureka : enrollment-service')
            return
        except Exception as exc:
            logger.warning('Eureka indisponible (%s), nouvel essai dans 10 s', exc)
            time.sleep(10)


def register_in_background():
    if not settings.EUREKA_ENABLED:
        return
    threading.Thread(target=_register_with_retry, daemon=True).start()
