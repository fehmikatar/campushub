"""python manage.py eureka_register [--once]

Registers the Reclamation Service in Eureka and keeps it registered (heartbeat every 30 s) until
stopped with Ctrl+C or SIGTERM, then deregisters it. Run it next to the web server, e.g.
    python manage.py runserver 8087      (terminal 1)
    python manage.py eureka_register     (terminal 2)
Run ONE agent per instance. --once registers a single time and exits (no heartbeat: Eureka drops
the instance after about 90 s), like Notification's `eureka:register --once`.
"""

import signal
import threading

from django.core.management.base import BaseCommand, CommandError

from discovery.eureka import EurekaClient, EurekaConfig, RegistrationAgent, service_is_up

STOP_SIGNALS = [getattr(signal, name) for name in ("SIGINT", "SIGTERM", "SIGBREAK") if hasattr(signal, name)]


class Command(BaseCommand):
    help = "Register this service in Eureka and send heartbeats until stopped (Ctrl+C deregisters)."

    def add_arguments(self, parser):
        parser.add_argument("--once", action="store_true",
                            help="register once and exit (no heartbeat: Eureka drops it after ~90 s)")

    def handle(self, *args, once=False, **options):
        config = EurekaConfig.from_settings()
        if not config.enabled:
            self.stdout.write("EUREKA_ENABLED is off: nothing registered.")
            return
        if once:
            self.register_once(config)
            return
        stop = threading.Event()
        previous = {sig: signal.signal(sig, lambda *_: stop.set()) for sig in STOP_SIGNALS}
        try:
            RegistrationAgent(config).run(stop)
        finally:
            for sig, handler in previous.items():
                signal.signal(sig, handler)
        self.stdout.write("Eureka agent stopped.")

    def register_once(self, config: EurekaConfig):
        if not service_is_up(config):
            raise CommandError(f"The service does not answer UP at {config.local_health_url}: start it first "
                               f"(python manage.py runserver {config.instance_port}).")
        if not EurekaClient(config).register():
            raise CommandError(f"Eureka did not accept the registration at {config.app_url} "
                               "(not running or not reachable).")
        self.stdout.write(f"Registered {config.instance_id} as {config.app_id} "
                          f"(no heartbeat: expires after about 90 s).")
