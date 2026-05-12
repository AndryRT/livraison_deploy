from django.urls import path
from . import views

urlpatterns = [
    path('vehicules/', views.vehicules_view, name='vehicules_view'),
    path('vehicules/ajouter/', views.ajouter_vehicule, name='ajouter_vehicule'),
    path('vehicules/<int:pk>/', views.modifier_vehicule, name='modifier_vehicule'),
    path('vehicules/active/', views.get_vehicle_active, name='get_vehicle_active'),
    path('livraisons/disponible/', views.get_data_react, name='get_data_react'),
    path('history/', views.get_all_history, name='get_all_history'),
]
