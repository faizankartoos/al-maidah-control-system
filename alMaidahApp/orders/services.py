from django.db.models import Sum
from django.db import transaction
from decimal import Decimal
from django.utils import timezone

from ledger.services import record_credit, record_debit
from ledger.utils import get_cash_drawer, get_or_create_customer
from ledger.models import LedgerAccount

from .models import OrderPayment, Order, OrderItem


class ChangeConfirmationRequired(ValueError):

    def __init__(self, change_amount):

        self.change_amount = Decimal(str(change_amount))
        super().__init__(
            f"Confirm deduction of {self.change_amount} from the cash drawer"
        )


def get_customer_context_by_phone(phone):
    cleaned_phone = (phone or "").strip()

    if not cleaned_phone:
        return None

    customer_account = (
        LedgerAccount.objects
        .filter(account_type="CUSTOMER", contact_number=cleaned_phone)
        .first()
    )
    latest_order = (
        Order.objects
        .filter(customer_phone=cleaned_phone)
        .select_related("area")
        .order_by("-created_at", "-id")
        .first()
    )

    if not customer_account and not latest_order:
        return None

    current_balance = Decimal(str(customer_account.balance)) if customer_account else Decimal("0.00")
    advance_available = abs(current_balance) if current_balance < 0 else Decimal("0.00")

    return {
        "phone": cleaned_phone,
        "account_id": customer_account.id if customer_account else None,
        "name": (
            (customer_account.name if customer_account else None)
            or (latest_order.customer_name if latest_order else None)
            or ""
        ),
        "address": (
            (customer_account.address if customer_account else None)
            or (latest_order.delivery_address if latest_order else None)
            or ""
        ),
        "area_id": latest_order.area_id if latest_order else None,
        "area_name": latest_order.area.name if latest_order and latest_order.area else "",
        "current_balance": current_balance,
        "advance_available": advance_available,
        "has_advance": advance_available > 0,
        "has_outstanding": current_balance > 0,
    }


def apply_customer_advance_to_order(order, customer_account):
    if not customer_account:
        return Decimal("0.00")

    current_balance = Decimal(str(customer_account.balance))
    available_advance = abs(current_balance) if current_balance < 0 else Decimal("0.00")

    if available_advance <= 0:
        return Decimal("0.00")

    order.refresh_from_db()
    total_paid = order.payments.aggregate(total=Sum("amount"))["total"] or Decimal("0.00")
    remaining = Decimal(str(order.total_amount)) - Decimal(str(total_paid))

    if remaining <= 0:
        return Decimal("0.00")

    applied_amount = min(available_advance, remaining)

    record_credit(
        account=customer_account,
        amount=applied_amount,
        payment_type="SYSTEM",
        reference=f"ORDER-{order.id}",
        description=f"Customer advance adjusted on Order #{order.id}",
    )

    OrderPayment.objects.create(
        order=order,
        amount=applied_amount,
        payment_type="ADVANCE",
        cash_amount=Decimal("0.00"),
        online_amount=Decimal("0.00"),
    )

    order.customer_account = customer_account

    refreshed_paid = (total_paid + applied_amount)
    order.payment_status = "PAID" if refreshed_paid >= Decimal(str(order.total_amount)) else "UNPAID"
    order.save(update_fields=["customer_account", "payment_status"])

    return applied_amount


def _normalize_payment_breakdown(amount, payment_type, cash_amount=None, online_amount=None):

    amount = Decimal(str(amount))

    if payment_type != "MIXED":
        return amount, Decimal("0.00"), Decimal("0.00")

    cash_amount = Decimal(str(cash_amount or 0))
    online_amount = Decimal(str(online_amount or 0))

    if cash_amount < 0 or online_amount < 0:
        raise ValueError("Cash and online amounts must be zero or greater")

    if cash_amount + online_amount <= 0:
        raise ValueError("Enter a valid mixed payment amount")

    if cash_amount + online_amount != amount:
        raise ValueError("Cash and online amounts must match the collected amount")

    return amount, cash_amount, online_amount


def _resolve_full_payment(
    required_amount,
    received_amount,
    payment_type,
    *,
    cash_amount=None,
    online_amount=None,
    deduct_change=False
):

    required_amount = Decimal(str(required_amount))
    received_amount = Decimal(str(received_amount))

    if required_amount <= 0:
        raise ValueError("Order has no remaining balance")

    if received_amount <= 0:
        raise ValueError("Payment amount must be greater than zero")

    if payment_type not in {"CASH", "ONLINE", "MIXED"}:
        raise ValueError("Select a valid payment type")

    if payment_type == "MIXED":
        cash_received = Decimal(str(cash_amount or 0))
        online_received = Decimal(str(online_amount or 0))

        if cash_received < 0 or online_received < 0:
            raise ValueError("Cash and online amounts must be zero or greater")

        if cash_received + online_received != received_amount:
            raise ValueError("Cash and online amounts must match the received amount")
    elif payment_type == "CASH":
        cash_received = received_amount
        online_received = Decimal("0.00")
    else:
        cash_received = Decimal("0.00")
        online_received = received_amount

    if received_amount < required_amount:
        raise ValueError("Full payment required. Use pay later instead.")

    change_amount = received_amount - required_amount

    if payment_type == "ONLINE":
        if change_amount > 0:
            raise ValueError("Online payment cannot exceed the remaining amount")

        cash_applied = Decimal("0.00")
        online_applied = required_amount
    else:
        if change_amount > 0:
            if cash_received < change_amount:
                raise ValueError("Change can only be returned from the cash portion")

            if not deduct_change:
                raise ChangeConfirmationRequired(change_amount)

        cash_applied = cash_received - change_amount
        online_applied = online_received

    return {
        "applied_amount": required_amount,
        "received_amount": received_amount,
        "cash_received": cash_received,
        "online_received": online_received,
        "cash_applied": cash_applied,
        "online_applied": online_applied,
        "change_amount": change_amount,
    }


def _record_payment_to_cash_drawer(
    order,
    *,
    cash_received=Decimal("0.00"),
    online_received=Decimal("0.00"),
    change_amount=Decimal("0.00"),
    description
):

    cash = get_cash_drawer()

    if cash_received > 0:
        record_credit(
            account=cash,
            amount=cash_received,
            payment_type="CASH",
            reference=f"ORDER-{order.id}",
            description=description
        )

    if online_received > 0:
        record_credit(
            account=cash,
            amount=online_received,
            payment_type="ONLINE",
            reference=f"ORDER-{order.id}",
            description=description
        )

    if change_amount > 0:
        record_debit(
            account=cash,
            amount=change_amount,
            payment_type="CASH",
            reference=f"ORDER-{order.id}",
            description=f"Change returned for Order #{order.id}"
        )

    return cash


def _get_reference_balance(account, reference):

    if not account:
        return Decimal("0.00")

    credits = account.entries.filter(
        reference=reference,
        entry_type="CREDIT"
    ).aggregate(total=Sum("amount"))["total"] or Decimal("0.00")

    debits = account.entries.filter(
        reference=reference,
        entry_type="DEBIT"
    ).aggregate(total=Sum("amount"))["total"] or Decimal("0.00")

    return Decimal(str(credits)) - Decimal(str(debits))


def _set_reference_balance(
    account,
    reference,
    desired_balance,
    *,
    payment_type="SYSTEM",
    credit_description="Order balance adjusted",
    debit_description="Order balance adjusted"
):

    if not account:
        return

    desired_balance = Decimal(str(desired_balance))
    current_balance = _get_reference_balance(account, reference)
    delta = desired_balance - current_balance

    if delta > 0:
        record_credit(
            account=account,
            amount=delta,
            payment_type=payment_type,
            reference=reference,
            description=credit_description
        )
    elif delta < 0:
        record_debit(
            account=account,
            amount=abs(delta),
            payment_type=payment_type,
            reference=reference,
            description=debit_description
        )


@transaction.atomic
def sync_external_order_acceptance(order):

    if order.submission_source != "EXTERNAL":
        return order

    desired_delivery_balance = Decimal("0.00")

    if (
        order.acceptance_status == "ACCEPTED"
        and order.payment_status != "PAID"
        and order.order_type == "DELIVERY"
        and order.delivery_boy
        and order.order_status != "SCHEDULED"
    ):
        desired_delivery_balance = Decimal("0.00") - Decimal(str(order.total_amount or 0))

    if order.delivery_boy:
        _set_reference_balance(
            order.delivery_boy,
            f"ORDER-{order.id}",
            desired_delivery_balance,
            payment_type="SYSTEM",
            credit_description="External order delivery balance reduced after acceptance decision",
            debit_description="External order delivery balance increased after acceptance decision"
        )

    return order


@transaction.atomic
def update_order_details(
    order,
    *,
    order_type,
    customer_name=None,
    customer_phone=None,
    delivery_address=None,
    area=None,
    order_note=None,
    table_number=None,
    discount=Decimal("0.00"),
    delivery_charge=Decimal("0.00"),
    delivery_boy=None,
    items=None
):

    items = items or []

    reference = f"ORDER-{order.id}"
    previous_customer_account = order.customer_account
    previous_delivery_boy = order.delivery_boy

    total_paid = order.payments.aggregate(
        total=Sum("amount")
    )["total"] or Decimal("0.00")

    order.order_type = order_type
    order.customer_name = customer_name or None
    order.customer_phone = customer_phone or None
    order.delivery_address = delivery_address or None
    order.area = area
    order.order_note = order_note or None
    order.discount = discount
    order.delivery_charge = delivery_charge
    order.table_number = table_number or None
    order.delivery_boy = delivery_boy

    if order_type == "DINE_IN":
        order.delivery_address = None
        order.area = None
        order.delivery_charge = Decimal("0.00")
        order.delivery_boy = None
    elif order_type == "TAKEAWAY":
        order.delivery_address = None
        order.area = None
        order.delivery_charge = Decimal("0.00")
        order.delivery_boy = None
        order.table_number = None
    elif order_type == "DELIVERY":
        order.table_number = None

    order.save(update_fields=[
        "order_type",
        "customer_name",
        "customer_phone",
        "delivery_address",
        "area",
        "order_note",
        "discount",
        "delivery_charge",
        "table_number",
        "delivery_boy",
    ])

    order.items.all().delete()

    OrderItem.objects.bulk_create([
        OrderItem(
            order=order,
            item_name=item["name"],
            quantity=item["qty"],
            price=item["price"],
            total_price=item["qty"] * item["price"]
        )
        for item in items
    ])

    order.update_totals()

    outstanding = order.total_amount - total_paid

    if outstanding < 0:
        outstanding = Decimal("0.00")

    if total_paid >= order.total_amount:
        payment_status = "PAID"
    else:
        payment_status = "UNPAID"

    next_customer_account = None

    if outstanding > 0:
        if order.customer_phone:
            next_customer_account = get_or_create_customer(
                name=order.customer_name or "Customer",
                contact_number=order.customer_phone,
                address=order.delivery_address
            )

            customer_updates = []

            if order.customer_name and next_customer_account.name != order.customer_name:
                next_customer_account.name = order.customer_name
                customer_updates.append("name")

            if next_customer_account.address != order.delivery_address:
                next_customer_account.address = order.delivery_address
                customer_updates.append("address")

            if customer_updates:
                next_customer_account.save(update_fields=customer_updates)
        elif previous_customer_account:
            next_customer_account = previous_customer_account

    if previous_customer_account and previous_customer_account != next_customer_account:
        _set_reference_balance(
            previous_customer_account,
            reference,
            Decimal("0.00"),
            payment_type="SYSTEM",
            credit_description="Order balance moved after update",
            debit_description="Order balance cleared after update"
        )

    if next_customer_account:
        _set_reference_balance(
            next_customer_account,
            reference,
            outstanding,
            payment_type="SYSTEM",
            credit_description="Order balance increased after update",
            debit_description="Order balance reduced after update"
        )

    desired_delivery_balance = Decimal("0.00")

    if (
        order.order_type == "DELIVERY"
        and order.delivery_boy
        and outstanding > 0
        and order.order_status != "SCHEDULED"
    ):
        desired_delivery_balance = Decimal("0.00") - outstanding

    if previous_delivery_boy and previous_delivery_boy != order.delivery_boy:
        _set_reference_balance(
            previous_delivery_boy,
            reference,
            Decimal("0.00"),
            payment_type="SYSTEM",
            credit_description="Delivery assignment cleared after update",
            debit_description="Delivery balance cleared after update"
        )

    if order.delivery_boy:
        _set_reference_balance(
            order.delivery_boy,
            reference,
            desired_delivery_balance,
            payment_type="SYSTEM",
            credit_description="Delivery balance reduced after update",
            debit_description="Delivery balance increased after update"
        )

    order.payment_status = payment_status
    order.customer_account = next_customer_account
    order.save(update_fields=["payment_status", "customer_account"])

    return order


def _record_customer_payment(account, reference, payment_type, cash_amount, online_amount):

    if not account:
        return

    if payment_type == "MIXED":
        if cash_amount > 0:
            record_debit(
                account=account,
                amount=cash_amount,
                payment_type="CASH",
                reference=reference,
                description="Customer payment"
            )

        if online_amount > 0:
            record_debit(
                account=account,
                amount=online_amount,
                payment_type="ONLINE",
                reference=reference,
                description="Customer payment"
            )

        return

    record_debit(
        account=account,
        amount=cash_amount + online_amount,
        payment_type=payment_type,
        reference=reference,
        description="Customer payment"
    )


@transaction.atomic
def process_payment(
    order,
    received_amount,
    payment_type="CASH",
    cash_amount=None,
    online_amount=None,
    deduct_change=False
):
    """
    Core payment processor used by all flows.
    """

    total_paid = order.payments.aggregate(
        total=Sum("amount")
    )["total"] or Decimal("0.00")

    remaining = order.total_amount - total_paid

    payment_data = _resolve_full_payment(
        remaining,
        received_amount,
        payment_type,
        cash_amount=cash_amount,
        online_amount=online_amount,
        deduct_change=deduct_change
    )

    payment = OrderPayment.objects.create(
        order=order,
        amount=payment_data["applied_amount"],
        payment_type=payment_type,
        cash_amount=payment_data["cash_applied"],
        online_amount=payment_data["online_applied"]
    )

    _record_payment_to_cash_drawer(
        order,
        cash_received=payment_data["cash_received"],
        online_received=payment_data["online_received"],
        change_amount=payment_data["change_amount"],
        description="Order payment received"
    )

    _record_customer_payment(
        order.customer_account,
        f"ORDER-{order.id}",
        payment_type,
        payment_data["cash_applied"],
        payment_data["online_applied"]
    )

    order.payment_status = "PAID"
    order.save(update_fields=["payment_status"])

    return payment


# -----------------------------
# DINE IN FLOWS
# -----------------------------


@transaction.atomic
def dine_in_instant_online(order, payment_received=True):
    """
    FLOW 1

    DINE_IN
    ↓
    Instant Payment
    ↓
    ONLINE
    ↓
    QR generated
    ↓
    Payment received?
         YES → place order
         NO  → cancel order
    """

    if not payment_received:
        order.delete()
        raise ValueError("Online payment failed. Order cancelled.")

    process_payment(order, order.total_amount, "ONLINE")

    return order


@transaction.atomic
def dine_in_instant_cash(order, cash_received=True):
    """
    FLOW 2

    DINE_IN
    ↓
    Instant Payment
    ↓
    CASH
    ↓
    Cash received?
         YES → place order
         NO  → cancel order
    """

    if not cash_received:
        order.delete()
        raise ValueError("Cash not received. Order cancelled.")

    process_payment(order, order.total_amount, "CASH")

    return order

@transaction.atomic
def dine_in_pay_later(order):
    """
    DINE_IN Flow 5
    Customer chooses to pay later.
    No ledger entry is created yet.
    """

    order.payment_status = "UNPAID"
    order.save(update_fields=["payment_status"])

    return order

@transaction.atomic
def create_takeaway_order(phone, name=None):

    if not phone:
        raise ValueError("Phone number required for takeaway orders")

    order = Order.objects.create(
        order_type="TAKEAWAY",
        customer_phone=phone,
        customer_name=name,
        order_status="PROCESSING",
        payment_status="UNPAID"
    )

    return order

@transaction.atomic
def takeaway_instant_online(order):
    """
    Takeaway order paid instantly via online payment.
    """

    if order.order_type != "TAKEAWAY":
        raise ValueError("Order is not TAKEAWAY")

    process_payment(order, order.total_amount, "ONLINE")

    return order

@transaction.atomic
def takeaway_instant_cash(order, cash_received=True):
    """
    Takeaway order paid instantly via cash.
    """

    if order.order_type != "TAKEAWAY":
        raise ValueError("Order is not TAKEAWAY")

    if not cash_received:
        order.delete()
        raise ValueError("Cash not received. Order cancelled.")

    process_payment(order, order.total_amount, "CASH")

    return order

@transaction.atomic
def takeaway_pay_later(order, name, phone, address):

    if order.order_type != "TAKEAWAY":
        raise ValueError("Order is not TAKEAWAY")

    # create or find customer
    customer = get_or_create_customer(
        name,
        phone,
        address
    )

    # attach customer to order
    order.customer_account = customer
    order.save(update_fields=["customer_account"])

    # record that customer owes the full order
    record_credit(
        account=customer,
        amount=order.total_amount,
        reference=f"ORDER-{order.id}",
        description="Customer owes for order"
    )

    order.payment_status = "UNPAID"
    order.save(update_fields=["payment_status"])

    return order

@transaction.atomic
def collect_payment(
    order,
    received_amount,
    payment_type="CASH",
    cash_amount=None,
    online_amount=None,
    deduct_change=False
):

    if order.payment_status == "PAID":
        raise ValueError("Order already fully paid")

    reference = f"ORDER-{order.id}"

    total_paid = order.payments.aggregate(total=Sum("amount"))["total"] or Decimal("0.00")
    remaining = order.total_amount - total_paid

    if remaining <= 0:
        raise ValueError("Order already fully paid")

    delivery_reference_balance = _get_reference_balance(order.delivery_boy, reference)

    if (
        order.order_type == "DELIVERY"
        and order.delivery_boy
        and delivery_reference_balance < 0
    ):

        boy = order.delivery_boy
        payment_data = _resolve_full_payment(
            remaining,
            received_amount,
            payment_type,
            cash_amount=cash_amount,
            online_amount=online_amount,
            deduct_change=False
        )

        if payment_data["change_amount"] > 0:
            raise ValueError("Delivery settlements must match the remaining balance exactly")

        if payment_data["cash_applied"] > 0:
            record_credit(
                account=boy,
                amount=payment_data["cash_applied"],
                payment_type="CASH",
                reference=f"ORDER-{order.id}",
                description=f"Settlement for Order #{order.id}"
            )

        if payment_data["online_applied"] > 0:
            record_credit(
                account=boy,
                amount=payment_data["online_applied"],
                payment_type="ONLINE",
                reference=f"ORDER-{order.id}",
                description=f"Settlement for Order #{order.id}"
            )

        _record_payment_to_cash_drawer(
            order,
            cash_received=payment_data["cash_received"],
            online_received=payment_data["online_received"],
            change_amount=Decimal("0.00"),
            description=f"Cash received from {boy.name}"
        )

        OrderPayment.objects.create(
            order=order,
            amount=payment_data["applied_amount"],
            payment_type=payment_type,
            cash_amount=payment_data["cash_applied"],
            online_amount=payment_data["online_applied"]
        )

        _record_customer_payment(
            order.customer_account,
            reference,
            payment_type,
            payment_data["cash_applied"],
            payment_data["online_applied"]
        )

        order.payment_status = "PAID"
        order.save(update_fields=["payment_status"])

    else:

        process_payment(
            order,
            received_amount,
            payment_type,
            cash_amount=cash_amount,
            online_amount=online_amount,
            deduct_change=deduct_change
        )

    return order

@transaction.atomic
def create_delivery_order(phone, address, delivery_boy,delivery_charge=0, name=None):

    if not phone:
        raise ValueError("Phone number required for delivery orders")

    if not address:
        raise ValueError("Address required for delivery orders")

    order = Order.objects.create(
        order_type="DELIVERY",
        customer_phone=phone,
        customer_name=name,
        delivery_address=address,
        delivery_boy=delivery_boy,
        delivery_charge=delivery_charge,
        order_status="PROCESSING",
        payment_status="UNPAID"
    )

    return order

@transaction.atomic
def delivery_instant_online(order):

    if order.order_type != "DELIVERY":
        raise ValueError("Order is not DELIVERY")

    process_payment(order, order.total_amount, "ONLINE")

    return order

@transaction.atomic
def delivery_cash_to_boy(order):

    if order.order_type != "DELIVERY":
        raise ValueError("Order is not DELIVERY")

    boy = order.delivery_boy

    if not boy:
        raise ValueError("Delivery boy not assigned")

    # record money collected by delivery boy
    record_credit(
        account=boy,
        amount=order.total_amount,
        payment_type="CASH",
        reference=f"ORDER-{order.id}",
        description="Cash collected from customer"
    )

    order.payment_status = "PAID"
    order.save(update_fields=["payment_status"])

    return order

@transaction.atomic
def settle_delivery_cash(delivery_boy, amount):

    if delivery_boy.account_type != "DELIVERY":
        raise ValueError("Account is not a delivery boy")

    # money returned by delivery boy
    record_debit(
        account=delivery_boy,
        amount=amount,
        payment_type="CASH",
        reference="DELIVERY-SETTLEMENT",
        description="Cash returned to restaurant"
    )

    # restaurant receives the money
    cash = get_cash_drawer()

    record_credit(
        account=cash,
        amount=amount,
        payment_type="CASH",
        reference="DELIVERY-SETTLEMENT",
        description="Cash received from delivery boy"
    )

    return True



def complete_unpaid_order(order, name, phone, address):

    previous_customer_account = order.customer_account
    customer = get_or_create_customer(
        name=name,
        contact_number=phone,
        address=address
    )

    reference = f"ORDER-{order.id}"

    if previous_customer_account and previous_customer_account != customer:
        _set_reference_balance(
            previous_customer_account,
            reference,
            Decimal("0.00"),
            payment_type="SYSTEM",
            credit_description="Customer balance moved after completion",
            debit_description="Customer balance cleared after completion"
        )

    _set_reference_balance(
        customer,
        reference,
        Decimal(str(order.total_amount)),
        payment_type="SYSTEM",
        credit_description="Customer balance increased after completion",
        debit_description="Customer balance reduced after completion"
    )

    if order.order_type == "DELIVERY" and order.delivery_boy:
        _set_reference_balance(
            order.delivery_boy,
            reference,
            Decimal("0.00"),
            payment_type="SYSTEM",
            credit_description="Delivery balance cleared after completion",
            debit_description="Delivery balance cleared after completion"
        )

    order.customer_account = customer
    order.order_status = "COMPLETED"
    order.payment_status = "UNPAID"
    order.completed_at = timezone.now()

    order.save(update_fields=[
        "customer_account",
        "order_status",
        "payment_status",
        "completed_at",
    ])

    return order


@transaction.atomic
def cancel_order(order, *, cooked=False, refunded=False, refund_amount=Decimal("0.00")):

    if order.order_status == "CANCELLED":
        raise ValueError("Order is already cancelled")

    reference = f"ORDER-{order.id}"
    total_paid = order.payments.aggregate(total=Sum("amount"))["total"] or Decimal("0.00")
    refund_amount = Decimal(str(refund_amount or 0))

    if refund_amount < 0:
        raise ValueError("Refund amount cannot be negative")

    if total_paid <= 0:
        if refunded or refund_amount > 0:
            raise ValueError("Cannot refund an unpaid order")
        refunded = False
        refund_amount = Decimal("0.00")
    elif refunded:
        if refund_amount <= 0:
            raise ValueError("Enter a valid refund amount")
        if refund_amount > total_paid:
            raise ValueError("Refund amount cannot exceed collected amount")

        record_debit(
            account=get_cash_drawer(),
            amount=refund_amount,
            payment_type="CASH",
            reference=reference,
            description=f"Refund issued for cancelled Order #{order.id}"
        )
    else:
        refund_amount = Decimal("0.00")

    _set_reference_balance(
        order.customer_account,
        reference,
        Decimal("0.00"),
        payment_type="SYSTEM",
        credit_description="Customer balance cleared after cancellation",
        debit_description="Customer balance cleared after cancellation"
    )

    _set_reference_balance(
        order.delivery_boy,
        reference,
        Decimal("0.00"),
        payment_type="SYSTEM",
        credit_description="Delivery balance cleared after cancellation",
        debit_description="Delivery balance cleared after cancellation"
    )

    order.order_status = "CANCELLED"
    order.cooked = cooked
    order.refunded = refunded and refund_amount > 0
    order.refund_amount = refund_amount
    order.cancelled_at = timezone.now()
    order.save(update_fields=["order_status", "cooked", "refunded", "refund_amount", "cancelled_at"])

    return order
