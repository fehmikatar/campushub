from rest_framework.routers import DefaultRouter
from .views import InscriptionViewSet

router = DefaultRouter()
router.register(r'enrollments', InscriptionViewSet, basename='enrollment')

urlpatterns = router.urls
