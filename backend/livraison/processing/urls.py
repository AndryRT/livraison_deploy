from django.urls import path
from .views import get_bank_data, test_auth, message, create_user_view,get_all_product,afficher

urlpatterns = [
    path('', message, name='message'),
    path('bank-data/', get_bank_data, name='get_bank_data'),
    path('test-auth/', test_auth, name='test_auth'),
    path('api/create_user/', create_user_view, name='create_user'),
    path('api/get-all-product/', get_all_product, name='get_all_product'),
    path('api/filter/', afficher, name='afficher'),
    

]
