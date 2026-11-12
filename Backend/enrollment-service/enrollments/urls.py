from rest_framework.routers import SimpleRouter

from .views import InscriptionViewSet


class OptionalSlashRouter(SimpleRouter):
    """/api/enrollments et /api/enrollments/ fonctionnent tous les deux
    (la Gateway peut retirer le slash final)."""

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.trailing_slash = '/?'


router = OptionalSlashRouter()
router.register(r'enrollments', InscriptionViewSet, basename='enrollment')

urlpatterns = router.urls
