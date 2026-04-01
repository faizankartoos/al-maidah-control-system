from decimal import Decimal

from django.test import TestCase

from ledger.models import LedgerAccount, LedgerEntry
from ledger.services import record_credit, record_debit
from ledger.utils import get_cash_drawer
from orders.models import Order


class CollectFromAccountTests(TestCase):

    def test_collect_from_customer_reduces_customer_balance_and_increases_cash(self):
        customer = LedgerAccount.objects.create(
            name="Test Customer",
            account_type="CUSTOMER",
            contact_number="9999999999",
        )

        record_credit(
            account=customer,
            amount=Decimal("100.00"),
            reference="OPEN-BALANCE",
            description="Customer owes restaurant",
        )

        response = self.client.post(
            "/api/ledger/collect/",
            {
                "account_id": customer.id,
                "amount": "40.00",
                "payment_type": "CASH",
            },
        )

        self.assertEqual(response.status_code, 200)

        customer.refresh_from_db()
        cash = get_cash_drawer()
        cash.refresh_from_db()

        self.assertEqual(customer.balance, Decimal("60.00"))
        self.assertEqual(cash.balance, Decimal("40.00"))

        self.assertTrue(
            LedgerEntry.objects.filter(
                ledger_account=customer,
                entry_type="DEBIT",
                amount=Decimal("40.00"),
                reference="MANUAL-COLLECT",
            ).exists()
        )

    def test_collect_is_allowed_only_for_customer_accounts(self):
        delivery_boy = LedgerAccount.objects.create(
            name="Adnan",
            account_type="DELIVERY",
            contact_number="7000000001",
        )

        response = self.client.post(
            "/api/ledger/collect/",
            {
                "account_id": delivery_boy.id,
                "amount": "40.00",
                "payment_type": "CASH",
            },
        )

        self.assertEqual(response.status_code, 400)
        self.assertIn("only for customer", response.json()["error"].lower())

    def test_collect_cannot_exceed_customer_outstanding(self):
        customer = LedgerAccount.objects.create(
            name="Test Customer",
            account_type="CUSTOMER",
            contact_number="9999999998",
        )

        record_credit(
            account=customer,
            amount=Decimal("100.00"),
            reference="OPEN-BALANCE",
            description="Customer owes restaurant",
        )

        response = self.client.post(
            "/api/ledger/collect/",
            {
                "account_id": customer.id,
                "amount": "120.00",
                "payment_type": "ONLINE",
            },
        )

        self.assertEqual(response.status_code, 400)
        self.assertEqual(customer.balance, Decimal("100.00"))

    def test_collect_accepts_online_and_marks_entries_correctly(self):
        customer = LedgerAccount.objects.create(
            name="Online Customer",
            account_type="CUSTOMER",
            contact_number="9999999997",
        )

        record_credit(
            account=customer,
            amount=Decimal("200.00"),
            reference="OPEN-BALANCE",
            description="Customer owes restaurant",
        )

        response = self.client.post(
            "/api/ledger/collect/",
            {
                "account_id": customer.id,
                "amount": "50.00",
                "payment_type": "ONLINE",
            },
        )

        self.assertEqual(response.status_code, 200)

        self.assertTrue(
            LedgerEntry.objects.filter(
                ledger_account=customer,
                entry_type="DEBIT",
                payment_type="ONLINE",
                amount=Decimal("50.00"),
                reference="MANUAL-COLLECT",
            ).exists()
        )
        self.assertTrue(
            LedgerEntry.objects.filter(
                ledger_account=get_cash_drawer(),
                entry_type="CREDIT",
                payment_type="ONLINE",
                amount=Decimal("50.00"),
                reference="MANUAL-COLLECT",
            ).exists()
        )


class LedgerAccountApiTests(TestCase):

    def test_can_create_non_cash_account_from_api(self):
        response = self.client.post(
            "/api/accounts/",
            {
                "name": "Adnan",
                "account_type": "DELIVERY",
                "contact_number": "7000000002",
                "address": "Town",
                "opening_balance": "-50.00",
                "is_active": True,
            },
        )

        self.assertEqual(response.status_code, 201)
        self.assertEqual(LedgerAccount.objects.count(), 1)
        self.assertEqual(LedgerAccount.objects.get().account_type, "DELIVERY")

    def test_cash_drawer_cannot_be_created_manually(self):
        response = self.client.post(
            "/api/accounts/",
            {
                "name": "Cash Drawer",
                "account_type": "CASH",
                "opening_balance": "0.00",
                "is_active": True,
            },
        )

        self.assertEqual(response.status_code, 400)

    def test_account_detail_report_uses_account_id_and_returns_running_balance(self):
        customer = LedgerAccount.objects.create(
            name="Same Name",
            account_type="CUSTOMER",
            contact_number="1111111111",
            opening_balance=Decimal("20.00"),
        )
        other_customer = LedgerAccount.objects.create(
            name="Same Name",
            account_type="CUSTOMER",
            contact_number="2222222222",
            opening_balance=Decimal("5.00"),
        )

        record_credit(
            account=customer,
            amount=Decimal("80.00"),
            reference="ORDER-1",
            description="Customer owes restaurant",
        )
        record_debit(
            account=customer,
            amount=Decimal("30.00"),
            reference="ORDER-1",
            description="Customer paid restaurant",
        )
        record_credit(
            account=other_customer,
            amount=Decimal("10.00"),
            reference="ORDER-2",
            description="Other customer owes restaurant",
        )

        response = self.client.get(f"/api/accounts/{customer.id}/")

        self.assertEqual(response.status_code, 200)

        data = response.json()

        self.assertEqual(data["account"]["id"], customer.id)
        self.assertEqual(len(data["transactions"]), 2)
        self.assertEqual(Decimal(str(data["summary"]["current_balance"])), Decimal("70.00"))
        self.assertEqual(Decimal(str(data["transactions"][-1]["running_balance"])), Decimal("70.00"))


class LedgerDailyReportTests(TestCase):

    def test_daily_report_separates_order_collections_from_manual_collections(self):
        cash = get_cash_drawer()

        record_credit(
            account=cash,
            amount=Decimal("100.00"),
            payment_type="CASH",
            reference="ORDER-1",
            description="Order payment received",
        )
        record_credit(
            account=cash,
            amount=Decimal("50.00"),
            payment_type="ONLINE",
            reference="ORDER-2",
            description="Order payment received",
        )
        record_credit(
            account=cash,
            amount=Decimal("20.00"),
            payment_type="CASH",
            reference="MANUAL-COLLECT",
            description="Collected from old due",
        )
        record_debit(
            account=cash,
            amount=Decimal("10.00"),
            payment_type="CASH",
            reference="ORDER-1",
            description="Change returned for Order #1",
        )

        response = self.client.get("/api/daily-report/")

        self.assertEqual(response.status_code, 200)

        summary = response.json()["summary"]

        self.assertEqual(Decimal(str(summary["order_cash_collections"])), Decimal("100.00"))
        self.assertEqual(Decimal(str(summary["order_online_collections"])), Decimal("50.00"))
        self.assertEqual(Decimal(str(summary["total_manual_collections"])), Decimal("20.00"))
        self.assertEqual(Decimal(str(summary["change_given"])), Decimal("10.00"))
        self.assertEqual(Decimal(str(summary["net_cash_movement"])), Decimal("160.00"))

    def test_daily_report_includes_unpaid_orders(self):
        order = Order.objects.create(
            order_type="TAKEAWAY",
            order_status="PROCESSING",
            payment_status="UNPAID",
            customer_name="Customer",
            customer_phone="9000000000",
            total_amount=Decimal("180.00"),
        )

        response = self.client.get("/api/daily-report/")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["summary"]["unpaid_orders_count"], 1)
        self.assertEqual(response.json()["unpaid_orders"][0]["id"], order.id)
