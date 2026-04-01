from decimal import Decimal
from datetime import timedelta

from django.contrib.auth.models import User
from django.test import TestCase
from django.utils import timezone
from rest_framework.authtoken.models import Token
from rest_framework.test import APIClient

from expenses.models import Expense, ExpenseCategory
from inventory.models import Inventory, Product, StockOutLog
from ledger.models import LedgerAccount, LedgerEntry
from orders.models import Order, OrderItem, OrderPayment


class ReportsDashboardTests(TestCase):

    def setUp(self):
        self.client = APIClient()
        self.today = timezone.localdate()
        self.now = timezone.now()
        self.user = User.objects.create_superuser(
            username="reports-admin",
            password="testpass123",
            email="reports-admin@example.com",
        )
        token = Token.objects.create(user=self.user)
        self.client.credentials(HTTP_AUTHORIZATION=f"Token {token.key}")

        self._create_sales_data()
        self._create_inventory_data()
        self._create_expense_data()
        self._create_ledger_snapshot()
        self._create_live_orders()

    def _create_sales_data(self):
        self.completed_order = Order.objects.create(
            order_type="DINE_IN",
            order_status="COMPLETED",
            payment_status="PAID",
            customer_name="Rizwan",
            customer_phone="7000000001",
            completed_at=self.now,
        )
        OrderItem.objects.create(
            order=self.completed_order,
            item_name="Zinger Burger",
            quantity=2,
            price=Decimal("60.00"),
        )
        OrderPayment.objects.create(
            order=self.completed_order,
            amount=Decimal("120.00"),
            payment_type="MIXED",
            cash_amount=Decimal("70.00"),
            online_amount=Decimal("50.00"),
        )

        Order.objects.create(
            order_type="TAKEAWAY",
            order_status="CANCELLED",
            payment_status="PAID",
            customer_name="Sameer",
            customer_phone="7000000002",
            total_amount=Decimal("80.00"),
            cooked=True,
            refunded=True,
            refund_amount=Decimal("20.00"),
            cancelled_at=self.now,
        )

    def _create_inventory_data(self):
        product = Product.objects.create(
            name="Chicken Fillet",
            unit="kg",
            low_stock_threshold=Decimal("5.00"),
        )
        Inventory.objects.create(
            product=product,
            quantity=Decimal("2.00"),
            total_value=Decimal("100.00"),
        )
        StockOutLog.objects.create(
            product=product,
            quantity=Decimal("1.00"),
            reason="Kitchen Use",
            unit_cost=Decimal("50.00"),
            value_reduced=Decimal("40.00"),
        )

    def _create_expense_data(self):
        category = ExpenseCategory.objects.create(name="Utilities")
        Expense.objects.create(
            category=category,
            amount=Decimal("20.00"),
            payment_mode="upi",
            expense_date=self.today,
            description="Electricity advance",
            reference_id="UPI-1001",
        )

    def _create_ledger_snapshot(self):
        customer = LedgerAccount.objects.create(
            name="Customer Due",
            account_type="CUSTOMER",
            contact_number="7000000011",
        )
        delivery = LedgerAccount.objects.create(
            name="Adnan",
            account_type="DELIVERY",
            contact_number="7000000012",
        )

        LedgerEntry.objects.create(
            ledger_account=customer,
            amount=Decimal("90.00"),
            entry_type="CREDIT",
            payment_type="SYSTEM",
            reference="ORDER-700",
            description="Customer owes",
        )
        LedgerEntry.objects.create(
            ledger_account=delivery,
            amount=Decimal("45.00"),
            entry_type="DEBIT",
            payment_type="SYSTEM",
            reference="ORDER-701",
            description="Pending with rider",
        )

    def _create_live_orders(self):
        Order.objects.create(
            order_type="DELIVERY",
            order_status="SCHEDULED",
            payment_status="UNPAID",
            customer_name="Future Customer",
            customer_phone="7000000031",
            total_amount=Decimal("55.00"),
            scheduled_time=self.now + timedelta(hours=4),
        )
        Order.objects.create(
            order_type="DELIVERY",
            order_status="PROCESSING",
            payment_status="UNPAID",
            customer_name="Outstanding Customer",
            customer_phone="7000000032",
            total_amount=Decimal("60.00"),
        )
        Order.objects.create(
            order_type="TAKEAWAY",
            order_status="READY",
            payment_status="PAID",
            total_amount=Decimal("40.00"),
        )

    def _decimal(self, value):
        return Decimal(str(value))

    def test_sales_report_uses_completed_orders_and_current_amount_fields(self):
        response = self.client.get(
            "/api/reports/sales/",
            {
                "from_date": self.today.isoformat(),
                "to_date": self.today.isoformat(),
            },
        )

        self.assertEqual(response.status_code, 200)
        payload = response.json()

        self.assertEqual(self._decimal(payload["summary"]["gross_revenue"]), Decimal("120.00"))
        self.assertEqual(payload["summary"]["total_orders"], 1)
        self.assertEqual(payload["top_items"][0]["item_name"], "Zinger Burger")

        payment_channels = {
            row["channel"]: self._decimal(row["total_amount"])
            for row in payload["collection_channel_breakdown"]
        }
        self.assertEqual(payment_channels["CASH"], Decimal("70.00"))
        self.assertEqual(payment_channels["ONLINE"], Decimal("50.00"))

    def test_cogs_report_prefers_logged_value_reduced(self):
        response = self.client.get(
            "/api/reports/cogs/",
            {
                "from_date": self.today.isoformat(),
                "to_date": self.today.isoformat(),
            },
        )

        self.assertEqual(response.status_code, 200)
        payload = response.json()

        self.assertEqual(self._decimal(payload["summary"]["total_cogs"]), Decimal("40.00"))
        self.assertEqual(payload["reason_breakdown"][0]["reason"], "Kitchen Use")

    def test_dashboard_report_combines_profit_snapshot_and_detail_tables(self):
        response = self.client.get(
            "/api/reports/dashboard/",
            {
                "from_date": self.today.isoformat(),
                "to_date": self.today.isoformat(),
            },
        )

        self.assertEqual(response.status_code, 200)
        payload = response.json()

        self.assertEqual(self._decimal(payload["summary"]["gross_revenue"]), Decimal("120.00"))
        self.assertEqual(self._decimal(payload["summary"]["total_cogs"]), Decimal("40.00"))
        self.assertEqual(self._decimal(payload["summary"]["total_expenses"]), Decimal("20.00"))
        self.assertEqual(self._decimal(payload["summary"]["net_profit"]), Decimal("60.00"))
        self.assertEqual(self._decimal(payload["summary"]["refunds_issued"]), Decimal("20.00"))
        self.assertEqual(self._decimal(payload["summary"]["cooked_cancelled_value"]), Decimal("80.00"))

        self.assertEqual(self._decimal(payload["snapshot"]["customer_outstanding"]), Decimal("90.00"))
        self.assertEqual(self._decimal(payload["snapshot"]["delivery_pending"]), Decimal("45.00"))
        self.assertEqual(payload["snapshot"]["low_stock_count"], 1)
        self.assertEqual(payload["snapshot"]["scheduled_orders_count"], 1)
        self.assertEqual(payload["snapshot"]["processing_orders_count"], 1)
        self.assertEqual(payload["snapshot"]["ready_orders_count"], 1)

        self.assertEqual(payload["details"]["low_stock_items"][0]["product_name"], "Chicken Fillet")
        self.assertEqual(payload["details"]["recent_expenses"][0]["category_name"], "Utilities")
        self.assertEqual(payload["details"]["top_selling_items"][0]["item_name"], "Zinger Burger")
