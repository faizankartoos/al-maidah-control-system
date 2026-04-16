from decimal import Decimal
from datetime import timedelta
from unittest.mock import patch
from zoneinfo import ZoneInfo

from django.contrib.auth.models import User
from django.test import TestCase
from django.utils import timezone
from rest_framework.authtoken.models import Token
from rest_framework.test import APIClient

from expenses.models import Expense, ExpenseCategory
from inventory.models import Inventory, Product, StockOutLog, PurchaseBill, PurchaseItem
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
        self.product = Product.objects.create(
            name="Chicken Fillet",
            unit="kg",
            low_stock_threshold=Decimal("5.00"),
        )
        Inventory.objects.create(
            product=self.product,
            quantity=Decimal("2.00"),
            total_value=Decimal("100.00"),
        )

        purchase_bill = PurchaseBill.objects.create(
            supplier_name="Metro Supplier",
            bill_number="B-501",
            bill_date=self.today,
            status="CONFIRMED",
            confirmed_at=self.now - timedelta(hours=2),
        )
        PurchaseItem.objects.create(
            bill=purchase_bill,
            product=self.product,
            quantity=Decimal("3.00"),
            unit_price=Decimal("30.00"),
        )

        StockOutLog.objects.create(
            product=self.product,
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

    def test_inventory_consumption_report_returns_usage_metrics_and_timeline(self):
        earlier_day = self.today - timedelta(days=2)
        stock_out_time = timezone.now() - timedelta(days=1, hours=1)

        older_bill = PurchaseBill.objects.create(
            supplier_name="City Supplier",
            bill_number="B-502",
            bill_date=earlier_day,
            status="CONFIRMED",
            confirmed_at=timezone.now() - timedelta(days=2, hours=3),
        )
        PurchaseItem.objects.create(
            bill=older_bill,
            product=self.product,
            quantity=Decimal("4.00"),
            unit_price=Decimal("20.00"),
        )

        older_stock_out = StockOutLog.objects.create(
            product=self.product,
            quantity=Decimal("2.00"),
            reason="Prep Batch",
            unit_cost=Decimal("25.00"),
            value_reduced=Decimal("50.00"),
        )
        StockOutLog.objects.filter(id=older_stock_out.id).update(used_at=stock_out_time)

        response = self.client.get(
            "/api/reports/inventory-consumption/",
            {
                "from_date": earlier_day.isoformat(),
                "to_date": self.today.isoformat(),
                "product_id": self.product.id,
            },
        )

        self.assertEqual(response.status_code, 200)
        payload = response.json()

        self.assertEqual(payload["product"]["name"], "Chicken Fillet")
        self.assertEqual(self._decimal(payload["summary"]["total_stocked_in_qty"]), Decimal("7.00"))
        self.assertEqual(self._decimal(payload["summary"]["total_stocked_in_value"]), Decimal("170.00"))
        self.assertEqual(self._decimal(payload["summary"]["total_stocked_out_qty"]), Decimal("3.00"))
        self.assertEqual(self._decimal(payload["summary"]["total_stocked_out_value"]), Decimal("90.00"))
        self.assertEqual(self._decimal(payload["summary"]["average_daily_usage"]), Decimal("1.00"))
        self.assertEqual(self._decimal(payload["summary"]["days_per_unit_used"]), Decimal("1.00"))
        self.assertEqual(self._decimal(payload["summary"]["current_stock_cover_days"]), Decimal("2.00"))
        self.assertEqual(payload["summary"]["timeline_events_count"], 4)

        self.assertEqual(len(payload["charts"]["daily_movements"]), 3)
        self.assertEqual(payload["details"]["timeline"][0]["event_type"], "STOCK_OUT")
        self.assertTrue(
            any(event["event_type"] == "STOCK_IN" for event in payload["details"]["timeline"])
        )

    def test_inventory_consumption_report_returns_timeline_and_usage_metrics(self):
        response = self.client.get(
            "/api/reports/inventory-consumption/",
            {
                "from_date": self.today.isoformat(),
                "to_date": self.today.isoformat(),
                "product_id": self.product.id,
            },
        )

        self.assertEqual(response.status_code, 200)
        payload = response.json()

        self.assertEqual(payload["product"]["name"], "Chicken Fillet")
        self.assertEqual(self._decimal(payload["summary"]["total_stocked_in_qty"]), Decimal("3.00"))
        self.assertEqual(self._decimal(payload["summary"]["total_stocked_out_qty"]), Decimal("1.00"))
        self.assertEqual(self._decimal(payload["summary"]["average_daily_usage"]), Decimal("1.00"))
        self.assertEqual(self._decimal(payload["summary"]["days_per_unit_used"]), Decimal("1.00"))
        self.assertEqual(payload["summary"]["stock_in_events_count"], 1)
        self.assertEqual(payload["summary"]["stock_out_events_count"], 1)
        self.assertEqual(len(payload["details"]["timeline"]), 2)
        self.assertEqual(payload["details"]["timeline"][0]["event_type"], "STOCK_OUT")

    def test_data_insights_report_returns_customer_location_timing_and_insights(self):
        repeat_delivery = Order.objects.create(
            order_type="DELIVERY",
            order_status="COMPLETED",
            payment_status="PAID",
            customer_name="Rizwan",
            customer_phone="7000000001",
            delivery_address="Bahria Town, Phase 4",
            total_amount=Decimal("180.00"),
        )
        OrderItem.objects.create(
            order=repeat_delivery,
            item_name="Loaded Fries",
            quantity=2,
            price=Decimal("90.00"),
        )

        delivery_regular = Order.objects.create(
            order_type="DELIVERY",
            order_status="COMPLETED",
            payment_status="PAID",
            customer_name="Ahsan",
            customer_phone="7000000009",
            delivery_address="Bahria Town, Phase 7",
            total_amount=Decimal("220.00"),
        )
        OrderItem.objects.create(
            order=delivery_regular,
            item_name="Zinger Burger",
            quantity=2,
            price=Decimal("110.00"),
        )

        response = self.client.get(
            "/api/reports/data-insights/",
            {
                "from_date": self.today.isoformat(),
                "to_date": self.today.isoformat(),
            },
        )

        self.assertEqual(response.status_code, 200)
        payload = response.json()

        self.assertEqual(payload["date_range"]["from_date"], self.today.isoformat())
        self.assertIn("summary", payload)
        self.assertIn("charts", payload)
        self.assertIn("rankings", payload)
        self.assertIn("insights", payload)

        self.assertGreaterEqual(payload["summary"]["total_orders"], 5)
        self.assertEqual(payload["rankings"]["top_customers"][0]["phone"], "7000000001")
        self.assertTrue(payload["charts"]["location_hotspots"])
        self.assertGreaterEqual(payload["charts"]["location_hotspots"][0]["order_count"], 1)
        self.assertEqual(len(payload["charts"]["hourly_demand"]), 24)
        self.assertEqual(len(payload["charts"]["weekday_heatmap"]), 7)
        self.assertTrue(payload["charts"]["customer_favorite_items"])
        self.assertTrue(payload["insights"]["strengths"])
        self.assertTrue(payload["insights"]["missing_signals"])

    def test_data_insights_report_uses_requested_timezone_for_hour_buckets(self):
        local_tz = ZoneInfo("Asia/Kolkata")
        local_order_date = self.today
        local_order_time = timezone.datetime(
            local_order_date.year,
            local_order_date.month,
            local_order_date.day,
            17,
            30,
            tzinfo=local_tz,
        )
        utc_order_time = local_order_time.astimezone(ZoneInfo("UTC"))

        timezone_order = Order.objects.create(
            order_type="TAKEAWAY",
            order_status="COMPLETED",
            payment_status="PAID",
            customer_name="Timezone Customer",
            customer_phone="7000000055",
            total_amount=Decimal("99.00"),
            completed_at=utc_order_time,
        )
        OrderItem.objects.create(
            order=timezone_order,
            item_name="Fries",
            quantity=1,
            price=Decimal("99.00"),
        )
        Order.objects.filter(id=timezone_order.id).update(created_at=utc_order_time)

        response = self.client.get(
            "/api/reports/data-insights/",
            {
                "from_date": local_order_date.isoformat(),
                "to_date": local_order_date.isoformat(),
                "timezone": "Asia/Kolkata",
            },
        )

        self.assertEqual(response.status_code, 200)
        payload = response.json()

        hour_rows = {row["hour_label"]: row["order_count"] for row in payload["charts"]["hourly_demand"]}
        self.assertGreaterEqual(hour_rows["5PM"], 1)
        self.assertEqual(hour_rows["4AM"], 0)

    @patch("reports.services.data_insights._resolve_location_metadata")
    def test_data_insights_groups_related_delivery_addresses_into_main_area(self, mock_resolve_location_metadata):
        def fake_group(address):
            lowered = (address or "").lower()
            if "chadoora" in lowered:
                return {
                    "label": "Chadoora",
                    "latitude": 33.8905,
                    "longitude": 74.7743,
                }
            if "buchroo" in lowered:
                return {
                    "label": "Buchroo",
                    "latitude": 33.8808,
                    "longitude": 74.7682,
                }
            return None

        mock_resolve_location_metadata.side_effect = fake_group

        first_delivery = Order.objects.create(
            order_type="DELIVERY",
            order_status="COMPLETED",
            payment_status="PAID",
            customer_name="One",
            customer_phone="7000000101",
            delivery_address="Pine Lane Chadoora",
            total_amount=Decimal("100.00"),
            completed_at=self.now,
        )
        OrderItem.objects.create(
            order=first_delivery,
            item_name="Burger",
            quantity=1,
            price=Decimal("100.00"),
        )

        second_delivery = Order.objects.create(
            order_type="DELIVERY",
            order_status="COMPLETED",
            payment_status="PAID",
            customer_name="Two",
            customer_phone="7000000102",
            delivery_address="Bridge Chadoora",
            total_amount=Decimal("120.00"),
            completed_at=self.now,
        )
        OrderItem.objects.create(
            order=second_delivery,
            item_name="Pizza",
            quantity=1,
            price=Decimal("120.00"),
        )

        third_delivery = Order.objects.create(
            order_type="DELIVERY",
            order_status="COMPLETED",
            payment_status="PAID",
            customer_name="Three",
            customer_phone="7000000103",
            delivery_address="Masjid Buchroo",
            total_amount=Decimal("90.00"),
            completed_at=self.now,
        )
        OrderItem.objects.create(
            order=third_delivery,
            item_name="Fries",
            quantity=1,
            price=Decimal("90.00"),
        )

        response = self.client.get(
            "/api/reports/data-insights/",
            {
                "from_date": self.today.isoformat(),
                "to_date": self.today.isoformat(),
                "timezone": "Asia/Kolkata",
            },
        )

        self.assertEqual(response.status_code, 200)
        payload = response.json()

        hotspots = {
            row["location_label"]: row["order_count"]
            for row in payload["charts"]["location_hotspots"]
        }
        hotspot_orders = {
            row["location_label"]: row["orders"]
            for row in payload["charts"]["location_hotspots"]
        }

        self.assertEqual(hotspots["Chadoora"], 2)
        self.assertEqual(hotspots["Buchroo"], 1)
        self.assertEqual(len(hotspot_orders["Chadoora"]), 2)
        self.assertEqual(hotspot_orders["Buchroo"][0]["highlight"], "Masjid Buchroo")
