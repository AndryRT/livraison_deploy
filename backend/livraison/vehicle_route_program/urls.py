from django.urls import path
from .views import show_optimization_result,send_fast_api_result,mark_delivered
urlpatterns = [
    path('optimization/result/', show_optimization_result, name='show_optimization_result'),
    path('send/result',send_fast_api_result,name='send_fast_api_result'),
    path('mark-delivered/', mark_delivered, name='mark-delivered'),
]

