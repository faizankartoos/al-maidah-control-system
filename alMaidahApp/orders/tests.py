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
from orders.models import Area, Order, OrderItem, OrderPayment


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
        self.default_area = Area.objects.create(name="Default Area")


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

    def test_dine_in_order_can_store_optional_phone(self):

        response = self.client.post(
            "/api/orders/create/",
            data=json.dumps({
                "order_type": "DINE_IN",
                "payment_mode": "PAY_LATER",
                "phone": "9900000999",
                "name": "Walk In Guest",
                "table_number": "Table 4",
                "items": [
                    {"name": "Kahwa", "qty": 1, "price": "30.00"}
                ]
            }),
            content_type="application/json"
        )

        self.assertEqual(response.status_code, 201)

        order = Order.objects.get(id=response.json()["order_id"])
        self.assertEqual(order.customer_phone, "9900000999")
        self.assertEqual(order.customer_name, "Walk In Guest")

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
                "area_id": self.default_area.id,
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
                "area_id": self.default_area.id,
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

    def test_delivery_order_requires_area_and_stores_selected_area(self):

        delivery_boy = LedgerAccount.objects.create(
            name="Area Rider",
            account_type="DELIVERY",
            contact_number="7000000004"
        )
        area = Area.objects.create(name="Chadoora")

        missing_area_response = self.client.post(
            "/api/orders/create/",
            data=json.dumps({
                "order_type": "DELIVERY",
                "delivery_boy_id": delivery_boy.id,
                "payment_mode": "PAY_LATER",
                "phone": "9900000004",
                "name": "Customer",
                "address": "Bridge Chadoora",
                "items": [
                    {"name": "Burger", "qty": 1, "price": "50.00"}
                ]
            }),
            content_type="application/json"
        )

        self.assertEqual(missing_area_response.status_code, 400)
        self.assertEqual(missing_area_response.json()["error"], "Select area")

        response = self.client.post(
            "/api/orders/create/",
            data=json.dumps({
                "order_type": "DELIVERY",
                "delivery_boy_id": delivery_boy.id,
                "payment_mode": "PAY_LATER",
                "phone": "9900000004",
                "name": "Customer",
                "address": "Bridge Chadoora",
                "area_id": area.id,
                "items": [
                    {"name": "Burger", "qty": 1, "price": "50.00"}
                ]
            }),
            content_type="application/json"
        )

        self.assertEqual(response.status_code, 201)

        order = Order.objects.get(id=response.json()["order_id"])

        self.assertEqual(order.area, area)

    def test_delivery_order_allows_blank_address_when_area_is_selected(self):

        delivery_boy = LedgerAccount.objects.create(
            name="No Address Rider",
            account_type="DELIVERY",
            contact_number="7000000005"
        )

        response = self.client.post(
            "/api/orders/create/",
            data=json.dumps({
                "order_type": "DELIVERY",
                "delivery_boy_id": delivery_boy.id,
                "payment_mode": "PAY_LATER",
                "phone": "9900000005",
                "name": "Customer",
                "address": "",
                "area_id": self.default_area.id,
                "items": [
                    {"name": "Burger", "qty": 1, "price": "50.00"}
                ]
            }),
            content_type="application/json"
        )

        self.assertEqual(response.status_code, 201)

        order = Order.objects.get(id=response.json()["order_id"])
        self.assertEqual(order.area, self.default_area)
        self.assertEqual(order.delivery_address, None)

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
                "area_id": self.default_area.id,
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

    def test_delivery_update_requires_area(self):

        order = Order.objects.create(
            order_type="DELIVERY",
            order_status="PROCESSING",
            payment_status="UNPAID",
            customer_name="Customer",
            customer_phone="9900000109",
            delivery_address="Bridge Chadoora",
        )
        delivery_boy = LedgerAccount.objects.create(
            name="Rider",
            account_type="DELIVERY",
            contact_number="7000000199"
        )
        OrderItem.objects.create(
            order=order,
            item_name="Pizza",
            quantity=1,
            price=Decimal("50.00")
        )

        response = self.client.patch(
            f"/api/orders/{order.id}/update/",
            data=json.dumps({
                "order_type": "DELIVERY",
                "customer_name": "Customer",
                "customer_phone": "9900000109",
                "delivery_address": "Bridge Chadoora",
                "delivery_boy_id": delivery_boy.id,
                "discount": "0.00",
                "delivery_charge": "10.00",
                "items": [
                    {"name": "Pizza", "qty": 1, "price": "50.00"}
                ]
            }),
            content_type="application/json"
        )

        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()["errors"]["area_id"], "Select area")

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
                "discount": "0.00",
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
        self.assertEqual(order.total_amount, Decimal("40.00"))

    def test_update_order_rejects_discount_when_customer_history_is_too_short(self):

        order = Order.objects.create(
            order_type="TAKEAWAY",
            order_status="READY",
            payment_status="UNPAID",
            customer_name="Customer",
            customer_phone="9900000710",
        )
        OrderItem.objects.create(
            order=order,
            item_name="Tea",
            quantity=1,
            price=Decimal("300.00")
        )

        response = self.client.patch(
            f"/api/orders/{order.id}/update/",
            data=json.dumps({
                "order_type": "TAKEAWAY",
                "customer_name": "Customer",
                "customer_phone": "9900000710",
                "discount": "1.00",
                "items": [
                    {"name": "Tea", "qty": 2, "price": "300.00"}
                ]
            }),
            content_type="application/json"
        )

        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()["errors"]["discount"], "Discount not allowed for this order")

    def test_update_order_applies_loyalty_discount_amount_from_customer_history(self):

        for index in range(3):
            Order.objects.create(
                order_type="TAKEAWAY",
                order_status="COMPLETED",
                payment_status="PAID",
                customer_name="Loyal Customer",
                customer_phone="9900000711",
                total_amount=Decimal("200.00") + Decimal(str(index)),
            )

        order = Order.objects.create(
            order_type="TAKEAWAY",
            order_status="READY",
            payment_status="UNPAID",
            customer_name="Loyal Customer",
            customer_phone="9900000711",
        )
        OrderItem.objects.create(
            order=order,
            item_name="Burger",
            quantity=1,
            price=Decimal("300.00")
        )

        response = self.client.patch(
            f"/api/orders/{order.id}/update/",
            data=json.dumps({
                "order_type": "TAKEAWAY",
                "customer_name": "Loyal Customer",
                "customer_phone": "9900000711",
                "discount": "1.00",
                "items": [
                    {"name": "Burger", "qty": 2, "price": "300.00"}
                ]
            }),
            content_type="application/json"
        )

        self.assertEqual(response.status_code, 200)

        order.refresh_from_db()
        self.assertEqual(order.discount, Decimal("12.00"))
        self.assertEqual(order.total_amount, Decimal("588.00"))

    def test_delivery_update_stores_selected_area(self):

        area = Area.objects.create(name="Buchroo")
        delivery_boy = LedgerAccount.objects.create(
            name="Delivery Rider",
            account_type="DELIVERY",
            contact_number="7000000108"
        )
        order = Order.objects.create(
            order_type="DELIVERY",
            order_status="READY",
            payment_status="UNPAID",
            customer_name="Customer",
            customer_phone="9900000108",
            delivery_address="Masjid Buchroo",
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
                "order_type": "DELIVERY",
                "customer_name": "Customer",
                "customer_phone": "9900000108",
                "delivery_address": "Masjid Buchroo",
                "area_id": area.id,
                "delivery_boy_id": delivery_boy.id,
                "discount": "0.00",
                "delivery_charge": "10.00",
                "items": [
                    {"name": "Tea", "qty": 2, "price": "20.00"}
                ]
            }),
            content_type="application/json"
        )

        self.assertEqual(response.status_code, 200)

        order.refresh_from_db()
        self.assertEqual(order.area, area)

    def test_delivery_update_allows_blank_address_when_area_is_selected(self):

        area = Area.objects.create(name="Nowgam")
        delivery_boy = LedgerAccount.objects.create(
            name="Flexible Rider",
            account_type="DELIVERY",
            contact_number="7000000110"
        )
        order = Order.objects.create(
            order_type="DELIVERY",
            order_status="READY",
            payment_status="UNPAID",
            customer_name="Customer",
            customer_phone="9900000110",
            delivery_address="Near bridge",
            area=self.default_area,
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
                "order_type": "DELIVERY",
                "customer_name": "Customer",
                "customer_phone": "9900000110",
                "delivery_address": "",
                "area_id": area.id,
                "delivery_boy_id": delivery_boy.id,
                "discount": "0.00",
                "delivery_charge": "10.00",
                "items": [
                    {"name": "Tea", "qty": 2, "price": "20.00"}
                ]
            }),
            content_type="application/json"
        )

        self.assertEqual(response.status_code, 200)

        order.refresh_from_db()
        self.assertEqual(order.area, area)
        self.assertIsNone(order.delivery_address)

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
                "area_id": self.default_area.id,
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
                "area_id": self.default_area.id,
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
                "area_id": self.default_area.id,
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


class ExternalOrderAcceptanceTests(AuthenticatedOrdersAPITestCase):

    def _control_panel_headers(self):
        return {"HTTP_X_ALMAIDAH_CLIENT": "control-panel"}

    def test_external_order_can_require_acceptance_and_tracks_submitter(self):

        response = self.client.post(
            "/api/orders/create/",
            data=json.dumps({
                "order_type": "TAKEAWAY",
                "payment_mode": "PAY_LATER",
                "phone": "9900000777",
                "name": "Remote User",
                "submission_source": "EXTERNAL",
                "require_acceptance": True,
                "items": [
                    {"name": "Burger", "qty": 1, "price": "80.00"}
                ]
            }),
            content_type="application/json"
        )

        self.assertEqual(response.status_code, 201)

        order = Order.objects.get(id=response.json()["order_id"])

        self.assertEqual(order.submission_source, "EXTERNAL")
        self.assertEqual(order.acceptance_status, "PENDING")
        self.assertIsNotNone(order.submitted_by)
        self.assertEqual(order.submitted_by.username, "orders-admin")

    def test_pending_external_order_stays_out_of_normal_manage_orders_list(self):

        create_response = self.client.post(
            "/api/orders/create/",
            data=json.dumps({
                "order_type": "TAKEAWAY",
                "payment_mode": "PAY_LATER",
                "phone": "9900000778",
                "name": "Pending Customer",
                "submission_source": "EXTERNAL",
                "require_acceptance": True,
                "items": [
                    {"name": "Pizza", "qty": 1, "price": "120.00"}
                ]
            }),
            content_type="application/json"
        )

        order_id = create_response.json()["order_id"]

        filter_response = self.client.get("/api/orders/filter/?filter=ALL")
        external_response = self.client.get("/api/orders/external-requests/?decision=PENDING")

        self.assertEqual(filter_response.status_code, 200)
        self.assertEqual(external_response.status_code, 200)

        listed_ids = {row["id"] for row in filter_response.json()}
        external_ids = {row["id"] for row in external_response.json()}

        self.assertNotIn(order_id, listed_ids)
        self.assertIn(order_id, external_ids)
        pending_row = external_response.json()[0]
        self.assertEqual(pending_row["submitted_by_username"], "orders-admin")

    def test_declined_external_order_can_be_accepted_later(self):

        create_response = self.client.post(
            "/api/orders/create/",
            data=json.dumps({
                "order_type": "DELIVERY",
                "payment_mode": "PAY_LATER",
                "phone": "9900000779",
                "name": "Decision Customer",
                "address": "Nowhere",
                "area_id": self.default_area.id,
                "delivery_boy_id": LedgerAccount.objects.create(
                    name="Remote Rider",
                    account_type="DELIVERY",
                    contact_number="7000000779"
                ).id,
                "submission_source": "EXTERNAL",
                "require_acceptance": True,
                "items": [
                    {"name": "Wrap", "qty": 1, "price": "90.00"}
                ]
            }),
            content_type="application/json"
        )

        order = Order.objects.get(id=create_response.json()["order_id"])

        decline_response = self.client.post(
            f"/api/orders/{order.id}/external-decision/",
            data=json.dumps({"action": "DECLINE"}),
            content_type="application/json",
            **self._control_panel_headers()
        )

        self.assertEqual(decline_response.status_code, 200)

        order.refresh_from_db()
        self.assertEqual(order.acceptance_status, "DECLINED")

        ready_response = self.client.post(f"/api/orders/{order.id}/ready/")
        self.assertEqual(ready_response.status_code, 400)

        accept_response = self.client.post(
            f"/api/orders/{order.id}/external-decision/",
            data=json.dumps({"action": "ACCEPT"}),
            content_type="application/json",
            **self._control_panel_headers()
        )

        self.assertEqual(accept_response.status_code, 200)

        order.refresh_from_db()
        self.assertEqual(order.acceptance_status, "ACCEPTED")
        self.assertIsNotNone(order.acceptance_decided_by)
        self.assertEqual(order.acceptance_decided_by.username, "orders-admin")

        filter_response = self.client.get("/api/orders/filter/?filter=ALL")
        listed_ids = {row["id"] for row in filter_response.json()}

        self.assertIn(order.id, listed_ids)

    def test_external_delivery_requires_acceptance_does_not_assign_rider_balance_until_accepted(self):

        delivery_boy = LedgerAccount.objects.create(
            name="Acceptance Rider",
            account_type="DELIVERY",
            contact_number="7000000780"
        )

        create_response = self.client.post(
            "/api/orders/create/",
            data=json.dumps({
                "order_type": "DELIVERY",
                "payment_mode": "PAY_LATER",
                "phone": "9900000780",
                "name": "Remote Delivery",
                "address": "Acceptance Lane",
                "area_id": Area.objects.create(name="Remote Area").id,
                "delivery_boy_id": delivery_boy.id,
                "submission_source": "EXTERNAL",
                "require_acceptance": True,
                "items": [
                    {"name": "Biryani", "qty": 1, "price": "150.00"}
                ]
            }),
            content_type="application/json"
        )

        self.assertEqual(create_response.status_code, 201)

        delivery_boy.refresh_from_db()
        self.assertEqual(delivery_boy.balance, Decimal("0.00"))


class AreaLookupTests(AuthenticatedOrdersAPITestCase):

    def test_create_order_uses_saved_area_delivery_charge(self):
        area = Area.objects.create(name="Bagh", delivery_charge=Decimal("35.00"))
        delivery_boy = LedgerAccount.objects.create(
            name="Rider",
            account_type="DELIVERY",
            contact_number="7000000450",
        )

        response = self.client.post(
            "/api/orders/create/",
            data=json.dumps({
                "order_type": "DELIVERY",
                "payment_mode": "PAY_LATER",
                "delivery_boy_id": delivery_boy.id,
                "phone": "9900000450",
                "name": "Customer",
                "address": "Main road",
                "area_id": area.id,
                "delivery_charge": "0.00",
                "items": [
                    {"name": "Pizza", "qty": 1, "price": "100.00"}
                ]
            }),
            content_type="application/json"
        )

        self.assertEqual(response.status_code, 201)

        order = Order.objects.get(id=response.json()["order_id"])
        self.assertEqual(order.delivery_charge, Decimal("35.00"))
        self.assertEqual(order.total_amount, Decimal("135.00"))

    def test_area_lookup_returns_matches_for_single_letter_search(self):
        Area.objects.create(name="Chadoora")
        Area.objects.create(name="Buchroo")
        Area.objects.create(name="Nowgam")

        response = self.client.get("/api/orders/areas/?q=c")

        self.assertEqual(response.status_code, 200)
        area_names = [row["name"] for row in response.json()]
        self.assertIn("Chadoora", area_names)
        self.assertNotIn("Buchroo", area_names)

    def test_customer_lookup_returns_existing_phone_and_advance_context(self):
        LedgerAccount.objects.create(
            name="Advance Customer",
            account_type="CUSTOMER",
            contact_number="9900011111",
            opening_balance=Decimal("-120.00"),
        )

        response = self.client.get("/api/orders/customers/?q=9900")

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        matched = next(row for row in payload if row["phone"] == "9900011111")

        self.assertEqual(matched["name"], "Advance Customer")
        self.assertEqual(Decimal(str(matched["advance_available"])), Decimal("120.00"))
        self.assertTrue(matched["has_advance"])


class AdvanceApplicationTests(AuthenticatedOrdersAPITestCase):

    def test_customer_advance_is_applied_to_new_order_when_requested(self):
        customer = LedgerAccount.objects.create(
            name="Advance Customer",
            account_type="CUSTOMER",
            contact_number="9900022222",
            opening_balance=Decimal("-100.00"),
        )

        response = self.client.post(
            "/api/orders/create/",
            data=json.dumps({
                "order_type": "TAKEAWAY",
                "payment_mode": "PAY_LATER",
                "phone": "9900022222",
                "name": "Advance Customer",
                "apply_customer_advance": True,
                "items": [
                    {"name": "Pizza", "qty": 1, "price": "80.00"}
                ]
            }),
            content_type="application/json"
        )

        self.assertEqual(response.status_code, 201)

        order = Order.objects.get(id=response.json()["order_id"])
        customer.refresh_from_db()

        self.assertEqual(order.payment_status, "PAID")
        self.assertEqual(order.customer_account, customer)
        self.assertEqual(Decimal(str(response.json()["advance_applied"])), Decimal("80.00"))

        payment = order.payments.get()
        self.assertEqual(payment.payment_type, "ADVANCE")
        self.assertEqual(payment.amount, Decimal("80.00"))
        self.assertEqual(customer.balance, Decimal("-20.00"))

    def test_external_orders_that_require_acceptance_must_use_pay_later(self):

        response = self.client.post(
            "/api/orders/create/",
            data=json.dumps({
                "order_type": "TAKEAWAY",
                "payment_mode": "PAY_NOW",
                "payment_method": "CASH",
                "payment_amount": "90.00",
                "phone": "9900000781",
                "name": "Remote Paynow",
                "submission_source": "EXTERNAL",
                "require_acceptance": True,
                "items": [
                    {"name": "Wrap", "qty": 1, "price": "90.00"}
                ]
            }),
            content_type="application/json"
        )

        self.assertEqual(response.status_code, 400)
        self.assertEqual(
            response.json()["error"],
            "External orders that require acceptance must be submitted with Pay Later."
        )

    def test_remote_orders_client_cannot_accept_or_decline_external_orders(self):

        create_response = self.client.post(
            "/api/orders/create/",
            data=json.dumps({
                "order_type": "TAKEAWAY",
                "payment_mode": "PAY_LATER",
                "phone": "9900000782",
                "name": "Blocked Remote",
                "submission_source": "EXTERNAL",
                "require_acceptance": True,
                "items": [
                    {"name": "Pizza", "qty": 1, "price": "120.00"}
                ]
            }),
            content_type="application/json"
        )

        order_id = create_response.json()["order_id"]

        response = self.client.post(
            f"/api/orders/{order_id}/external-decision/",
            data=json.dumps({"action": "ACCEPT"}),
            content_type="application/json",
            HTTP_X_ALMAIDAH_CLIENT="remote-orders"
        )

        self.assertEqual(response.status_code, 403)
        self.assertEqual(
            response.json()["error"],
            "External order decisions are only allowed from the main control panel."
        )


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
                "area_id": self.default_area.id,
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

        self.assertEqual(collect_response.status_code, 400)
        self.assertEqual(
            collect_response.json()["error"],
            "Completed unpaid orders assigned to ledger must be collected from Ledger."
        )

        order.refresh_from_db()
        delivery_boy.refresh_from_db()
        order.customer_account.refresh_from_db()
        cash_drawer = get_cash_drawer()
        cash_drawer.refresh_from_db()

        self.assertEqual(order.payment_status, "UNPAID")
        self.assertEqual(delivery_boy.balance, Decimal("0.00"))
        self.assertEqual(order.customer_account.balance, Decimal("100.00"))
        self.assertEqual(cash_drawer.balance, Decimal("0.00"))

    def test_complete_unpaid_order_does_not_double_customer_balance_after_update(self):

        create_response = self.client.post(
            "/api/orders/create/",
            data=json.dumps({
                "order_type": "TAKEAWAY",
                "payment_mode": "PAY_LATER",
                "payment_method": None,
                "payment_amount": 0,
                "phone": "9900000605",
                "name": "Customer",
                "items": [
                    {"name": "Tea", "qty": 2, "price": "50.00"}
                ]
            }),
            content_type="application/json"
        )

        self.assertEqual(create_response.status_code, 201)

        order = Order.objects.get(id=create_response.json()["order_id"])

        update_response = self.client.patch(
            f"/api/orders/{order.id}/update/",
            data=json.dumps({
                "order_type": "TAKEAWAY",
                "customer_name": "Customer",
                "customer_phone": "9900000605",
                "discount": "0.00",
                "delivery_charge": "0.00",
                "items": [
                    {"name": "Tea", "qty": 2, "price": "50.00"}
                ]
            }),
            content_type="application/json"
        )

        self.assertEqual(update_response.status_code, 200)

        order.refresh_from_db()
        order.customer_account.refresh_from_db()
        self.assertEqual(order.customer_account.balance, Decimal("100.00"))

        order.order_status = "READY"
        order.save(update_fields=["order_status"])

        complete_response = self.client.post(
            f"/api/orders/{order.id}/complete/",
            data=json.dumps({
                "name": "Customer",
                "phone": "9900000605",
                "address": "",
            }),
            content_type="application/json"
        )

        self.assertEqual(complete_response.status_code, 200)

        order.refresh_from_db()
        order.customer_account.refresh_from_db()

        self.assertEqual(order.order_status, "COMPLETED")
        self.assertEqual(order.payment_status, "UNPAID")
        self.assertEqual(order.customer_account.balance, Decimal("100.00"))
        self.assertEqual(
            LedgerEntry.objects.filter(
                ledger_account=order.customer_account,
                reference=f"ORDER-{order.id}",
                entry_type="CREDIT",
            ).count(),
            1,
        )

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
                "area_id": self.default_area.id,
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
                "area_id": self.default_area.id,
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

    def test_phone_search_returns_matching_order_from_order_history(self):

        older_order = Order.objects.create(
            order_type="DELIVERY",
            order_status="COMPLETED",
            payment_status="PAID",
            customer_name="Older Customer",
            customer_phone="9900000777",
            delivery_address="Chadoora",
        )
        OrderItem.objects.create(
            order=older_order,
            item_name="Pizza",
            quantity=1,
            price=Decimal("400.00")
        )
        Order.objects.filter(pk=older_order.pk).update(
            created_at=timezone.now() - timedelta(days=14)
        )

        Order.objects.create(
            order_type="DINE_IN",
            order_status="PROCESSING",
            payment_status="UNPAID",
            customer_name="Today Customer",
            table_number="Table 7",
        )

        response = self.client.get("/api/orders/filter/?filter=ALL&search=9900000777")

        self.assertEqual(response.status_code, 200)

        results = response.json()
        self.assertEqual(len(results), 1)
        self.assertEqual(results[0]["id"], older_order.id)
        self.assertEqual(results[0]["customer_phone"], "9900000777")

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


class BulkCollectOrdersSettingsTests(AuthenticatedOrdersAPITestCase):

    def test_bulk_collect_marks_eligible_orders_paid_and_skips_ledger_managed_completed_orders(self):
        customer_account = LedgerAccount.objects.create(
            name="Customer Ledger",
            account_type="CUSTOMER",
            contact_number="9900000123",
        )

        collectible_order = Order.objects.create(
            order_type="DINE_IN",
            order_status="READY",
            payment_status="UNPAID",
            table_number="Table 5",
            subtotal=Decimal("200.00"),
            total_amount=Decimal("200.00"),
        )
        OrderItem.objects.create(
            order=collectible_order,
            item_name="Burger",
            quantity=2,
            price=Decimal("100.00"),
        )

        skipped_order = Order.objects.create(
            order_type="DELIVERY",
            order_status="COMPLETED",
            payment_status="UNPAID",
            customer_phone="9900000123",
            customer_account=customer_account,
            subtotal=Decimal("150.00"),
            total_amount=Decimal("150.00"),
        )
        OrderItem.objects.create(
            order=skipped_order,
            item_name="Pizza",
            quantity=1,
            price=Decimal("150.00"),
        )

        response = self.client.post(
            "/api/settings/collect-orders/",
            data=json.dumps(
                {
                    "from_date": timezone.localdate().isoformat(),
                    "to_date": timezone.localdate().isoformat(),
                    "payment_type": "CASH",
                }
            ),
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 200)

        collectible_order.refresh_from_db()
        skipped_order.refresh_from_db()

        self.assertEqual(collectible_order.payment_status, "PAID")
        self.assertEqual(collectible_order.payments.count(), 1)
        self.assertEqual(skipped_order.payment_status, "UNPAID")
        self.assertEqual(skipped_order.payments.count(), 0)

        payload = response.json()
        self.assertEqual(payload["summary"]["collected_count"], 1)
        self.assertEqual(payload["summary"]["skipped_count"], 1)
        self.assertEqual(
            payload["skipped_orders"][0]["reason"],
            "Completed unpaid orders assigned to ledger must be collected from Ledger.",
        )

    def test_bulk_collect_rejects_invalid_payment_mode(self):
        response = self.client.post(
            "/api/settings/collect-orders/",
            data=json.dumps(
                {
                    "from_date": timezone.localdate().isoformat(),
                    "to_date": timezone.localdate().isoformat(),
                    "payment_type": "MIXED",
                }
            ),
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()["error"], "Select a valid payment mode.")
