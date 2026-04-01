import json
from decimal import Decimal

from django.test import TestCase

from .models import Expense, ExpenseCategory


class ExpenseApiTests(TestCase):

    def setUp(self):
        self.category = ExpenseCategory.objects.create(name="Utilities")

    def test_cash_expense_is_logged_without_touching_ledger(self):
        response = self.client.post(
            "/api/expenses/",
            data=json.dumps(
                {
                    "category": self.category.id,
                    "amount": "250.00",
                    "payment_mode": "cash",
                    "expense_date": "2026-03-30",
                    "description": "Gas refill",
                    "reference_id": "BILL-1001",
                }
            ),
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 201)
        self.assertEqual(Expense.objects.count(), 1)

    def test_non_cash_expense_does_not_change_cash_drawer(self):
        response = self.client.post(
            "/api/expenses/",
            data=json.dumps(
                {
                    "category": self.category.id,
                    "amount": "400.00",
                    "payment_mode": "upi",
                    "expense_date": "2026-03-30",
                    "description": "Online ad spend",
                }
            ),
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 201)
        self.assertEqual(Expense.objects.count(), 1)

    def test_zero_or_negative_amount_is_rejected(self):
        zero_response = self.client.post(
            "/api/expenses/",
            data=json.dumps(
                {
                    "category": self.category.id,
                    "amount": "0.00",
                    "payment_mode": "cash",
                    "expense_date": "2026-03-30",
                }
            ),
            content_type="application/json",
        )

        negative_response = self.client.post(
            "/api/expenses/",
            data=json.dumps(
                {
                    "category": self.category.id,
                    "amount": "-10.00",
                    "payment_mode": "cash",
                    "expense_date": "2026-03-30",
                }
            ),
            content_type="application/json",
        )

        self.assertEqual(zero_response.status_code, 400)
        self.assertEqual(negative_response.status_code, 400)
        self.assertEqual(Expense.objects.count(), 0)

    def test_inactive_category_cannot_be_used_for_new_expense(self):
        self.category.is_active = False
        self.category.save(update_fields=["is_active"])

        response = self.client.post(
            "/api/expenses/",
            data=json.dumps(
                {
                    "category": self.category.id,
                    "amount": "100.00",
                    "payment_mode": "cash",
                    "expense_date": "2026-03-30",
                }
            ),
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 400)
        self.assertEqual(Expense.objects.count(), 0)

    def test_expense_dashboard_returns_summary_and_filters(self):
        groceries = ExpenseCategory.objects.create(name="Groceries")

        Expense.objects.create(
            category=self.category,
            amount=Decimal("250.00"),
            payment_mode="cash",
            expense_date="2026-03-30",
            description="Gas refill",
            reference_id="UTIL-1",
        )
        Expense.objects.create(
            category=groceries,
            amount=Decimal("900.00"),
            payment_mode="upi",
            expense_date="2026-03-29",
            description="Vegetables",
            reference_id="GROC-1",
        )

        response = self.client.get(
            "/api/expenses/",
            {
                "payment_mode": "upi",
                "search": "veget",
            },
        )

        self.assertEqual(response.status_code, 200)

        data = response.json()

        self.assertEqual(data["summary"]["expense_count"], 1)
        self.assertEqual(Decimal(str(data["summary"]["total_expenses"])), Decimal("900.00"))
        self.assertEqual(data["expenses"][0]["category_name"], "Groceries")
        self.assertEqual(data["payment_mode_breakdown"][0]["payment_mode"], "upi")

    def test_category_list_can_include_inactive_and_show_stats(self):
        Expense.objects.create(
            category=self.category,
            amount=Decimal("250.00"),
            payment_mode="cash",
            expense_date="2026-03-30",
        )

        inactive_category = ExpenseCategory.objects.create(
            name="Repairs",
            is_active=False,
        )

        active_only_response = self.client.get("/api/expensescategory/")
        all_response = self.client.get("/api/expensescategory/", {"include_inactive": "1"})

        self.assertEqual(active_only_response.status_code, 200)
        self.assertEqual(all_response.status_code, 200)
        self.assertEqual(len(active_only_response.json()), 1)
        self.assertEqual(len(all_response.json()), 2)
        self.assertEqual(all_response.json()[0]["expense_count"] + all_response.json()[1]["expense_count"], 1)
        self.assertIn(
            inactive_category.name,
            {row["name"] for row in all_response.json()},
        )

    def test_category_can_be_updated(self):
        response = self.client.patch(
            f"/api/expensescategory/{self.category.id}/",
            data=json.dumps(
                {
                    "name": "Utilities & Bills",
                    "description": "Monthly spending",
                    "is_active": False,
                }
            ),
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 200)

        self.category.refresh_from_db()

        self.assertEqual(self.category.name, "Utilities & Bills")
        self.assertEqual(self.category.description, "Monthly spending")
        self.assertFalse(self.category.is_active)

    def test_expenses_report_contains_breakdowns_for_future_reports(self):
        Expense.objects.create(
            category=self.category,
            amount=Decimal("250.00"),
            payment_mode="cash",
            expense_date="2026-03-30",
            description="Gas refill",
        )
        Expense.objects.create(
            category=self.category,
            amount=Decimal("150.00"),
            payment_mode="upi",
            expense_date="2026-03-30",
            description="Utility top-up",
        )

        response = self.client.get(
            "/api/reports/expenses/",
            {
                "from_date": "2026-03-01",
                "to_date": "2026-03-31",
            },
        )

        self.assertEqual(response.status_code, 200)

        data = response.json()

        self.assertEqual(Decimal(str(data["summary"]["total_expenses"])), Decimal("400.00"))
        self.assertEqual(len(data["category_breakdown"]), 1)
        self.assertEqual(len(data["payment_mode_breakdown"]), 2)
        self.assertEqual(data["expenses"][0]["category_name"], "Utilities")
