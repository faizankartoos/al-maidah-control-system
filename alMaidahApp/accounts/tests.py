from django.contrib.auth.models import User
from django.test import TestCase
from rest_framework.authtoken.models import Token
from rest_framework.test import APIClient

from .models import ensure_user_profile


class AccountsAuthTests(TestCase):

    def setUp(self):
        self.client = APIClient()
        self.admin = User.objects.create_superuser(
            username="admin",
            password="testpass123",
            email="admin@example.com",
        )
        self.staff = User.objects.create_user(
            username="staff",
            password="testpass123",
            is_active=True,
        )
        profile = ensure_user_profile(self.staff)
        profile.display_name = "Staff One"
        profile.allowed_tabs = ["MENU"]
        profile.save()

    def test_login_returns_token_and_role(self):
        response = self.client.post(
            "/api/auth/login/",
            {
                "username": "admin",
                "password": "testpass123",
            },
            format="json",
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["user"]["role"], "ADMIN")
        self.assertTrue(response.data["token"])

    def test_staff_cannot_access_reports_endpoint_without_permission(self):
        token = Token.objects.create(user=self.staff)
        self.client.credentials(HTTP_AUTHORIZATION=f"Token {token.key}")

        response = self.client.get("/api/reports/dashboard/", {
            "from_date": "2026-03-01",
            "to_date": "2026-03-30",
        })

        self.assertEqual(response.status_code, 403)

    def test_staff_cannot_access_data_endpoint_without_permission(self):
        token = Token.objects.create(user=self.staff)
        self.client.credentials(HTTP_AUTHORIZATION=f"Token {token.key}")

        response = self.client.get("/api/reports/data-insights/", {
            "from_date": "2026-03-01",
            "to_date": "2026-03-30",
        })

        self.assertEqual(response.status_code, 403)

    def test_admin_can_create_staff_account(self):
        token = Token.objects.create(user=self.admin)
        self.client.credentials(HTTP_AUTHORIZATION=f"Token {token.key}")

        response = self.client.post(
            "/api/auth/users/",
            {
                "username": "cashier",
                "display_name": "Cashier One",
                "password": "cashpass123",
                "role": "STAFF",
                "allowed_tabs": ["ORDERS", "MANAGE_ORDERS"],
                "is_active": True,
            },
            format="json",
        )

        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data["role"], "STAFF")
        self.assertEqual(set(response.data["allowed_tabs"]), {"ORDERS", "MANAGE_ORDERS"})

    def test_admin_can_delete_existing_staff_account(self):
        token = Token.objects.create(user=self.admin)
        self.client.credentials(HTTP_AUTHORIZATION=f"Token {token.key}")

        response = self.client.delete(f"/api/auth/users/{self.staff.id}/")

        self.assertEqual(response.status_code, 200)
        self.assertFalse(User.objects.filter(id=self.staff.id).exists())

    def test_current_account_cannot_be_deleted(self):
        token = Token.objects.create(user=self.admin)
        self.client.credentials(HTTP_AUTHORIZATION=f"Token {token.key}")

        response = self.client.delete(f"/api/auth/users/{self.admin.id}/")

        self.assertEqual(response.status_code, 400)
        self.assertTrue(User.objects.filter(id=self.admin.id).exists())

    def test_user_can_update_appearance_preferences(self):
        token = Token.objects.create(user=self.staff)
        self.client.credentials(HTTP_AUTHORIZATION=f"Token {token.key}")

        response = self.client.patch(
            "/api/auth/me/",
            {
                "theme_preference": "DAY",
                "font_preference": "BIG",
            },
            format="json",
        )

        self.assertEqual(response.status_code, 200)

        self.staff.refresh_from_db()
        profile = ensure_user_profile(self.staff)

        self.assertEqual(profile.theme_preference, "DAY")
        self.assertEqual(profile.font_preference, "BIG")
        self.assertEqual(response.data["theme_preference"], "DAY")
        self.assertEqual(response.data["font_preference"], "BIG")

    def test_user_can_switch_to_extended_theme_scheme(self):
        token = Token.objects.create(user=self.staff)
        self.client.credentials(HTTP_AUTHORIZATION=f"Token {token.key}")

        response = self.client.patch(
            "/api/auth/me/",
            {
                "theme_preference": "STONE",
            },
            format="json",
        )

        self.assertEqual(response.status_code, 200)

        self.staff.refresh_from_db()
        profile = ensure_user_profile(self.staff)

        self.assertEqual(profile.theme_preference, "STONE")
        self.assertEqual(response.data["theme_preference"], "STONE")
