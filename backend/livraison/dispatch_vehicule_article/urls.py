from django.urls import path
from .views import apply_metaheuristic_input, get_reporting

urlpatterns = [
    path('afficher/all-output', apply_metaheuristic_input, name='apply_metaheuristic_input'),
    path('reporting/', get_reporting, name='get_reporting'),
]