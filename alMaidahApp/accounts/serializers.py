from django.contrib.auth.models import User
from rest_framework import serializers

from .models import (
    ALL_ACCESS_KEYS,
    OperationalSettings,
    SPECIAL_ACCESS_CHOICES,
    SPECIAL_ACCESS_KEYS,
    TAB_PERMISSIONS,
    TAB_PERMISSION_KEYS,
    UserProfile,
    ensure_user_profile,
)


VALID_TABS = {value for value, _label in TAB_PERMISSIONS}
VALID_SPECIAL_ACCESS = set(SPECIAL_ACCESS_KEYS)
THEME_PREFERENCE_CHOICES = (
    ("NIGHT", "Midnight Ops"),
    ("DAY", "Cafe Light"),
    ("STONE", "Stone Ledger"),
    ("CHARCOAL", "Charcoal Teal"),
)


def serialize_user_profile(user):
    profile = ensure_user_profile(user)
    return {
        "id": user.id,
        "username": user.username,
        "display_name": profile.resolved_name,
        "role": profile.effective_role,
        "allowed_tabs": profile.effective_tabs,
        "special_access": profile.special_access,
        "theme_preference": profile.theme_preference,
        "font_preference": profile.font_preference,
        "is_active": user.is_active,
        "is_superuser": user.is_superuser,
    }


def resolve_user_display_name(user):
    if not user:
        return None

    profile = getattr(user, "profile", None)
    display_name = (getattr(profile, "display_name", "") or "").strip()
    if display_name:
        return display_name

    full_name = user.get_full_name().strip()
    if full_name:
        return full_name

    return user.username


def serialize_operational_settings(settings_row: OperationalSettings):
    return {
        "reporting_start_date": settings_row.reporting_start_date,
        "inventory_last_zeroed_at": settings_row.inventory_last_zeroed_at,
        "inventory_last_zeroed_by_name": resolve_user_display_name(settings_row.inventory_last_zeroed_by),
    }


class LoginSerializer(serializers.Serializer):
    username = serializers.CharField()
    password = serializers.CharField(style={"input_type": "password"})


class UserProfileSerializer(serializers.Serializer):
    id = serializers.IntegerField(read_only=True)
    username = serializers.CharField(read_only=True)
    display_name = serializers.CharField(read_only=True)
    role = serializers.CharField(read_only=True)
    allowed_tabs = serializers.ListField(child=serializers.CharField(), read_only=True)
    special_access = serializers.ListField(child=serializers.CharField(), read_only=True)
    theme_preference = serializers.CharField(read_only=True)
    font_preference = serializers.CharField(read_only=True)
    is_active = serializers.BooleanField(read_only=True)
    is_superuser = serializers.BooleanField(read_only=True)


class OperationalSettingsSerializer(serializers.Serializer):
    reporting_start_date = serializers.DateField(allow_null=True, required=False)
    inventory_last_zeroed_at = serializers.DateTimeField(read_only=True)
    inventory_last_zeroed_by_name = serializers.CharField(read_only=True, allow_null=True)


class PreferenceSerializer(serializers.Serializer):
    theme_preference = serializers.ChoiceField(
        choices=THEME_PREFERENCE_CHOICES,
        required=False,
    )
    font_preference = serializers.ChoiceField(
        choices=UserProfile.FONT_CHOICES,
        required=False,
    )


class ManagedUserSerializer(serializers.Serializer):
    id = serializers.IntegerField(read_only=True)
    username = serializers.CharField(max_length=150)
    display_name = serializers.CharField(max_length=150)
    role = serializers.ChoiceField(choices=UserProfile.ROLE_CHOICES)
    allowed_tabs = serializers.ListField(
        child=serializers.ChoiceField(choices=TAB_PERMISSIONS),
        required=False,
        allow_empty=True,
    )
    special_access = serializers.ListField(
        child=serializers.ChoiceField(choices=SPECIAL_ACCESS_CHOICES),
        required=False,
        allow_empty=True,
    )
    password = serializers.CharField(required=False, allow_blank=False, write_only=True)
    is_active = serializers.BooleanField(default=True)

    def validate_username(self, value):
        value = value.strip()
        if not value:
            raise serializers.ValidationError("Username is required.")

        queryset = User.objects.filter(username__iexact=value)
        if self.instance:
            queryset = queryset.exclude(id=self.instance.id)

        if queryset.exists():
            raise serializers.ValidationError("This username is already in use.")

        return value

    def validate_display_name(self, value):
        value = value.strip()
        if not value:
            raise serializers.ValidationError("Display name is required.")
        return value

    def validate_allowed_tabs(self, value):
        normalized = []
        for tab in value or []:
            if tab not in VALID_TABS:
                raise serializers.ValidationError("Invalid tab permission.")
            if tab not in normalized:
                normalized.append(tab)
        return normalized

    def validate_special_access(self, value):
        normalized = []
        for permission in value or []:
            if permission not in VALID_SPECIAL_ACCESS:
                raise serializers.ValidationError("Invalid special access permission.")
            if permission not in normalized:
                normalized.append(permission)
        return normalized

    def validate(self, attrs):
        instance_profile = ensure_user_profile(self.instance) if self.instance else None
        role = attrs.get("role", getattr(instance_profile, "role", "STAFF") if instance_profile else "STAFF")
        allowed_tabs = attrs.get("allowed_tabs")
        special_access = attrs.get("special_access")

        if role == "ADMIN":
            attrs["allowed_tabs"] = TAB_PERMISSION_KEYS.copy()
            attrs["special_access"] = SPECIAL_ACCESS_KEYS.copy()
        else:
            attrs["allowed_tabs"] = allowed_tabs if allowed_tabs is not None else list(getattr(instance_profile, "effective_tabs", []) or [])
            if special_access is None:
                attrs["special_access"] = list(getattr(instance_profile, "special_access", []) or [])
            else:
                attrs["special_access"] = special_access

        if not self.instance and not attrs.get("password"):
            raise serializers.ValidationError({"password": "Password is required."})

        return attrs

    def create(self, validated_data):
        password = validated_data.pop("password")
        display_name = validated_data.pop("display_name")
        role = validated_data.pop("role")
        allowed_tabs = validated_data.pop("allowed_tabs", [])
        special_access = validated_data.pop("special_access", [])

        user = User.objects.create_user(
            username=validated_data["username"],
            password=password,
            is_active=validated_data.get("is_active", True),
        )

        profile = ensure_user_profile(user)
        profile.display_name = display_name
        profile.role = role
        profile.allowed_tabs = [*allowed_tabs, *special_access]
        profile.save()

        return user

    def update(self, instance, validated_data):
        display_name = validated_data.pop("display_name", None)
        role = validated_data.pop("role", None)
        allowed_tabs = validated_data.pop("allowed_tabs", None)
        special_access = validated_data.pop("special_access", None)
        password = validated_data.pop("password", None)

        instance.username = validated_data.get("username", instance.username)
        instance.is_active = validated_data.get("is_active", instance.is_active)

        if password:
            instance.set_password(password)

        instance.save()

        profile = ensure_user_profile(instance)

        if display_name is not None:
            profile.display_name = display_name

        if role is not None:
            profile.role = role

        if allowed_tabs is not None:
            profile.allowed_tabs = [*allowed_tabs, *(special_access if special_access is not None else profile.special_access)]
        elif special_access is not None:
            profile.allowed_tabs = [*profile.effective_tabs, *special_access]

        profile.save()

        return instance

    def to_representation(self, instance):
        return serialize_user_profile(instance)
