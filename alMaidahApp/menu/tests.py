from decimal import Decimal

from django.contrib.auth.models import User
from django.test import TestCase
from rest_framework.authtoken.models import Token
from rest_framework.test import APIClient

from .models import Menu


class MenuAPITests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_superuser(
            username="menu-admin",
            password="testpass123",
            email="menu-admin@example.com",
        )
        token = Token.objects.create(user=self.user)
        self.client.credentials(HTTP_AUTHORIZATION=f"Token {token.key}")
        self.burger = Menu.objects.create(
            name="Chicken Burger",
            category="Burgers",
            price=Decimal("180.00"),
            is_available=True,
        )
        self.pizza = Menu.objects.create(
            name="Veg Pizza",
            category="Pizza",
            price=Decimal("320.00"),
            is_available=False,
        )

    def test_create_menu_item_trims_and_validates_duplicate(self):
        response = self.client.post(
            "/api/menu/",
            {
                "name": "  chicken burger  ",
                "category": "  burgers ",
                "price": "220.00",
                "is_available": True,
            },
            format="json",
        )

        self.assertEqual(response.status_code, 400)
        self.assertIn("name", response.data)

    def test_create_menu_item_rejects_non_positive_price(self):
        response = self.client.post(
            "/api/menu/",
            {
                "name": "Cold Coffee",
                "category": "Beverages",
                "price": "0",
                "is_available": True,
            },
            format="json",
        )

        self.assertEqual(response.status_code, 400)
        self.assertIn("price", response.data)

    def test_list_filters_available_only_category_and_search(self):
        available_response = self.client.get("/api/menu/?available_only=true")
        category_response = self.client.get("/api/menu/?category=burgers")
        search_response = self.client.get("/api/menu/?search=pizza")

        self.assertEqual(available_response.status_code, 200)
        self.assertEqual(len(available_response.data), 1)
        self.assertEqual(available_response.data[0]["name"], "Chicken Burger")

        self.assertEqual(category_response.status_code, 200)
        self.assertEqual(len(category_response.data), 1)
        self.assertEqual(category_response.data[0]["category"], "Burgers")

        self.assertEqual(search_response.status_code, 200)
        self.assertEqual(len(search_response.data), 1)
        self.assertEqual(search_response.data[0]["name"], "Veg Pizza")

    def test_list_returns_menu_in_case_insensitive_alphabetical_order(self):
        Menu.objects.create(
            name="alfaham",
            category="Grill",
            price=Decimal("420.00"),
            is_available=True,
        )
        Menu.objects.create(
            name="Brownie",
            category="Desserts",
            price=Decimal("120.00"),
            is_available=True,
        )

        response = self.client.get("/api/menu/")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            [item["name"] for item in response.data],
            ["alfaham", "Brownie", "Chicken Burger", "Veg Pizza"],
        )

    def test_patch_updates_menu_item(self):
        response = self.client.patch(
            f"/api/menu/{self.burger.id}/",
            {
                "price": "195.00",
                "is_available": False,
            },
            format="json",
        )

        self.burger.refresh_from_db()

        self.assertEqual(response.status_code, 200)
        self.assertEqual(self.burger.price, Decimal("195.00"))
        self.assertFalse(self.burger.is_available)

    def test_delete_missing_menu_item_returns_404(self):
        response = self.client.delete("/api/menu/99999/")

        self.assertEqual(response.status_code, 404)
        self.assertEqual(response.data["error"], "Menu item not found.")
