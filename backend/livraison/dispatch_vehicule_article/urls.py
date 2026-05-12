from django.urls import path
from .views import apply_metaheuristic_input

urlpatterns = [
    path('afficher/all-output', apply_metaheuristic_input, name='apply_metaheuristic_input'),
]