from django.urls import path
from .views import MenuListCreateAPIView, MenuDetailAPIView

urlpatterns = [
    path('menu/', MenuListCreateAPIView.as_view()),
    path('menu/<int:pk>/', MenuDetailAPIView.as_view()),
]
