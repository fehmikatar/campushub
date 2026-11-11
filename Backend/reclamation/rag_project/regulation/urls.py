from config.api import route

from . import views

app_name = "regulation"

urlpatterns = [
    route(r"api/academic-rules", views.RuleListView.as_view(), name="rules"),
    route(r"api/academic-rules/(?P<rule_id>[A-Za-z0-9_-]+)", views.RuleDetailView.as_view(), name="rule"),
    route(r"api/ambiguities", views.AmbiguityListView.as_view(), name="ambiguities"),
    route(r"api/ambiguities/(?P<amb_id>[A-Za-z0-9_-]+)", views.AmbiguityDetailView.as_view(), name="ambiguity"),
]
