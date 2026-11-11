"""REST API routes. Every path works with or without a trailing slash; unknown paths -> JSON 404."""

from django.urls import include, path, re_path

from .api import route
from .views import HealthView, not_found

urlpatterns = [
    route("api/health", HealthView.as_view(), name="health"),
    path("", include("chat.urls")),
    path("", include("regulation.urls")),
    path("", include("documents.urls")),
    re_path(r"^", not_found),  # must stay last
]

handler404 = "config.views.not_found_handler"
handler500 = "config.views.server_error_handler"
