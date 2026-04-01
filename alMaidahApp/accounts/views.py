from django.contrib.auth import authenticate
from django.contrib.auth.models import User
from rest_framework import status
from rest_framework.authentication import TokenAuthentication
from rest_framework.authtoken.models import Token
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import SPECIAL_ACCESS_CHOICES, UserProfile, TAB_PERMISSIONS, ensure_user_profile
from .permissions import AdminOnlyPermission
from .serializers import (
    LoginSerializer,
    ManagedUserSerializer,
    PreferenceSerializer,
    UserProfileSerializer,
    serialize_user_profile,
)


class LoginAPIView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = LoginSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        username = serializer.validated_data["username"]
        password = serializer.validated_data["password"]

        user = authenticate(request, username=username, password=password)

        if not user:
            return Response({"error": "Invalid username or password."}, status=status.HTTP_400_BAD_REQUEST)

        if not user.is_active:
            return Response({"error": "This account is inactive."}, status=status.HTTP_403_FORBIDDEN)

        ensure_user_profile(user)
        token, _created = Token.objects.get_or_create(user=user)

        return Response(
            {
                "token": token.key,
                "user": UserProfileSerializer(serialize_user_profile(user)).data,
            },
            status=status.HTTP_200_OK,
        )


class LogoutAPIView(APIView):
    authentication_classes = [TokenAuthentication]

    def post(self, request):
        Token.objects.filter(user=request.user).delete()
        return Response({"success": True})


class MeAPIView(APIView):
    authentication_classes = [TokenAuthentication]

    def get(self, request):
        profile = serialize_user_profile(request.user)
        payload = UserProfileSerializer(profile).data
        payload["tab_options"] = [
            {
                "value": value,
                "label": label,
            }
            for value, label in TAB_PERMISSIONS
        ]
        payload["special_access_options"] = [
            {
                "value": value,
                "label": label,
            }
            for value, label in SPECIAL_ACCESS_CHOICES
        ]
        return Response(payload)

    def patch(self, request):
        serializer = PreferenceSerializer(data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)

        profile = ensure_user_profile(request.user)

        if "theme_preference" in serializer.validated_data:
            profile.theme_preference = serializer.validated_data["theme_preference"]

        if "font_preference" in serializer.validated_data:
            profile.font_preference = serializer.validated_data["font_preference"]

        profile.save()

        return Response(UserProfileSerializer(serialize_user_profile(request.user)).data)


class ManagedUserListCreateAPIView(APIView):
    authentication_classes = [TokenAuthentication]
    permission_classes = [AdminOnlyPermission]

    def get(self, request):
        users = User.objects.order_by("username")
        data = [serialize_user_profile(user) for user in users]
        return Response(
            {
                "users": UserProfileSerializer(data, many=True).data,
                "tab_options": [
                    {
                        "value": value,
                        "label": label,
                    }
                    for value, label in TAB_PERMISSIONS
                ],
                "special_access_options": [
                    {
                        "value": value,
                        "label": label,
                    }
                    for value, label in SPECIAL_ACCESS_CHOICES
                ],
            }
        )

    def post(self, request):
        serializer = ManagedUserSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.save()
        return Response(serializer.to_representation(user), status=status.HTTP_201_CREATED)


class ManagedUserDetailAPIView(APIView):
    authentication_classes = [TokenAuthentication]
    permission_classes = [AdminOnlyPermission]

    def patch(self, request, user_id):
        try:
            user = User.objects.get(id=user_id)
        except User.DoesNotExist:
            return Response({"error": "User not found."}, status=status.HTTP_404_NOT_FOUND)

        serializer = ManagedUserSerializer(user, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        user = serializer.save()
        return Response(serializer.to_representation(user))

    def delete(self, request, user_id):
        try:
            user = User.objects.get(id=user_id)
        except User.DoesNotExist:
            return Response({"error": "User not found."}, status=status.HTTP_404_NOT_FOUND)

        if user.id == request.user.id:
            return Response(
                {"error": "You cannot delete the account you are currently using."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        target_profile = ensure_user_profile(user)

        if target_profile.effective_role == "ADMIN":
            admin_count = sum(
                1
                for profile in UserProfile.objects.select_related("user")
                if profile.effective_role == "ADMIN"
            )

            if admin_count <= 1:
                return Response(
                    {"error": "At least one admin account must remain in the system."},
                    status=status.HTTP_400_BAD_REQUEST,
                )

        user.delete()
        return Response({"success": True})
