from django.urls import path

from .views import (
    LoginAPIView,
    LogoutAPIView,
    ManagedUserDetailAPIView,
    ManagedUserListCreateAPIView,
    MeAPIView,
    OperationalBaselineResetAPIView,
    OperationalSettingsAPIView,
)


urlpatterns = [
    path("auth/login/", LoginAPIView.as_view()),
    path("auth/logout/", LogoutAPIView.as_view()),
    path("auth/me/", MeAPIView.as_view()),
    path("auth/users/", ManagedUserListCreateAPIView.as_view()),
    path("auth/users/<int:user_id>/", ManagedUserDetailAPIView.as_view()),
    path("system/operational-settings/", OperationalSettingsAPIView.as_view()),
    path("system/operational-baseline-reset/", OperationalBaselineResetAPIView.as_view()),
]
