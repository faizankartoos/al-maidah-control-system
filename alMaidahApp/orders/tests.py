import json
from decimal import Decimal
from datetime import timedelta

from django.contrib.auth.models import User
from django.test import TestCase
from django.utils import timezone
from rest_framework.authtoken.models import Token

from accounts.models import ensure_user_profile
from ledger.models import LedgerAccount, LedgerEntry
from ledger.utils import get_cash_drawer
from ledger.services import record_credit
from orders.models import Order, OrderItem, OrderPayment


class AuthenticatedOrdersAPITestCase(TestCase):

    def setUp(self):
        super().setUp()
        user = User.objects.create_superuser(
            username="orders-admin",
            password="testpass123",
            email="orders-admin@example.com",
        )
        token = Token.objects.create(user=user)
        self.client.defaults["HTTP_AUTHORIZATION"] = f"Token {token.key}"


class DeliveryOrderCreateTests(AuthenticatedOrdersAPITestCase):

    def test_pay_later_allows_null_payment_method(self):

        response = self.client.post(
            "/api/orders/create/",
            data=json.dumps({
                "scheduled_time": None,
                "guest_count": None,
                "order_type": "DINE_IN",
                "delivery_boy_id": "",
                "address": "",
                "cash_amount": 0,
                "deduct_change": False,
                "delivery_charge": "",
                "discount": "",
                "items": [
                    {"id": 64, "name": "Cheese Slide", "price": "20.00", "qty": 1}
                ],
                "name": "",
                "online_amount": 0,
                "order_note": None,
                "payment_amount": 0,
                "payment_method": None,
                "payment_mode": "PAY_LATER",
                "phone": "",
                "table_number": "Table 3",
            }),
            content_type="application/json"
        )

        self.assertEqual(response.status_code, 201)

        order = Order.objects.get(id=response.json()["order_id"])

        self.assertEqual(order.payment_status, "UNPAID")
        self.assertEqual(order.order_type, "DINE_IN")
        self.assertEqual(order.table_number, "Table 3")
        self.assertEqual(order.payments.count(), 0)

    def test_fully_paid_delivery_order_does_not_leave_balance_on_delivery_boy(self):

        delivery_boy = LedgerAccount.objects.create(
            name="Adnan",
            account_type="DELIVERY",
            contact_number="7000000001"
        )

        response = self.client.post(
            "/api/orders/create/",
            data=json.dumps({
                "order_type": "DELIVERY",
                "delivery_boy_id": delivery_boy.id,
                "payment_mode": "PAY_NOW",
                "payment_method": "CASH",
                "payment_amount": "100.00",
                "phone": "9900000001",
                "name": "Customer",
                "address": "Nowhere",
                "items": [
                    {"name": "Burger", "qty": 2, "price": "50.00"}
                ]
            }),
            content_type="application/json"
        )

        self.assertEqual(response.status_code, 201)

        delivery_boy.refresh_from_db()
        cash = get_cash_drawer()
        cash.refresh_from_db()

        order = Order.objects.get(id=response.json()["order_id"])

        self.assertEqual(order.payment_status, "PAID")
        self.assertEqual(delivery_boy.balance, Decimal("0.00"))
        self.assertEqual(cash.balance, Decimal("100.00"))

    def test_unpaid_delivery_order_assigns_balance_to_delivery_boy(self):

        delivery_boy = LedgerAccount.objects.create(
            name="Adnan",
            account_type="DELIVERY",
            contact_number="7000000003"
        )

        response = self.client.post(
            "/api/orders/create/",
            data=json.dumps({
                "order_type": "DELIVERY",
                "delivery_boy_id": delivery_boy.id,
                "payment_mode": "PAY_LATER",
                "payment_method": None,
                "payment_amount": 0,
                "phone": "9900000003",
                "name": "Customer",
                "address": "Nowhere",
                "items": [
                    {"name": "Burger", "qty": 2, "price": "50.00"}
                ]
            }),
            content_type="application/json"
        )

        self.assertEqual(response.status_code, 201)

        order = Order.objects.get(id=response.json()["order_id"])
        delivery_boy.refresh_from_db()

        self.assertEqual(order.payment_status, "UNPAID")
        self.assertEqual(delivery_boy.balance, Decimal("-100.00"))

    def test_underpayment_is_rejected_and_does_not_create_order(self):

        delivery_boy = LedgerAccount.objects.create(
            name="Bilal",
            account_type="DELIVERY",
            contact_number="7000000002"
        )

        response = self.client.post(
            "/api/orders/create/",
            data=json.dumps({
                "order_type": "DELIVERY",
                "delivery_boy_id": delivery_boy.id,
                "payment_mode": "PAY_NOW",
                "payment_method": "CASH",
                "payment_amount": "40.00",
                "phone": "9900000002",
                "name": "Customer",
                "address": "Somewhere",
                "items": [
                    {"name": "Pizza", "qty": 2, "price": "50.00"}
                ]
            }),
            content_type="application/json"
        )

        self.assertEqual(response.status_code, 400)
        self.assertEqual(Order.objects.count(), 0)
        self.assertEqual(OrderPayment.objects.count(), 0)
        self.assertEqual(get_cash_drawer().balance, Decimal("0.00"))

    def test_cash_overpayment_requires_change_confirmation_and_records_change(self):

        first_response = self.client.post(
            "/api/orders/create/",
            data=json.dumps({
                "order_type": "DINE_IN",
                "payment_mode": "PAY_NOW",
                "payment_method": "CASH",
                "payment_amount": "120.00",
                "items": [
                    {"name": "Burger", "qty": 2, "price": "50.00"}
                ]
            }),
            content_type="application/json"
        )

        self.assertEqual(first_response.status_code, 400)
        self.assertTrue(first_response.json()["requires_change_confirmation"])
        self.assertEqual(Order.objects.count(), 0)

        confirmed_response = self.client.post(
            "/api/orders/create/",
            data=json.dumps({
                "order_type": "DINE_IN",
                "payment_mode": "PAY_NOW",
                "payment_method": "CASH",
                "payment_amount": "120.00",
                "deduct_change": True,
                "items": [
                    {"name": "Burger", "qty": 2, "price": "50.00"}
                ]
            }),
            content_type="application/json"
        )

        self.assertEqual(confirmed_response.status_code, 201)

        order = Order.objects.get(id=confirmed_response.json()["order_id"])
        payment = order.payments.get()
        cash = get_cash_drawer()
        cash.refresh_from_db()

        self.assertEqual(order.payment_status, "PAID")
        self.assertEqual(payment.amount, Decimal("100.00"))
        self.assertEqual(cash.balance, Decimal("100.00"))


class OrderUpdateTests(AuthenticatedOrdersAPITestCase):

    def test_ready_order_can_be_updated(self):

        order = Order.objects.create(
            order_type="DINE_IN",
            order_status="READY",
            payment_status="UNPAID",
            table_number="T1",
        )
        OrderItem.objects.create(
            order=order,
            item_name="Tea",
            quantity=1,
            price=Decimal("20.00")
        )

        response = self.client.patch(
            f"/api/orders/{order.id}/update/",
            data=json.dumps({
                "order_type": "DINE_IN",
                "table_number": "T2",
                "discount": "5.00",
                "delivery_charge": "0.00",
                "items": [
                    {"name": "Tea", "qty": 2, "price": "20.00"}
                ]
            }),
            content_type="application/json"
        )

        self.assertEqual(response.status_code, 200)

        order.refresh_from_db()

        self.assertEqual(order.order_status, "READY")
        self.assertEqual(order.table_number, "T2")
        self.assertEqual(order.total_amount, Decimal("35.00"))

    def test_completed_order_cannot_be_updated(self):

        order = Order.objects.create(
            order_type="DINE_IN",
            order_status="COMPLETED",
            payment_status="PAID",
            table_number="T1",
        )
        OrderItem.objects.create(
            order=order,
            item_name="Tea",
            quantity=1,
            price=Decimal("20.00")
        )

        response = self.client.patch(
            f"/api/orders/{order.id}/update/",
            data=json.dumps({
                "order_type": "DINE_IN",
                "table_number": "T2",
                "discount": "0.00",
                "delivery_charge": "0.00",
                "items": [
                    {"name": "Tea", "qty": 2, "price": "20.00"}
                ]
            }),
            content_type="application/json"
        )

        self.assertEqual(response.status_code, 400)
        self.assertEqual(
            response.json()["error"],
            "Only processing or ready orders can be updated"
        )

        order.refresh_from_db()

        self.assertEqual(order.table_number, "T1")
        self.assertEqual(order.items.count(), 1)

    def test_update_order_recalculates_payment_status_and_customer_balance(self):

        order = Order.objects.create(
            order_type="TAKEAWAY",
            order_status="PROCESSING",
            payment_status="PAID",
            customer_name="Customer",
            customer_phone="9900000100",
        )
        OrderItem.objects.create(
            order=order,
            item_name="Burger",
            quantity=1,
            price=Decimal("100.00")
        )
        OrderPayment.objects.create(
            order=order,
            amount=Decimal("100.00"),
            payment_type="CASH"
        )

        response = self.client.patch(
            f"/api/orders/{order.id}/update/",
            data=json.dumps({
                "order_type": "TAKEAWAY",
                "customer_name": "Customer",
                "customer_phone": "9900000100",
                "discount": "0.00",
                "delivery_charge": "0.00",
                "items": [
                    {"name": "Burger", "qty": 2, "price": "100.00"}
                ]
            }),
            content_type="application/json"
        )

        self.assertEqual(response.status_code, 200)

        order.refresh_from_db()
        order.customer_account.refresh_from_db()

        self.assertEqual(order.total_amount, Decimal("200.00"))
        self.assertEqual(order.payment_status, "UNPAID")
        self.assertEqual(order.customer_account.balance, Decimal("100.00"))

    def test_update_order_invalid_payload_does_not_partially_save(self):

        order = Order.objects.create(
            order_type="DINE_IN",
            order_status="PROCESSING",
        )
        OrderItem.objects.create(
            order=order,
            item_name="Tea",
            quantity=1,
            price=Decimal("10.00")
        )

        response = self.client.patch(
            f"/api/orders/{order.id}/update/",
            data=json.dumps({
                "order_type": "TAKEAWAY",
                "customer_phone": "9900000200",
                "discount": "0.00",
                "delivery_charge": "0.00",
                "items": [
                    {"name": "Broken Item", "qty": 1}
                ]
            }),
            content_type="application/json"
        )

        self.assertEqual(response.status_code, 400)

        order.refresh_from_db()

        self.assertEqual(order.order_type, "DINE_IN")
        self.assertIsNone(order.customer_phone)
        self.assertEqual(order.items.count(), 1)
        self.assertEqual(order.items.first().item_name, "Tea")

    def test_update_order_rejects_empty_items(self):

        order = Order.objects.create(
            order_type="DINE_IN",
            order_status="PROCESSING",
        )
        OrderItem.objects.create(
            order=order,
            item_name="Coffee",
            quantity=1,
            price=Decimal("20.00")
        )

        response = self.client.patch(
            f"/api/orders/{order.id}/update/",
            data=json.dumps({
                "order_type": "DINE_IN",
                "discount": "0.00",
                "delivery_charge": "0.00",
                "items": []
            }),
            content_type="application/json"
        )

        self.assertEqual(response.status_code, 400)
        self.assertEqual(
            response.json()["errors"]["items"],
            "Add at least one item"
        )

        order.refresh_from_db()

        self.assertEqual(order.items.count(), 1)
        self.assertEqual(order.total_amount, Decimal("20.00"))

    def test_update_order_clears_delivery_boy_balance_when_type_changes(self):

        delivery_boy = LedgerAccount.objects.create(
            name="Adnan",
            account_type="DELIVERY",
            contact_number="7000000099"
        )

        response = self.client.post(
            "/api/orders/create/",
            data=json.dumps({
                "order_type": "DELIVERY",
                "delivery_boy_id": delivery_boy.id,
                "payment_mode": "PAY_LATER",
                "phone": "9900000300",
                "name": "Customer",
                "address": "Downtown",
                "items": [
                    {"name": "Pizza", "qty": 1, "price": "50.00"}
                ]
            }),
            content_type="application/json"
        )

        order = Order.objects.get(id=response.json()["order_id"])

        update_response = self.client.patch(
            f"/api/orders/{order.id}/update/",
            data=json.dumps({
                "order_type": "TAKEAWAY",
                "customer_name": "Customer",
                "customer_phone": "9900000300",
                "discount": "0.00",
                "delivery_charge": "0.00",
                "items": [
                    {"name": "Pizza", "qty": 1, "price": "50.00"}
                ]
            }),
            content_type="application/json"
        )

        self.assertEqual(update_response.status_code, 200)

        order.refresh_from_db()
        delivery_boy.refresh_from_db()

        self.assertEqual(order.order_type, "TAKEAWAY")
        self.assertIsNone(order.delivery_boy)
        self.assertEqual(delivery_boy.balance, Decimal("0.00"))

    def test_scheduled_dine_in_stores_guest_count_and_phone(self):

        scheduled_for = (timezone.now() + timedelta(hours=2)).replace(second=0, microsecond=0)

        response = self.client.post(
            "/api/orders/create/",
            data=json.dumps({
                "order_type": "DINE_IN",
                "payment_mode": "PAY_LATER",
                "scheduled_time": scheduled_for.isoformat(),
                "phone": "9900000400",
                "guest_count": 5,
                "items": [
                    {"name": "Kahwa", "qty": 2, "price": "30.00"}
                ]
            }),
            content_type="application/json"
        )

        self.assertEqual(response.status_code, 201)

        order = Order.objects.get(id=response.json()["order_id"])

        self.assertEqual(order.order_status, "SCHEDULED")
        self.assertEqual(order.order_type, "DINE_IN")
        self.assertEqual(order.guest_count, 5)
        self.assertEqual(order.customer_phone, "9900000400")
        self.assertIsNotNone(order.scheduled_time)

        start_response = self.client.post(f"/api/orders/{order.id}/start/")

        self.assertEqual(start_response.status_code, 200)

        order.refresh_from_db()

        self.assertEqual(order.order_status, "PROCESSING")
        self.assertEqual(order.order_type, "DINE_IN")

    def test_scheduled_orders_require_phone_for_all_types(self):

        scheduled_for = (timezone.now() + timedelta(hours=2)).replace(second=0, microsecond=0)

        takeaway_response = self.client.post(
            "/api/orders/create/",
            data=json.dumps({
                "order_type": "TAKEAWAY",
                "payment_mode": "PAY_LATER",
                "scheduled_time": scheduled_for.isoformat(),
                "items": [
                    {"name": "Tea", "qty": 1, "price": "20.00"}
                ]
            }),
            content_type="application/json"
        )

        self.assertEqual(takeaway_response.status_code, 400)
        self.assertEqual(
            takeaway_response.json()["error"],
            "Phone number required for scheduled orders"
        )

        delivery_boy = LedgerAccount.objects.create(
            name="Scheduled Rider",
            account_type="DELIVERY",
            contact_number="7000000100"
        )

        delivery_response = self.client.post(
            "/api/orders/create/",
            data=json.dumps({
                "order_type": "DELIVERY",
                "payment_mode": "PAY_LATER",
                "delivery_boy_id": delivery_boy.id,
                "scheduled_time": scheduled_for.isoformat(),
                "phone": "9900000401",
                "address": "Old Town",
                "items": [
                    {"name": "Tea", "qty": 1, "price": "20.00"}
                ]
            }),
            content_type="application/json"
        )

        self.assertEqual(delivery_response.status_code, 201)

        order = Order.objects.get(id=delivery_response.json()["order_id"])
        delivery_boy.refresh_from_db()

        self.assertEqual(order.order_status, "SCHEDULED")
        self.assertEqual(order.order_type, "DELIVERY")
        self.assertEqual(delivery_boy.balance, Decimal("0.00"))

        start_response = self.client.post(f"/api/orders/{order.id}/start/")

        self.assertEqual(start_response.status_code, 200)

        delivery_boy.refresh_from_db()
        order.refresh_from_db()

        self.assertEqual(order.order_status, "PROCESSING")
        self.assertEqual(delivery_boy.balance, Decimal("-20.00"))

    def test_scheduled_delivery_can_be_paid_now_without_hitting_delivery_boy_on_start(self):

        scheduled_for = (timezone.now() + timedelta(hours=2)).replace(second=0, microsecond=0)

        delivery_boy = LedgerAccount.objects.create(
            name="Scheduled Paid Rider",
            account_type="DELIVERY",
            contact_number="7000000101"
        )

        response = self.client.post(
            "/api/orders/create/",
            data=json.dumps({
                "order_type": "DELIVERY",
                "payment_mode": "PAY_NOW",
                "payment_method": "CASH",
                "payment_amount": "20.00",
                "delivery_boy_id": delivery_boy.id,
                "scheduled_time": scheduled_for.isoformat(),
                "phone": "9900000402",
                "address": "Airport Road",
                "items": [
                    {"name": "Tea", "qty": 1, "price": "20.00"}
                ]
            }),
            content_type="application/json"
        )

        self.assertEqual(response.status_code, 201)

        order = Order.objects.get(id=response.json()["order_id"])
        delivery_boy.refresh_from_db()
        cash_drawer = get_cash_drawer()
        cash_drawer.refresh_from_db()

        self.assertEqual(order.order_status, "SCHEDULED")
        self.assertEqual(order.payment_status, "PAID")
        self.assertEqual(delivery_boy.balance, Decimal("0.00"))
        self.assertEqual(cash_drawer.balance, Decimal("20.00"))

        start_response = self.client.post(f"/api/orders/{order.id}/start/")

        self.assertEqual(start_response.status_code, 200)

        order.refresh_from_db()
        delivery_boy.refresh_from_db()

        self.assertEqual(order.order_status, "PROCESSING")
        self.assertEqual(delivery_boy.balance, Decimal("0.00"))


class OrderCollectionTests(AuthenticatedOrdersAPITestCase):

    def test_collect_requires_special_collect_permission(self):

        order = Order.objects.create(
            order_type="TAKEAWAY",
            order_status="PROCESSING",
            payment_status="UNPAID",
            customer_name="Customer",
            customer_phone="9900000499",
        )
        OrderItem.objects.create(
            order=order,
            item_name="Tea",
            quantity=2,
            price=Decimal("50.00")
        )

        staff = User.objects.create_user(
            username="manage-only",
            password="testpass123",
            is_active=True,
        )
        profile = ensure_user_profile(staff)
        profile.display_name = "Manage Only"
        profile.role = "STAFF"
        profile.allowed_tabs = ["MANAGE_ORDERS"]
        profile.save()

        token = Token.objects.create(user=staff)
        self.client.defaults["HTTP_AUTHORIZATION"] = f"Token {token.key}"

        response = self.client.post(
            f"/api/orders/{order.id}/collect-payment/",
            data=json.dumps({
                "amount": "100.00",
                "payment_type": "CASH"
            }),
            content_type="application/json"
        )

        self.assertEqual(response.status_code, 403)

    def test_complete_unpaid_delivery_moves_balance_from_delivery_boy_to_customer(self):

        delivery_boy = LedgerAccount.objects.create(
            name="Adnan",
            account_type="DELIVERY",
            contact_number="7000000600"
        )

        create_response = self.client.post(
            "/api/orders/create/",
            data=json.dumps({
                "order_type": "DELIVERY",
                "delivery_boy_id": delivery_boy.id,
                "payment_mode": "PAY_LATER",
                "payment_method": None,
                "payment_amount": 0,
                "phone": "9900000600",
                "name": "Customer",
                "address": "Downtown",
                "items": [
                    {"name": "Tea", "qty": 2, "price": "50.00"}
                ]
            }),
            content_type="application/json"
        )

        self.assertEqual(create_response.status_code, 201)

        order = Order.objects.get(id=create_response.json()["order_id"])
        order.order_status = "READY"
        order.save(update_fields=["order_status"])

        delivery_boy.refresh_from_db()
        self.assertEqual(delivery_boy.balance, Decimal("-100.00"))

        complete_response = self.client.post(
            f"/api/orders/{order.id}/complete/",
            data=json.dumps({
                "name": "Customer",
                "phone": "9900000600",
                "address": "Downtown",
            }),
            content_type="application/json"
        )

        self.assertEqual(complete_response.status_code, 200)

        order.refresh_from_db()
        delivery_boy.refresh_from_db()
        order.customer_account.refresh_from_db()

        self.assertEqual(order.order_status, "COMPLETED")
        self.assertEqual(order.payment_status, "UNPAID")
        self.assertEqual(delivery_boy.balance, Decimal("0.00"))
        self.assertEqual(order.customer_account.balance, Decimal("100.00"))

        collect_response = self.client.post(
            f"/api/orders/{order.id}/collect-payment/",
            data=json.dumps({
                "amount": "100.00",
                "payment_type": "CASH"
            }),
            content_type="application/json"
        )

        self.assertEqual(collect_response.status_code, 200)

        order.refresh_from_db()
        delivery_boy.refresh_from_db()
        order.customer_account.refresh_from_db()
        cash_drawer = get_cash_drawer()
        cash_drawer.refresh_from_db()

        self.assertEqual(order.payment_status, "PAID")
        self.assertEqual(delivery_boy.balance, Decimal("0.00"))
        self.assertEqual(order.customer_account.balance, Decimal("0.00"))
        self.assertEqual(cash_drawer.balance, Decimal("100.00"))

    def test_collect_delivery_order_clears_delivery_boy_and_updates_cash_drawer(self):

        delivery_boy = LedgerAccount.objects.create(
            name="Adnan",
            account_type="DELIVERY",
            contact_number="7000000601"
        )

        create_response = self.client.post(
            "/api/orders/create/",
            data=json.dumps({
                "order_type": "DELIVERY",
                "delivery_boy_id": delivery_boy.id,
                "payment_mode": "PAY_LATER",
                "payment_method": None,
                "payment_amount": 0,
                "phone": "9900000601",
                "name": "Customer",
                "address": "Downtown",
                "items": [
                    {"name": "Tea", "qty": 2, "price": "50.00"}
                ]
            }),
            content_type="application/json"
        )

        self.assertEqual(create_response.status_code, 201)

        order = Order.objects.get(id=create_response.json()["order_id"])
        delivery_boy.refresh_from_db()

        self.assertEqual(delivery_boy.balance, Decimal("-100.00"))

        collect_response = self.client.post(
            f"/api/orders/{order.id}/collect-payment/",
            data=json.dumps({
                "amount": "100.00",
                "payment_type": "CASH"
            }),
            content_type="application/json"
        )

        self.assertEqual(collect_response.status_code, 200)

        delivery_boy.refresh_from_db()
        cash_drawer = get_cash_drawer()
        cash_drawer.refresh_from_db()
        order.refresh_from_db()

        self.assertEqual(order.payment_status, "PAID")
        self.assertEqual(delivery_boy.balance, Decimal("0.00"))
        self.assertEqual(cash_drawer.balance, Decimal("100.00"))

    def test_collect_requires_full_remaining_amount(self):

        order = Order.objects.create(
            order_type="TAKEAWAY",
            order_status="PROCESSING",
            payment_status="UNPAID",
            customer_name="Customer",
            customer_phone="9900000500",
        )
        OrderItem.objects.create(
            order=order,
            item_name="Tea",
            quantity=2,
            price=Decimal("50.00")
        )

        response = self.client.post(
            f"/api/orders/{order.id}/collect-payment/",
            data=json.dumps({
                "amount": "50.00",
                "payment_type": "CASH"
            }),
            content_type="application/json"
        )

        self.assertEqual(response.status_code, 400)
        self.assertEqual(order.payments.count(), 0)

    def test_collect_clears_customer_balance(self):

        customer = LedgerAccount.objects.create(
            name="Customer",
            account_type="CUSTOMER",
            contact_number="9900000600"
        )

        order = Order.objects.create(
            order_type="TAKEAWAY",
            order_status="PROCESSING",
            payment_status="UNPAID",
            customer_name="Customer",
            customer_phone="9900000600",
            customer_account=customer,
        )
        OrderItem.objects.create(
            order=order,
            item_name="Tea",
            quantity=2,
            price=Decimal("50.00")
        )

        record_credit(
            account=customer,
            amount=Decimal("100.00"),
            reference=f"ORDER-{order.id}",
            description="Customer owes for order"
        )

        response = self.client.post(
            f"/api/orders/{order.id}/collect-payment/",
            data=json.dumps({
                "amount": "100.00",
                "payment_type": "CASH"
            }),
            content_type="application/json"
        )

        self.assertEqual(response.status_code, 200)

        order.refresh_from_db()
        customer.refresh_from_db()

        self.assertEqual(order.payment_status, "PAID")
        self.assertEqual(customer.balance, Decimal("0.00"))


class CancelOrderTests(AuthenticatedOrdersAPITestCase):

    def test_cancel_paid_order_with_refund_debits_cash_drawer_and_keeps_payment_history(self):

        create_response = self.client.post(
            "/api/orders/create/",
            data=json.dumps({
                "order_type": "DINE_IN",
                "payment_mode": "PAY_NOW",
                "payment_method": "CASH",
                "payment_amount": "100.00",
                "items": [
                    {"name": "Burger", "qty": 2, "price": "50.00"}
                ]
            }),
            content_type="application/json"
        )

        self.assertEqual(create_response.status_code, 201)

        order = Order.objects.get(id=create_response.json()["order_id"])

        cancel_response = self.client.post(
            f"/api/orders/{order.id}/cancel/",
            data=json.dumps({
                "cooked": False,
                "refunded": True,
                "refund_amount": "100.00"
            }),
            content_type="application/json"
        )

        self.assertEqual(cancel_response.status_code, 200)

        order.refresh_from_db()
        cash_drawer = get_cash_drawer()
        cash_drawer.refresh_from_db()

        self.assertEqual(order.order_status, "CANCELLED")
        self.assertFalse(order.cooked)
        self.assertTrue(order.refunded)
        self.assertEqual(order.refund_amount, Decimal("100.00"))
        self.assertEqual(order.payment_status, "PAID")
        self.assertEqual(order.payments.count(), 1)
        self.assertEqual(cash_drawer.balance, Decimal("0.00"))
        self.assertEqual(
            LedgerEntry.objects.filter(reference=f"ORDER-{order.id}").count(),
            2
        )

    def test_cancel_unpaid_delivery_clears_delivery_boy_balance_without_cash_movement(self):

        delivery_boy = LedgerAccount.objects.create(
            name="Adnan",
            account_type="DELIVERY",
            contact_number="7000000700"
        )

        create_response = self.client.post(
            "/api/orders/create/",
            data=json.dumps({
                "order_type": "DELIVERY",
                "delivery_boy_id": delivery_boy.id,
                "payment_mode": "PAY_LATER",
                "payment_method": None,
                "payment_amount": 0,
                "phone": "9900000700",
                "name": "Customer",
                "address": "Downtown",
                "items": [
                    {"name": "Tea", "qty": 2, "price": "50.00"}
                ]
            }),
            content_type="application/json"
        )

        self.assertEqual(create_response.status_code, 201)

        order = Order.objects.get(id=create_response.json()["order_id"])
        delivery_boy.refresh_from_db()
        self.assertEqual(delivery_boy.balance, Decimal("-100.00"))

        cancel_response = self.client.post(
            f"/api/orders/{order.id}/cancel/",
            data=json.dumps({
                "cooked": False,
                "refunded": False,
                "refund_amount": 0
            }),
            content_type="application/json"
        )

        self.assertEqual(cancel_response.status_code, 200)

        order.refresh_from_db()
        delivery_boy.refresh_from_db()
        cash_drawer = get_cash_drawer()
        cash_drawer.refresh_from_db()

        self.assertEqual(order.order_status, "CANCELLED")
        self.assertFalse(order.cooked)
        self.assertFalse(order.refunded)
        self.assertEqual(order.refund_amount, Decimal("0.00"))
        self.assertEqual(delivery_boy.balance, Decimal("0.00"))
        self.assertEqual(cash_drawer.balance, Decimal("0.00"))

    def test_cancel_completed_unpaid_order_clears_customer_ledger_balance(self):

        order = Order.objects.create(
            order_type="TAKEAWAY",
            order_status="COMPLETED",
            payment_status="UNPAID",
            customer_name="Customer",
            customer_phone="9900000800",
        )
        OrderItem.objects.create(
            order=order,
            item_name="Tea",
            quantity=2,
            price=Decimal("50.00")
        )

        customer = LedgerAccount.objects.create(
            name="Customer",
            account_type="CUSTOMER",
            contact_number="9900000800"
        )
        order.customer_account = customer
        order.save(update_fields=["customer_account"])

        record_credit(
            account=customer,
            amount=Decimal("100.00"),
            reference=f"ORDER-{order.id}",
            description="Customer owes for order"
        )

        cancel_response = self.client.post(
            f"/api/orders/{order.id}/cancel/",
            data=json.dumps({
                "cooked": True,
                "refunded": False,
                "refund_amount": 0
            }),
            content_type="application/json"
        )

        self.assertEqual(cancel_response.status_code, 200)

        order.refresh_from_db()
        customer.refresh_from_db()

        self.assertEqual(order.order_status, "CANCELLED")
        self.assertTrue(order.cooked)
        self.assertEqual(customer.balance, Decimal("0.00"))


class OrderFilterTests(AuthenticatedOrdersAPITestCase):

    def test_order_filter_returns_delivery_address_and_item_summaries(self):

        delivery_order = Order.objects.create(
            order_type="DELIVERY",
            order_status="PROCESSING",
            payment_status="UNPAID",
            customer_phone="9900000991",
            delivery_address="Airport Road, Srinagar",
        )
        OrderItem.objects.create(
            order=delivery_order,
            item_name="Burger",
            quantity=1,
            price=Decimal("80.00")
        )

        dine_in_order = Order.objects.create(
            order_type="DINE_IN",
            order_status="PROCESSING",
            payment_status="UNPAID",
            table_number="Table 4",
        )
        OrderItem.objects.create(
            order=dine_in_order,
            item_name="Tea",
            quantity=1,
            price=Decimal("20.00")
        )
        OrderItem.objects.create(
            order=dine_in_order,
            item_name="Coffee",
            quantity=1,
            price=Decimal("30.00")
        )

        response = self.client.get("/api/orders/filter/?filter=ALL")

        self.assertEqual(response.status_code, 200)

        payload_by_id = {order["id"]: order for order in response.json()}

        self.assertEqual(
            payload_by_id[delivery_order.id]["delivery_address"],
            "Airport Road, Srinagar"
        )
        self.assertEqual(
            payload_by_id[dine_in_order.id]["items"][0]["item_name"],
            "Tea"
        )
        self.assertEqual(len(payload_by_id[dine_in_order.id]["items"]), 2)

    def test_payment_filters_include_non_processing_orders(self):

        paid_ready = Order.objects.create(
            order_type="DINE_IN",
            order_status="READY",
            payment_status="PAID",
            table_number="Table 1",
        )
        OrderItem.objects.create(
            order=paid_ready,
            item_name="Tea",
            quantity=1,
            price=Decimal("20.00")
        )

        unpaid_completed = Order.objects.create(
            order_type="TAKEAWAY",
            order_status="COMPLETED",
            payment_status="UNPAID",
            customer_phone="9900000900",
        )
        OrderItem.objects.create(
            order=unpaid_completed,
            item_name="Coffee",
            quantity=1,
            price=Decimal("30.00")
        )

        paid_response = self.client.get("/api/orders/filter/?filter=PAID")
        unpaid_response = self.client.get("/api/orders/filter/?filter=UNPAID")

        self.assertEqual(paid_response.status_code, 200)
        self.assertEqual(unpaid_response.status_code, 200)

        paid_ids = {order["id"] for order in paid_response.json()}
        unpaid_ids = {order["id"] for order in unpaid_response.json()}

        self.assertIn(paid_ready.id, paid_ids)
        self.assertIn(unpaid_completed.id, unpaid_ids)
