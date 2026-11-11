from config.api import route

from . import views

app_name = "documents"

urlpatterns = [
    route(r"api/documents", views.DocumentListView.as_view(), name="documents"),
    route(r"api/documents/(?P<pk>\d+)", views.DocumentDetailView.as_view(), name="document"),
]
