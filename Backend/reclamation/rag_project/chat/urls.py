from config.api import route

from . import views

app_name = "chat"

urlpatterns = [
    route(r"api/academic-assistant/ask", views.AskView.as_view(), name="ask"),
    route(r"api/conversations", views.ConversationListView.as_view(), name="conversations"),
    route(r"api/conversations/(?P<pk>\d+)", views.ConversationDetailView.as_view(), name="conversation"),
]
