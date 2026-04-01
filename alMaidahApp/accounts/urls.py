from django.urls import path

from .views import (
    LoginAPIView,
    LogoutAPIView,
    ManagedUserDetailAPIView,
    ManagedUserListCreateAPIView,
    MeAPIView,
)


urlpatterns = [
    path("auth/login/", LoginAPIView.as_view()),
    path("auth/logout/", LogoutAPIView.as_view()),
    path("auth/me/", MeAPIView.as_view()),
    path("auth/users/", ManagedUserListCreateAPIView.as_view()),
    path("auth/users/<int:user_id>/", ManagedUserDetailAPIView.as_view()),
]
