from datetime import date
from decimal import Decimal

from django.contrib.auth.models import User
from django.test import TestCase
from django.db.models import Sum
from rest_framework.authtoken.models import Token

from ledger.models import LedgerAccount, LedgerEntry
from ledger.services import record_credit, record_debit
from ledger.utils import get_cash_drawer
from orders.models import Order, OrderItem, OrderPayment


class AuthenticatedLedgerTestCase(TestCase):

    def setUp(self):
        super().setUp()
        self.user = User.objects.create_superuser(
            username="ledger-admin",
            password="testpass123",
            email="ledger-admin@example.com",
        )
        token = Token.objects.create(user=self.user)
        self.client.defaults["HTTP_AUTHORIZATION"] = f"Token {token.key}"


class CollectFromAccountTests(AuthenticatedLedgerTestCase):

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

    def test_collect_can_exceed_customer_outstanding_and_turn_extra_into_advance(self):
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

        self.assertEqual(response.status_code, 200)

        customer.refresh_from_db()
        self.assertEqual(customer.balance, Decimal("-20.00"))

    def test_collect_allocates_oldest_completed_orders_first(self):
        customer = LedgerAccount.objects.create(
            name="Oldest First Customer",
            account_type="CUSTOMER",
            contact_number="9999999995",
        )

        older_order = Order.objects.create(
            order_type="TAKEAWAY",
            order_status="COMPLETED",
            payment_status="UNPAID",
            customer_name="Oldest First Customer",
            customer_phone="9999999995",
            customer_account=customer,
            total_amount=Decimal("200.00"),
        )
        newer_order = Order.objects.create(
            order_type="TAKEAWAY",
            order_status="COMPLETED",
            payment_status="UNPAID",
            customer_name="Oldest First Customer",
            customer_phone="9999999995",
            customer_account=customer,
            total_amount=Decimal("200.00"),
        )

        record_credit(account=customer, amount=Decimal("200.00"), reference=f"ORDER-{older_order.id}", description="Older due")
        record_credit(account=customer, amount=Decimal("200.00"), reference=f"ORDER-{newer_order.id}", description="Newer due")

        response = self.client.post(
            "/api/ledger/collect/",
            {
                "account_id": customer.id,
                "amount": "250.00",
                "payment_type": "CASH",
            },
        )

        self.assertEqual(response.status_code, 200)

        older_order.refresh_from_db()
        newer_order.refresh_from_db()

        self.assertEqual(older_order.payment_status, "PAID")
        self.assertEqual(newer_order.payment_status, "UNPAID")
        self.assertEqual(older_order.payments.aggregate(total=Sum("amount"))["total"], Decimal("200.00"))
        self.assertEqual(newer_order.payments.aggregate(total=Sum("amount"))["total"], Decimal("50.00"))

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


class DeliveryBoyEndpointTests(AuthenticatedLedgerTestCase):

    def test_delivery_boys_endpoint_returns_all_delivery_accounts_sorted(self):
        LedgerAccount.objects.create(
            name="Zubair",
            account_type="DELIVERY",
            is_active=True,
        )
        LedgerAccount.objects.create(
            name="Adnan",
            account_type="DELIVERY",
            is_active=False,
        )

        response = self.client.get("/api/ledger/delivery-boys/")

        self.assertEqual(response.status_code, 200)
        payload = response.json()

        self.assertEqual([entry["name"] for entry in payload], ["Adnan", "Zubair"])
        self.assertFalse(payload[0]["is_active"])
        self.assertTrue(payload[1]["is_active"])

    def test_collect_updates_linked_completed_order_payment_status(self):
        customer = LedgerAccount.objects.create(
            name="Ledger Customer",
            account_type="CUSTOMER",
            contact_number="9999999996",
        )

        order = Order.objects.create(
            order_type="TAKEAWAY",
            order_status="COMPLETED",
            payment_status="UNPAID",
            customer_name="Ledger Customer",
            customer_phone="9999999996",
            customer_account=customer,
            total_amount=Decimal("100.00"),
        )

        record_credit(
            account=customer,
            amount=Decimal("100.00"),
            reference=f"ORDER-{order.id}",
            description="Customer owes for order",
        )

        response = self.client.post(
            "/api/ledger/collect/",
            {
                "account_id": customer.id,
                "amount": "100.00",
                "payment_type": "CASH",
            },
        )

        self.assertEqual(response.status_code, 200)

        order.refresh_from_db()
        customer.refresh_from_db()
        cash = get_cash_drawer()
        cash.refresh_from_db()

        self.assertEqual(order.payment_status, "PAID")
        self.assertEqual(customer.balance, Decimal("0.00"))
        self.assertEqual(cash.balance, Decimal("100.00"))
        self.assertEqual(order.payments.count(), 1)

        payment = OrderPayment.objects.get(order=order)
        self.assertEqual(payment.amount, Decimal("100.00"))
        self.assertEqual(payment.payment_type, "CASH")

    def test_delivery_boy_summary_distinguishes_pending_direct_paid_and_customer_ledger_orders(self):
        delivery_boy = LedgerAccount.objects.create(
            name="Summary Rider",
            account_type="DELIVERY",
            contact_number="7000000700",
        )
        customer = LedgerAccount.objects.create(
            name="Ledger Customer",
            account_type="CUSTOMER",
            contact_number="7000000701",
        )

        pending_order = Order.objects.create(
            order_type="DELIVERY",
            order_status="READY",
            payment_status="UNPAID",
            customer_name="Pending Rider Customer",
            customer_phone="9900000700",
            delivery_boy=delivery_boy,
            total_amount=Decimal("150.00"),
        )
        record_debit(
            account=delivery_boy,
            amount=Decimal("150.00"),
            reference=f"ORDER-{pending_order.id}",
            description="Rider owes restaurant",
        )

        direct_paid_order = Order.objects.create(
            order_type="DELIVERY",
            order_status="COMPLETED",
            payment_status="PAID",
            customer_name="Paid Rider Customer",
            customer_phone="9900000702",
            delivery_boy=delivery_boy,
            total_amount=Decimal("200.00"),
        )
        OrderPayment.objects.create(
            order=direct_paid_order,
            amount=Decimal("200.00"),
            payment_type="CASH",
            cash_amount=Decimal("200.00"),
            online_amount=Decimal("0.00"),
        )

        moved_order = Order.objects.create(
            order_type="DELIVERY",
            order_status="COMPLETED",
            payment_status="UNPAID",
            customer_name="Ledger Shifted Customer",
            customer_phone="9900000703",
            delivery_boy=delivery_boy,
            customer_account=customer,
            total_amount=Decimal("180.00"),
        )
        record_credit(
            account=customer,
            amount=Decimal("180.00"),
            reference=f"ORDER-{moved_order.id}",
            description="Customer owes after rider completion",
        )

        response = self.client.get(
            f"/api/ledger/delivery-boys/{delivery_boy.id}/summary/",
            {
                "from_date": date.today().isoformat(),
                "to_date": date.today().isoformat(),
            },
        )

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        orders_by_id = {row["id"]: row for row in payload["orders"]}

        self.assertEqual(payload["summary"]["orders_count"], 3)
        self.assertEqual(payload["summary"]["collectible_order_count"], 1)
        self.assertEqual(Decimal(str(payload["summary"]["pending_balance"])), Decimal("150.00"))
        self.assertEqual(Decimal(str(payload["summary"]["direct_paid_total"])), Decimal("200.00"))
        self.assertEqual(Decimal(str(payload["summary"]["moved_to_customer_total"])), Decimal("180.00"))

        self.assertEqual(orders_by_id[pending_order.id]["settlement_status"], "PENDING_WITH_RIDER")
        self.assertTrue(orders_by_id[pending_order.id]["can_collect_from_rider"])
        self.assertEqual(Decimal(str(orders_by_id[pending_order.id]["pending_from_rider"])), Decimal("150.00"))

        self.assertEqual(orders_by_id[direct_paid_order.id]["settlement_status"], "DIRECT_PAID")
        self.assertFalse(orders_by_id[direct_paid_order.id]["can_collect_from_rider"])

        self.assertEqual(orders_by_id[moved_order.id]["settlement_status"], "MOVED_TO_CUSTOMER_LEDGER")
        self.assertFalse(orders_by_id[moved_order.id]["can_collect_from_rider"])

    def test_bulk_collect_only_collects_orders_that_still_need_rider_settlement(self):
        delivery_boy = LedgerAccount.objects.create(
            name="Bulk Rider",
            account_type="DELIVERY",
            contact_number="7000000705",
        )
        customer = LedgerAccount.objects.create(
            name="Bulk Ledger Customer",
            account_type="CUSTOMER",
            contact_number="7000000706",
        )

        collectible_order = Order.objects.create(
            order_type="DELIVERY",
            order_status="READY",
            payment_status="UNPAID",
            customer_name="Collect Me",
            customer_phone="9900000705",
            delivery_boy=delivery_boy,
            total_amount=Decimal("120.00"),
        )
        record_debit(
            account=delivery_boy,
            amount=Decimal("120.00"),
            reference=f"ORDER-{collectible_order.id}",
            description="Rider owes restaurant",
        )

        direct_paid_order = Order.objects.create(
            order_type="DELIVERY",
            order_status="COMPLETED",
            payment_status="PAID",
            customer_name="Already Paid",
            customer_phone="9900000706",
            delivery_boy=delivery_boy,
            total_amount=Decimal("210.00"),
        )
        OrderPayment.objects.create(
            order=direct_paid_order,
            amount=Decimal("210.00"),
            payment_type="ONLINE",
            cash_amount=Decimal("0.00"),
            online_amount=Decimal("210.00"),
        )

        moved_order = Order.objects.create(
            order_type="DELIVERY",
            order_status="COMPLETED",
            payment_status="UNPAID",
            customer_name="Moved To Ledger",
            customer_phone="9900000707",
            delivery_boy=delivery_boy,
            customer_account=customer,
            total_amount=Decimal("90.00"),
        )
        record_credit(
            account=customer,
            amount=Decimal("90.00"),
            reference=f"ORDER-{moved_order.id}",
            description="Customer owes after rider completion",
        )

        response = self.client.post(
            f"/api/ledger/delivery-boys/{delivery_boy.id}/collect-all/",
            {
                "from_date": date.today().isoformat(),
                "to_date": date.today().isoformat(),
                "payment_type": "CASH",
            },
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 200)
        payload = response.json()

        self.assertEqual(payload["summary"]["collected_count"], 1)
        self.assertEqual(payload["summary"]["skipped_count"], 2)
        self.assertEqual(Decimal(str(payload["summary"]["total_collected_amount"])), Decimal("120.00"))

        collectible_order.refresh_from_db()
        delivery_boy.refresh_from_db()
        cash = get_cash_drawer()
        cash.refresh_from_db()

        self.assertEqual(collectible_order.payment_status, "PAID")
        self.assertEqual(delivery_boy.balance, Decimal("0.00"))
        self.assertEqual(cash.balance, Decimal("120.00"))
        self.assertEqual(
            OrderPayment.objects.filter(order=collectible_order).aggregate(total=Sum("amount"))["total"],
            Decimal("120.00"),
        )


class LedgerAccountApiTests(AuthenticatedLedgerTestCase):

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

    def test_can_create_customer_account_without_phone_for_manual_use(self):
        response = self.client.post(
            "/api/accounts/",
            {
                "name": "Manual Customer",
                "account_type": "CUSTOMER",
                "contact_number": "",
                "address": "Walk-in ledger use",
                "opening_balance": "0.00",
                "is_active": True,
            },
        )

        self.assertEqual(response.status_code, 201)
        account = LedgerAccount.objects.get(name="Manual Customer")
        self.assertIsNone(account.contact_number)

    def test_create_account_returns_clear_phone_error_when_number_already_exists(self):
        LedgerAccount.objects.create(
            name="Existing Customer",
            account_type="CUSTOMER",
            contact_number="7000001234",
        )

        response = self.client.post(
            "/api/accounts/",
            {
                "name": "New Customer",
                "account_type": "CUSTOMER",
                "contact_number": "7000001234",
                "opening_balance": "0.00",
                "is_active": True,
            },
        )

        self.assertEqual(response.status_code, 400)
        self.assertIn("phone number", response.json()["error"].lower())
        self.assertIn("contact_number", response.json()["errors"])
        self.assertEqual(response.json()["conflict_account"]["name"], "Existing Customer")
        self.assertEqual(response.json()["conflict_account"]["account_type"], "CUSTOMER")

    def test_create_account_duplicate_phone_error_reveals_archived_conflict(self):
        LedgerAccount.objects.create(
            name="Archived Customer",
            account_type="CUSTOMER",
            contact_number="7000005555",
            is_active=False,
        )

        response = self.client.post(
            "/api/accounts/",
            {
                "name": "Fresh Customer",
                "account_type": "CUSTOMER",
                "contact_number": "7000005555",
                "opening_balance": "0.00",
                "is_active": True,
            },
        )

        self.assertEqual(response.status_code, 400)
        self.assertIn("archived", response.json()["error"].lower())
        self.assertEqual(response.json()["conflict_account"]["name"], "Archived Customer")
        self.assertFalse(response.json()["conflict_account"]["is_active"])

    def test_create_account_duplicate_phone_error_reveals_vendor_conflict(self):
        LedgerAccount.objects.create(
            name="Metro Supplier",
            account_type="VENDOR",
            contact_number="7000007777",
        )

        response = self.client.post(
            "/api/accounts/",
            {
                "name": "Walk In Customer",
                "account_type": "CUSTOMER",
                "contact_number": "7000007777",
                "opening_balance": "0.00",
                "is_active": True,
            },
        )

        self.assertEqual(response.status_code, 400)
        self.assertIn("vendor ledger", response.json()["error"].lower())
        self.assertEqual(response.json()["conflict_account"]["name"], "Metro Supplier")
        self.assertEqual(response.json()["conflict_account"]["account_type"], "VENDOR")

    def test_create_vendor_returns_clear_duplicate_name_error(self):
        LedgerAccount.objects.create(
            name="Metro Supplier",
            account_type="VENDOR",
        )

        response = self.client.post(
            "/api/accounts/",
            {
                "name": "Metro Supplier",
                "account_type": "VENDOR",
                "opening_balance": "0.00",
                "is_active": True,
            },
        )

        self.assertEqual(response.status_code, 400)
        self.assertIn("already exists", response.json()["error"].lower())
        self.assertIn("name", response.json()["errors"])

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

    def test_can_update_account_details_and_opening_balance(self):
        customer = LedgerAccount.objects.create(
            name="Edit Me",
            account_type="CUSTOMER",
            contact_number="7000000010",
            opening_balance=Decimal("20.00"),
        )

        record_credit(
            account=customer,
            amount=Decimal("10.00"),
            reference="ORDER-9",
            description="Customer owes restaurant",
        )

        response = self.client.patch(
            f"/api/accounts/{customer.id}/",
            data={
                "name": "Edited Customer",
                "opening_balance": "35.00",
                "address": "Updated Address",
            },
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 200)

        customer.refresh_from_db()
        self.assertEqual(customer.name, "Edited Customer")
        self.assertEqual(customer.address, "Updated Address")
        self.assertEqual(customer.opening_balance, Decimal("35.00"))
        self.assertEqual(customer.balance, Decimal("45.00"))

    def test_can_clear_phone_number_during_account_edit(self):
        customer = LedgerAccount.objects.create(
            name="Clear Phone",
            account_type="CUSTOMER",
            contact_number="7000007777",
        )

        response = self.client.patch(
            f"/api/accounts/{customer.id}/",
            data={"contact_number": ""},
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 200)

        customer.refresh_from_db()
        self.assertIsNone(customer.contact_number)

    def test_cannot_change_account_type_after_creation(self):
        customer = LedgerAccount.objects.create(
            name="Type Locked",
            account_type="CUSTOMER",
            contact_number="7000000011",
        )

        response = self.client.patch(
            f"/api/accounts/{customer.id}/",
            data={"account_type": "VENDOR"},
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 400)
        self.assertIn("cannot be changed", str(response.json()).lower())

    def test_can_delete_fresh_account_without_history(self):
        vendor = LedgerAccount.objects.create(
            name="Delete Me",
            account_type="VENDOR",
        )

        response = self.client.delete(f"/api/accounts/{vendor.id}/")

        self.assertEqual(response.status_code, 204)
        self.assertFalse(LedgerAccount.objects.filter(id=vendor.id).exists())

    def test_cannot_delete_account_with_ledger_history(self):
        customer = LedgerAccount.objects.create(
            name="Busy Customer",
            account_type="CUSTOMER",
            contact_number="7000000012",
        )

        record_credit(
            account=customer,
            amount=Decimal("25.00"),
            reference="ORDER-10",
            description="Customer owes restaurant",
        )

        response = self.client.delete(f"/api/accounts/{customer.id}/")

        self.assertEqual(response.status_code, 400)
        self.assertTrue(LedgerAccount.objects.filter(id=customer.id).exists())
        self.assertIn("cannot be deleted", response.json()["error"].lower())

    def test_can_delete_account_with_linked_orders_when_no_ledger_history_exists(self):
        customer = LedgerAccount.objects.create(
            name="Detach Me",
            account_type="CUSTOMER",
            contact_number="7000000099",
        )

        order = Order.objects.create(
            order_type="TAKEAWAY",
            order_status="COMPLETED",
            payment_status="PAID",
            customer_name="Detach Me",
            customer_phone="7000000099",
            customer_account=customer,
            total_amount=Decimal("80.00"),
        )

        response = self.client.delete(f"/api/accounts/{customer.id}/")

        self.assertEqual(response.status_code, 204)
        self.assertFalse(LedgerAccount.objects.filter(id=customer.id).exists())

        order.refresh_from_db()
        self.assertIsNone(order.customer_account)

    def test_cash_drawer_cannot_be_edited_or_deleted(self):
        cash = get_cash_drawer()

        edit_response = self.client.patch(
            f"/api/accounts/{cash.id}/",
            data={"opening_balance": "10.00"},
            content_type="application/json",
        )
        delete_response = self.client.delete(f"/api/accounts/{cash.id}/")

        self.assertEqual(edit_response.status_code, 400)
        self.assertEqual(delete_response.status_code, 400)

    def test_quick_delete_requires_correct_password(self):
        account = LedgerAccount.objects.create(
            name="Protected Delete",
            account_type="VENDOR",
        )

        response = self.client.post(
            f"/api/accounts/{account.id}/quick-delete/",
            {"password": "wrong-password"},
        )

        self.assertEqual(response.status_code, 403)
        self.assertTrue(LedgerAccount.objects.filter(id=account.id).exists())

    def test_quick_delete_archives_account_with_linked_orders_and_entries(self):
        customer = LedgerAccount.objects.create(
            name="Quick Delete Customer",
            account_type="CUSTOMER",
            contact_number="7000000013",
        )

        order = Order.objects.create(
            order_type="TAKEAWAY",
            order_status="COMPLETED",
            payment_status="UNPAID",
            customer_name="Quick Delete Customer",
            customer_phone="7000000013",
            customer_account=customer,
            total_amount=Decimal("120.00"),
        )
        OrderItem.objects.create(
            order=order,
            item_name="Burger",
            quantity=2,
            price=Decimal("60.00"),
            total_price=Decimal("120.00"),
        )

        record_credit(
            account=customer,
            amount=Decimal("120.00"),
            reference=f"ORDER-{order.id}",
            description="Customer owes restaurant",
        )

        response = self.client.post(
            f"/api/accounts/{customer.id}/quick-delete/",
            {"password": "admin@almaidah"},
        )

        self.assertEqual(response.status_code, 200)
        self.assertTrue(LedgerAccount.objects.filter(id=customer.id).exists())
        customer.refresh_from_db()
        self.assertFalse(customer.is_active)
        self.assertIsNone(customer.contact_number)
        self.assertEqual(customer.archived_contact_number, "7000000013")
        self.assertTrue(Order.objects.filter(id=order.id).exists())
        order.refresh_from_db()
        self.assertIsNone(order.customer_account)
        self.assertTrue(LedgerEntry.objects.filter(reference=f"ORDER-{order.id}").exists())

        recreate_response = self.client.post(
            "/api/accounts/",
            {
                "name": "Quick Delete Customer Recreated",
                "account_type": "CUSTOMER",
                "contact_number": "7000000013",
                "opening_balance": "0.00",
                "is_active": True,
            },
        )

        self.assertEqual(recreate_response.status_code, 201)

    def test_bulk_quick_delete_processes_multiple_accounts(self):
        clean_vendor = LedgerAccount.objects.create(
            name="Bulk Delete Vendor",
            account_type="VENDOR",
        )
        customer = LedgerAccount.objects.create(
            name="Bulk Archive Customer",
            account_type="CUSTOMER",
            contact_number="7000000014",
        )

        order = Order.objects.create(
            order_type="TAKEAWAY",
            order_status="COMPLETED",
            payment_status="UNPAID",
            customer_name="Bulk Archive Customer",
            customer_phone="7000000014",
            customer_account=customer,
            total_amount=Decimal("120.00"),
        )
        OrderItem.objects.create(
            order=order,
            item_name="Burger",
            quantity=2,
            price=Decimal("60.00"),
            total_price=Decimal("120.00"),
        )

        record_credit(
            account=customer,
            amount=Decimal("120.00"),
            reference=f"ORDER-{order.id}",
            description="Customer owes restaurant",
        )

        response = self.client.post(
            "/api/accounts/bulk-quick-delete/",
            {
                "password": "admin@almaidah",
                "account_ids": [clean_vendor.id, customer.id],
            },
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 200)
        payload = response.json()

        self.assertEqual(payload["summary"]["deleted_count"], 1)
        self.assertEqual(payload["summary"]["archived_count"], 1)
        self.assertEqual(payload["summary"]["blocked_count"], 0)

        self.assertFalse(LedgerAccount.objects.filter(id=clean_vendor.id).exists())
        customer.refresh_from_db()
        self.assertFalse(customer.is_active)
        self.assertIsNone(customer.contact_number)
        self.assertEqual(customer.archived_contact_number, "7000000014")
        order.refresh_from_db()
        self.assertIsNone(order.customer_account)

    def test_archived_vendor_can_be_recreated_with_same_name_and_phone(self):
        vendor = LedgerAccount.objects.create(
            name="Metro Supplier",
            account_type="VENDOR",
            contact_number="7000008899",
        )

        record_credit(
            account=vendor,
            amount=Decimal("450.00"),
            reference="VENDOR-DUE",
            description="Vendor due",
        )

        delete_response = self.client.post(
            f"/api/accounts/{vendor.id}/quick-delete/",
            {"password": "admin@almaidah"},
        )

        self.assertEqual(delete_response.status_code, 200)

        vendor.refresh_from_db()
        self.assertFalse(vendor.is_active)
        self.assertIsNone(vendor.contact_number)
        self.assertEqual(vendor.archived_contact_number, "7000008899")

        recreate_response = self.client.post(
            "/api/accounts/",
            {
                "name": "Metro Supplier",
                "account_type": "VENDOR",
                "contact_number": "7000008899",
                "opening_balance": "0.00",
                "is_active": True,
            },
        )

        self.assertEqual(recreate_response.status_code, 201)

    def test_bulk_quick_delete_requires_password(self):
        vendor = LedgerAccount.objects.create(
            name="Protected Bulk Delete",
            account_type="VENDOR",
        )

        response = self.client.post(
            "/api/accounts/bulk-quick-delete/",
            {
                "password": "wrong-password",
                "account_ids": [vendor.id],
            },
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 403)
        self.assertTrue(LedgerAccount.objects.filter(id=vendor.id).exists())


class LedgerDailyReportTests(AuthenticatedLedgerTestCase):

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


class VendorLedgerTests(AuthenticatedLedgerTestCase):

    def test_vendor_due_and_payment_entries_can_be_recorded(self):
        vendor = LedgerAccount.objects.create(
            name="Fresh Vendor",
            account_type="VENDOR",
        )

        due_response = self.client.post(
            "/api/ledger/vendor-entry/",
            {
                "account_id": vendor.id,
                "mode": "OWE",
                "amount": "300.00",
                "note": "Invoice 12",
            },
        )

        self.assertEqual(due_response.status_code, 201)

        vendor.refresh_from_db()
        self.assertEqual(vendor.balance, Decimal("300.00"))

        pay_response = self.client.post(
            "/api/ledger/vendor-entry/",
            {
                "account_id": vendor.id,
                "mode": "PAY",
                "amount": "120.00",
                "payment_type": "CASH",
                "note": "Part payment",
            },
        )

        self.assertEqual(pay_response.status_code, 201)
        vendor.refresh_from_db()
        self.assertEqual(vendor.balance, Decimal("180.00"))

    def test_vendor_entry_can_be_undone_without_deleting_original_audit(self):
        vendor = LedgerAccount.objects.create(
            name="Undo Vendor",
            account_type="VENDOR",
        )

        create_response = self.client.post(
            "/api/ledger/vendor-entry/",
            {
                "account_id": vendor.id,
                "mode": "OWE",
                "amount": "90.00",
                "note": "Wrong entry",
            },
        )

        self.assertEqual(create_response.status_code, 201)

        original_entry = LedgerEntry.objects.get(
            ledger_account=vendor,
            reference="VENDOR-DUE",
        )

        undo_response = self.client.post(f"/api/ledger/entries/{original_entry.id}/undo/")

        self.assertEqual(undo_response.status_code, 200)

        vendor.refresh_from_db()
        self.assertEqual(vendor.balance, Decimal("0.00"))
        self.assertTrue(LedgerEntry.objects.filter(reference=f"UNDO-ENTRY-{original_entry.id}").exists())

    def test_vendor_manual_adjustment_stores_statement_metadata(self):
        vendor = LedgerAccount.objects.create(
            name="Adjustment Vendor",
            account_type="VENDOR",
        )

        response = self.client.post(
            "/api/ledger/vendor-entry/",
            {
                "account_id": vendor.id,
                "mode": "ADJUST_UP",
                "amount": "150.00",
                "entry_date": "2026-08-01",
                "document_number": "MAN-44",
                "note": "Balance correction after invoice dispute",
            },
        )

        self.assertEqual(response.status_code, 201)

        entry = LedgerEntry.objects.get(
            ledger_account=vendor,
            reference="VENDOR-ADJUST-UP",
        )

        vendor.refresh_from_db()

        self.assertEqual(vendor.balance, Decimal("150.00"))
        self.assertEqual(str(entry.entry_date), "2026-08-01")
        self.assertEqual(entry.document_number, "MAN-44")
        self.assertEqual(entry.created_by, self.user)

    def test_vendor_statement_filters_return_opening_closing_and_totals(self):
        vendor = LedgerAccount.objects.create(
            name="Statement Vendor",
            account_type="VENDOR",
        )

        record_credit(
            account=vendor,
            amount=Decimal("100.00"),
            payment_type="SYSTEM",
            reference="VENDOR-DUE",
            description="Opening vendor due",
            entry_date=date(2026, 8, 1),
            document_number="INV-1",
            created_by=self.user,
        )
        record_debit(
            account=vendor,
            amount=Decimal("25.00"),
            payment_type="CASH",
            reference="VENDOR-PAY",
            description="Part payment",
            entry_date=date(2026, 8, 3),
            document_number="PAY-1",
            created_by=self.user,
        )
        record_credit(
            account=vendor,
            amount=Decimal("40.00"),
            payment_type="SYSTEM",
            reference="VENDOR-ADJUST-UP",
            description="Manual correction",
            entry_date=date(2026, 8, 5),
            document_number="ADJ-1",
            created_by=self.user,
        )

        response = self.client.get(
            f"/api/accounts/{vendor.id}/",
            {
                "start_date": "2026-08-03",
                "end_date": "2026-08-05",
            },
        )

        self.assertEqual(response.status_code, 200)

        payload = response.json()

        self.assertEqual(Decimal(str(payload["summary"]["statement_opening_balance"])), Decimal("100.00"))
        self.assertEqual(Decimal(str(payload["summary"]["statement_closing_balance"])), Decimal("115.00"))
        self.assertEqual(Decimal(str(payload["summary"]["current_balance"])), Decimal("115.00"))
        self.assertEqual(payload["summary"]["transaction_count"], 2)
        self.assertEqual(payload["filters"]["start_date"], "2026-08-03")
        self.assertEqual(payload["filters"]["end_date"], "2026-08-05")
        self.assertEqual(Decimal(str(payload["vendor_statement"]["payments_made"])), Decimal("25.00"))
        self.assertEqual(Decimal(str(payload["vendor_statement"]["adjustments_up"])), Decimal("40.00"))
        self.assertEqual(Decimal(str(payload["vendor_statement"]["due_added"])), Decimal("0.00"))
        self.assertEqual(payload["transactions"][0]["document_number"], "PAY-1")
        self.assertEqual(payload["transactions"][1]["created_by_name"], "ledger-admin")

    def test_vendor_payment_undo_preserves_statement_fields_and_reverses_cash(self):
        vendor = LedgerAccount.objects.create(
            name="Payment Undo Vendor",
            account_type="VENDOR",
        )

        self.client.post(
            "/api/ledger/vendor-entry/",
            {
                "account_id": vendor.id,
                "mode": "OWE",
                "amount": "100.00",
                "note": "Base due",
            },
        )
        pay_response = self.client.post(
            "/api/ledger/vendor-entry/",
            {
                "account_id": vendor.id,
                "mode": "PAY",
                "amount": "40.00",
                "payment_type": "ONLINE",
                "entry_date": "2026-08-04",
                "document_number": "PAY-44",
                "note": "Bank transfer",
            },
        )

        self.assertEqual(pay_response.status_code, 201)

        payment_entry = LedgerEntry.objects.get(
            ledger_account=vendor,
            reference="VENDOR-PAY",
        )

        undo_response = self.client.post(f"/api/ledger/entries/{payment_entry.id}/undo/")

        self.assertEqual(undo_response.status_code, 200)

        vendor.refresh_from_db()

        self.assertEqual(vendor.balance, Decimal("100.00"))

        undo_entry = LedgerEntry.objects.get(
            ledger_account=vendor,
            reference=f"UNDO-ENTRY-{payment_entry.id}",
        )
        cash_undo_entry = LedgerEntry.objects.get(
            ledger_account=get_cash_drawer(),
            reference=f"UNDO-ENTRY-{payment_entry.id}",
        )

        self.assertEqual(str(undo_entry.entry_date), "2026-08-04")
        self.assertEqual(undo_entry.document_number, "PAY-44")
        self.assertEqual(undo_entry.created_by, self.user)
        self.assertEqual(str(cash_undo_entry.entry_date), "2026-08-04")
        self.assertEqual(cash_undo_entry.document_number, "PAY-44")
