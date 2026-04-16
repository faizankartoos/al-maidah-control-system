from django.contrib.auth.models import User
from django.db import models


TAB_PERMISSIONS = (
    ("MENU", "Menu"),
    ("ORDERS", "Orders"),
    ("MANAGE_ORDERS", "Manage Orders"),
    ("INVENTORY", "Inventory"),
    ("LEDGER", "Ledger"),
    ("EXPENSES", "Expenses"),
    ("REPORTS", "Reports"),
    ("DATA", "Data"),
    ("USER_MANAGEMENT", "User Management"),
)

SPECIAL_ACCESS_CHOICES = (
    ("COLLECT_PAYMENTS", "Collect Payments"),
)

TAB_PERMISSION_KEYS = [value for value, _label in TAB_PERMISSIONS]
SPECIAL_ACCESS_KEYS = [value for value, _label in SPECIAL_ACCESS_CHOICES]
ALL_ACCESS_KEYS = TAB_PERMISSION_KEYS + SPECIAL_ACCESS_KEYS


class UserProfile(models.Model):
    ROLE_CHOICES = (
        ("ADMIN", "Admin"),
        ("STAFF", "Staff"),
    )
    THEME_CHOICES = (
        ("NIGHT", "Night"),
        ("DAY", "Day"),
    )
    FONT_CHOICES = (
        ("SMALL", "Small"),
        ("MEDIUM", "Medium"),
        ("BIG", "Big"),
    )

    user = models.OneToOneField(
        User,
        on_delete=models.CASCADE,
        related_name="profile",
    )
    role = models.CharField(
        max_length=20,
        choices=ROLE_CHOICES,
        default="STAFF",
    )
    display_name = models.CharField(
        max_length=150,
        blank=True,
        null=True,
    )
    allowed_tabs = models.JSONField(default=list, blank=True)
    theme_preference = models.CharField(
        max_length=10,
        choices=THEME_CHOICES,
        default="NIGHT",
    )
    font_preference = models.CharField(
        max_length=10,
        choices=FONT_CHOICES,
        default="MEDIUM",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["user__username"]

    def save(self, *args, **kwargs):
        normalized_access = []

        if self.role == "ADMIN" or self.user.is_superuser:
            normalized_access = ALL_ACCESS_KEYS.copy()
        else:
            for tab in self.allowed_tabs or []:
                if tab in ALL_ACCESS_KEYS and tab not in normalized_access:
                    normalized_access.append(tab)

        self.allowed_tabs = normalized_access
        super().save(*args, **kwargs)

    @property
    def effective_role(self):
        return "ADMIN" if self.user.is_superuser or self.role == "ADMIN" else "STAFF"

    @property
    def resolved_name(self):
        if self.display_name:
            return self.display_name.strip()

        full_name = self.user.get_full_name().strip()
        if full_name:
            return full_name

        return self.user.username

    @property
    def effective_tabs(self):
        if self.effective_role == "ADMIN":
            return TAB_PERMISSION_KEYS.copy()
        return [key for key in (self.allowed_tabs or []) if key in TAB_PERMISSION_KEYS]

    @property
    def special_access(self):
        if self.effective_role == "ADMIN":
            return SPECIAL_ACCESS_KEYS.copy()
        return [key for key in (self.allowed_tabs or []) if key in SPECIAL_ACCESS_KEYS]

    def has_any_tab(self, tabs):
        if self.effective_role == "ADMIN":
            return True
        return bool(set(self.effective_tabs) & set(tabs))

    def has_special_access(self, permissions):
        if self.effective_role == "ADMIN":
            return True
        return bool(set(self.special_access) & set(permissions))

    def __str__(self):
        return f"{self.resolved_name} ({self.effective_role})"


def ensure_user_profile(user):
    profile, created = UserProfile.objects.get_or_create(
        user=user,
        defaults={
            "role": "ADMIN" if user.is_superuser else "STAFF",
            "display_name": user.get_full_name().strip() or user.username,
            "allowed_tabs": ALL_ACCESS_KEYS.copy() if user.is_superuser else [],
            "theme_preference": "NIGHT",
            "font_preference": "MEDIUM",
        },
    )

    needs_save = False

    if user.is_superuser and profile.role != "ADMIN":
        profile.role = "ADMIN"
        needs_save = True

    desired_name = profile.display_name or user.get_full_name().strip() or user.username
    if not profile.display_name and desired_name:
        profile.display_name = desired_name
        needs_save = True

    desired_tabs = ALL_ACCESS_KEYS.copy() if (user.is_superuser or profile.role == "ADMIN") else list(profile.allowed_tabs or [])
    if profile.allowed_tabs != desired_tabs:
        profile.allowed_tabs = desired_tabs
        needs_save = True

    if needs_save:
        profile.save()

    return profile
