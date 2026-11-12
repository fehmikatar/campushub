"""Routes of the reclamations API (DRF router).

  GET, POST                /api/reclamations/
  GET, PUT, PATCH, DELETE  /api/reclamations/{id}/
  POST                     /api/reclamations/{id}/change-status/
  GET                      /api/reclamations/stats/
"""

from rest_framework.routers import DefaultRouter

from .views import ReclamationViewSet


class Router(DefaultRouter):
    include_root_view = False        # "/" keeps the service's JSON 404 (config/urls.py)
    include_format_suffixes = False  # JSON only: no ".json" variants of the URLs

    def __init__(self):
        super().__init__()
        self.trailing_slash = "/?"   # like every endpoint of the service: final slash optional


router = Router()
router.register("api/reclamations", ReclamationViewSet, basename="reclamation")

urlpatterns = router.urls
