from django.db.models import Sum
from django.db import transaction
from decimal import Decimal
from django.utils import timezone

from ledger.services import record_credit, record_debit
from ledger.utils import get_cash_drawer, get_or_create_customer
from ledger.models import LedgerAccount

from .models import OrderPayment, Order, OrderItem


MONEY_QUANTUM = Decimal("0.01")


class ChangeConfirmationRequired(ValueError):

    def __init__(self, change_amount):

        self.change_amount = Decimal(str(change_amount))
        super().__init__(
            f"Confirm deduction of {self.change_amount} from the cash drawer"
        )


def _to_money(value):
    return Decimal(str(value or "0.00")).quantize(MONEY_QUANTUM)


def resolve_order_payment_status(total_amount, total_paid):
    total_amount = _to_money(total_amount)
    total_paid = _to_money(total_paid)

    if total_paid <= 0:
        return "UNPAID"

    if total_paid >= total_amount:
        return "PAID"

    return "PARTIAL"


def _customer_outstanding_queryset(*, phone=None, customer_account=None, exclude_order_id=None):
    queryset = Order.objects.exclude(order_status="CANCELLED")

    if customer_account:
        queryset = queryset.filter(customer_account=customer_account)
    elif phone:
        queryset = queryset.filter(customer_phone=phone)
    else:
        return Order.objects.none()

    if exclude_order_id:
        queryset = queryset.exclude(id=exclude_order_id)

    return queryset


def get_customer_previous_due_total(*, phone=None, customer_account=None, exclude_order_id=None):
    outstanding_total = Decimal("0.00")

    for linked_order in _customer_outstanding_queryset(
        phone=phone,
        customer_account=customer_account,
        exclude_order_id=exclude_order_id,
    ).exclude(payment_status="PAID"):
        outstanding_total += get_order_remaining_amount(linked_order)

    return outstanding_total.quantize(MONEY_QUANTUM)


def get_customer_context_by_phone(phone, exclude_order_id=None):
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
    order_count = (
        Order.objects
        .filter(customer_phone=cleaned_phone)
        .exclude(order_status="CANCELLED")
    )

    if exclude_order_id:
        order_count = order_count.exclude(id=exclude_order_id)

    order_count = order_count.count()

    previous_due_available = get_customer_previous_due_total(
        phone=cleaned_phone,
        customer_account=customer_account,
        exclude_order_id=exclude_order_id,
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
        "area_delivery_charge": (
            latest_order.area.delivery_charge
            if latest_order and latest_order.area
            else Decimal("0.00")
        ),
        "current_balance": current_balance,
        "previous_due_available": previous_due_available,
        "advance_available": advance_available,
        "has_advance": advance_available > 0,
        "has_outstanding": current_balance > 0 or previous_due_available > 0,
        "order_count": order_count,
    }


def get_order_amount_paid(order):
    return _to_money(order.payments.aggregate(total=Sum("amount"))["total"] or Decimal("0.00"))


def get_order_remaining_amount(order):
    remaining = _to_money(order.total_amount) - get_order_amount_paid(order)
    if remaining < 0:
        return Decimal("0.00")
    return remaining.quantize(MONEY_QUANTUM)


def compute_subtotal_from_items(items):
    subtotal = Decimal("0.00")

    for item in items or []:
        subtotal += Decimal(str(item["price"])) * int(item["qty"])

    return subtotal.quantize(MONEY_QUANTUM)


def resolve_delivery_charge(order_type, area):
    if order_type != "DELIVERY" or not area:
        return Decimal("0.00")

    return Decimal(str(area.delivery_charge or "0.00")).quantize(MONEY_QUANTUM)


def get_customer_order_count(phone, exclude_order_id=None):
    cleaned_phone = (phone or "").strip()

    if not cleaned_phone:
        return 0

    queryset = Order.objects.filter(customer_phone=cleaned_phone).exclude(order_status="CANCELLED")

    if exclude_order_id:
        queryset = queryset.exclude(id=exclude_order_id)

    return queryset.count()


def get_loyalty_discount_percentage(base_total):
    amount = Decimal(str(base_total))

    if amount < Decimal("500.00"):
        return 0

    return int(amount // Decimal("500.00")) + 1


def calculate_loyalty_discount_amount(base_total):
    percentage = get_loyalty_discount_percentage(base_total)

    if percentage <= 0:
        return Decimal("0.00")

    amount = (Decimal(str(base_total)) * Decimal(percentage)) / Decimal("100")
    return amount.quantize(MONEY_QUANTUM)


def resolve_loyalty_discount(
    *,
    requested_discount,
    customer_phone,
    base_total,
    exclude_order_id=None,
):
    requested_discount = Decimal(str(requested_discount or "0.00"))
    order_count = get_customer_order_count(customer_phone, exclude_order_id=exclude_order_id)
    allowed_discount = Decimal("0.00")
    discount_percentage = 0

    if order_count >= 3:
        discount_percentage = get_loyalty_discount_percentage(base_total)
        allowed_discount = calculate_loyalty_discount_amount(base_total)

    if requested_discount > 0:
        if allowed_discount <= 0:
            raise ValueError("Discount not allowed for this order")

        return {
            "discount": allowed_discount,
            "order_count": order_count,
            "discount_percentage": discount_percentage,
            "allowed": True,
        }

    return {
        "discount": Decimal("0.00"),
        "order_count": order_count,
        "discount_percentage": discount_percentage,
        "allowed": allowed_discount > 0,
        "allowed_discount": allowed_discount,
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
    order.payment_status = resolve_order_payment_status(order.total_amount, refreshed_paid)
    order.save(update_fields=["customer_account", "payment_status"])

    return applied_amount


def _ensure_customer_account_for_order(order):
    account = order.customer_account

    if not account:
        cleaned_phone = (order.customer_phone or "").strip()
        if not cleaned_phone:
            raise ValueError(
                "Phone number is required to keep a pending balance or customer advance for this order."
            )

        account = get_or_create_customer(
            name=order.customer_name or "Customer",
            contact_number=cleaned_phone,
            address=order.delivery_address,
        )
        order.customer_account = account
        order.save(update_fields=["customer_account"])

    update_fields = []

    if order.customer_name and account.name != order.customer_name:
        account.name = order.customer_name
        update_fields.append("name")

    if order.delivery_address and account.address != order.delivery_address:
        account.address = order.delivery_address
        update_fields.append("address")

    if update_fields:
        account.save(update_fields=update_fields)

    return account


def _sync_order_customer_balance(order, desired_balance):
    desired_balance = _to_money(desired_balance)
    reference = f"ORDER-{order.id}"

    if desired_balance == 0 and not order.customer_account:
        return None

    account = order.customer_account

    if desired_balance != 0:
        account = _ensure_customer_account_for_order(order)

    _set_reference_balance(
        account,
        reference,
        desired_balance,
        payment_type="SYSTEM",
        credit_description="Customer balance increased after payment sync",
        debit_description="Customer balance reduced after payment sync",
    )

    if account and order.customer_account_id != account.id:
        order.customer_account = account
        order.save(update_fields=["customer_account"])

    return account


def _normalize_received_breakdown(received_amount, payment_type, cash_amount=None, online_amount=None):
    received_amount = _to_money(received_amount)

    if received_amount <= 0:
        raise ValueError("Payment amount must be greater than zero")

    if payment_type not in {"CASH", "ONLINE", "MIXED"}:
        raise ValueError("Select a valid payment type")

    if payment_type == "MIXED":
        cash_received = _to_money(cash_amount)
        online_received = _to_money(online_amount)

        if cash_received < 0 or online_received < 0:
            raise ValueError("Cash and online amounts must be zero or greater")

        if cash_received + online_received <= 0:
            raise ValueError("Enter a valid mixed payment amount")

        if cash_received + online_received != received_amount:
            raise ValueError("Cash and online amounts must match the collected amount")
    elif payment_type == "CASH":
        cash_received = received_amount
        online_received = Decimal("0.00")
    else:
        cash_received = Decimal("0.00")
        online_received = received_amount

    return {
        "received_amount": received_amount,
        "cash_received": cash_received,
        "online_received": online_received,
    }


def _allocate_payment_slice(target_amount, cash_pool, online_pool):
    target_amount = _to_money(target_amount)
    cash_pool = _to_money(cash_pool)
    online_pool = _to_money(online_pool)

    if target_amount <= 0:
        return {
            "cash_applied": Decimal("0.00"),
            "online_applied": Decimal("0.00"),
            "cash_remaining": cash_pool,
            "online_remaining": online_pool,
        }

    cash_applied = min(cash_pool, target_amount)
    online_applied = target_amount - cash_applied

    if online_applied > online_pool:
        raise ValueError("Payment breakdown does not cover the selected amount")

    return {
        "cash_applied": cash_applied,
        "online_applied": online_applied,
        "cash_remaining": cash_pool - cash_applied,
        "online_remaining": online_pool - online_applied,
    }


def _record_order_payment(order, amount, payment_type, cash_amount, online_amount):
    amount = _to_money(amount)

    if amount <= 0:
        return None

    return OrderPayment.objects.create(
        order=order,
        amount=amount,
        payment_type=payment_type,
        cash_amount=_to_money(cash_amount),
        online_amount=_to_money(online_amount),
    )


def _collect_previous_customer_due(
    account,
    amount,
    payment_type,
    *,
    cash_amount=Decimal("0.00"),
    online_amount=Decimal("0.00"),
    exclude_order_id=None,
):
    remaining_to_allocate = _to_money(amount)
    cash_pool = _to_money(cash_amount)
    online_pool = _to_money(online_amount)
    updated_orders = []

    if remaining_to_allocate <= 0 or not account:
        return updated_orders, cash_pool, online_pool

    linked_orders = (
        _customer_outstanding_queryset(
            customer_account=account,
            exclude_order_id=exclude_order_id,
        )
        .exclude(payment_status="PAID")
        .order_by("completed_at", "created_at", "id")
    )

    for linked_order in linked_orders:
        if remaining_to_allocate <= 0:
            break

        total_paid_before = get_order_amount_paid(linked_order)
        order_remaining = get_order_remaining_amount(linked_order)

        if order_remaining <= 0:
            next_status = resolve_order_payment_status(linked_order.total_amount, total_paid_before)
            if linked_order.payment_status != next_status:
                linked_order.payment_status = next_status
                linked_order.save(update_fields=["payment_status"])
            continue

        applied_amount = min(order_remaining, remaining_to_allocate)
        slice_data = _allocate_payment_slice(applied_amount, cash_pool, online_pool)
        cash_pool = slice_data["cash_remaining"]
        online_pool = slice_data["online_remaining"]

        _record_order_payment(
            linked_order,
            applied_amount,
            payment_type,
            slice_data["cash_applied"],
            slice_data["online_applied"],
        )

        _record_customer_payment(
            account,
            f"ORDER-{linked_order.id}",
            payment_type,
            slice_data["cash_applied"],
            slice_data["online_applied"],
        )

        total_paid_after = total_paid_before + applied_amount
        linked_order.payment_status = resolve_order_payment_status(
            linked_order.total_amount,
            total_paid_after,
        )
        linked_order.save(update_fields=["payment_status"])

        updated_orders.append(
            {
                "id": linked_order.id,
                "applied_amount": applied_amount,
                "payment_status": linked_order.payment_status,
                "remaining_amount": max(Decimal("0.00"), order_remaining - applied_amount),
            }
        )

        remaining_to_allocate -= applied_amount

    if remaining_to_allocate > 0:
        raise ValueError("Selected previous balance is no longer available. Refresh and try again.")

    return updated_orders, cash_pool, online_pool


def _record_customer_advance(order, account, amount, payment_type, cash_amount, online_amount):
    amount = _to_money(amount)

    if amount <= 0 or not account:
        return Decimal("0.00")

    reference = f"ORDER-{order.id}"
    description = f"Customer advance received on Order #{order.id}"

    if payment_type == "MIXED":
        if cash_amount > 0:
            record_debit(
                account=account,
                amount=cash_amount,
                payment_type="CASH",
                reference=reference,
                description=description,
            )

        if online_amount > 0:
            record_debit(
                account=account,
                amount=online_amount,
                payment_type="ONLINE",
                reference=reference,
                description=description,
            )

        return amount

    record_debit(
        account=account,
        amount=amount,
        payment_type=payment_type,
        reference=reference,
        description=description,
    )
    return amount


@transaction.atomic
def apply_flexible_customer_payment(
    order,
    received_amount,
    payment_type="CASH",
    *,
    cash_amount=None,
    online_amount=None,
    order_payment_amount=None,
    collect_previous_due_amount=Decimal("0.00"),
    save_extra_as_advance=False,
    deduct_change=False,
):
    current_remaining = get_order_remaining_amount(order)
    selected_order_amount = (
        current_remaining
        if order_payment_amount in [None, "", "null"]
        else _to_money(order_payment_amount)
    )
    collect_previous_due_amount = _to_money(collect_previous_due_amount)
    received_data = _normalize_received_breakdown(
        received_amount,
        payment_type,
        cash_amount=cash_amount,
        online_amount=online_amount,
    )

    if current_remaining <= 0 and selected_order_amount <= 0 and collect_previous_due_amount <= 0 and not save_extra_as_advance:
        raise ValueError("Order has no remaining balance")

    if selected_order_amount < 0 or collect_previous_due_amount < 0:
        raise ValueError("Collected amounts cannot be negative")

    if current_remaining > 0 and selected_order_amount <= 0:
        raise ValueError("Enter how much is being collected for the current order")

    if selected_order_amount > current_remaining:
        raise ValueError("Current order collection cannot exceed the remaining balance")

    customer_account = order.customer_account
    needs_customer_account = (
        selected_order_amount < current_remaining
        or collect_previous_due_amount > 0
        or save_extra_as_advance
    )

    if needs_customer_account:
        customer_account = _ensure_customer_account_for_order(order)

    if collect_previous_due_amount > 0:
        previous_due_available = get_customer_previous_due_total(
            customer_account=customer_account,
            exclude_order_id=order.id,
        )
        if previous_due_available <= 0:
            raise ValueError("This customer has no previous pending balance to collect")
        if collect_previous_due_amount > previous_due_available:
            raise ValueError("Selected previous balance exceeds the available pending amount")

    total_selected_amount = selected_order_amount + collect_previous_due_amount

    if total_selected_amount <= 0 and not save_extra_as_advance:
        raise ValueError("Select a valid amount to collect")

    if received_data["received_amount"] < total_selected_amount:
        raise ValueError("Received amount cannot be less than the selected allocations")

    extra_amount = received_data["received_amount"] - total_selected_amount

    if extra_amount > 0:
        if save_extra_as_advance:
            customer_account = _ensure_customer_account_for_order(order)
        else:
            if payment_type == "ONLINE":
                raise ValueError(
                    "Online payment cannot exceed the selected payable amount unless the extra is saved as advance"
                )

            if received_data["cash_received"] < extra_amount:
                raise ValueError("Change can only be returned from the cash portion")

            if not deduct_change:
                raise ChangeConfirmationRequired(extra_amount)

    change_amount = Decimal("0.00") if save_extra_as_advance else extra_amount
    cash_pool = received_data["cash_received"] - change_amount
    online_pool = received_data["online_received"]

    current_slice = _allocate_payment_slice(selected_order_amount, cash_pool, online_pool)
    cash_pool = current_slice["cash_remaining"]
    online_pool = current_slice["online_remaining"]

    order_payment = _record_order_payment(
        order,
        selected_order_amount,
        payment_type,
        current_slice["cash_applied"],
        current_slice["online_applied"],
    )

    previous_due_updates, cash_pool, online_pool = _collect_previous_customer_due(
        customer_account,
        collect_previous_due_amount,
        payment_type,
        cash_amount=cash_pool,
        online_amount=online_pool,
        exclude_order_id=order.id,
    )

    advance_saved = Decimal("0.00")
    if save_extra_as_advance:
        advance_saved = cash_pool + online_pool
        if advance_saved > 0:
            _record_customer_advance(
                order,
                customer_account,
                advance_saved,
                payment_type,
                cash_pool,
                online_pool,
            )
        cash_pool = Decimal("0.00")
        online_pool = Decimal("0.00")

    remaining_after_current = current_remaining - selected_order_amount
    if remaining_after_current < 0:
        remaining_after_current = Decimal("0.00")

    desired_reference_balance = remaining_after_current - advance_saved
    customer_account = _sync_order_customer_balance(order, desired_reference_balance)

    total_paid_after = get_order_amount_paid(order)
    order.payment_status = resolve_order_payment_status(order.total_amount, total_paid_after)
    if customer_account and order.customer_account_id != customer_account.id:
        order.customer_account = customer_account
        order.save(update_fields=["payment_status", "customer_account"])
    else:
        order.save(update_fields=["payment_status"])

    _record_payment_to_cash_drawer(
        order,
        cash_received=received_data["cash_received"],
        online_received=received_data["online_received"],
        change_amount=change_amount,
        description="Customer payment received",
    )

    return {
        "order_payment": order_payment,
        "order_payment_amount": selected_order_amount,
        "previous_due_collected": collect_previous_due_amount,
        "advance_saved": advance_saved,
        "change_amount": change_amount,
        "remaining_amount": remaining_after_current,
        "payment_status": order.payment_status,
        "previous_due_updates": previous_due_updates,
    }


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
        desired_delivery_balance = Decimal("0.00") - get_order_remaining_amount(order)

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
    items=None,
    increment_update_count=True,
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
    if increment_update_count:
        order.update_count += 1

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
        "update_count",
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

    payment_status = resolve_order_payment_status(order.total_amount, total_paid)

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
    payment_result = apply_flexible_customer_payment(
        order,
        received_amount,
        payment_type,
        cash_amount=cash_amount,
        online_amount=online_amount,
        order_payment_amount=get_order_remaining_amount(order),
        collect_previous_due_amount=Decimal("0.00"),
        save_extra_as_advance=False,
        deduct_change=deduct_change,
    )
    return payment_result["order_payment"]


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

    order.payment_status = resolve_order_payment_status(order.total_amount, get_order_amount_paid(order))
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

    order.payment_status = resolve_order_payment_status(order.total_amount, get_order_amount_paid(order))
    order.save(update_fields=["payment_status"])

    return order

@transaction.atomic
def collect_payment(
    order,
    received_amount,
    payment_type="CASH",
    cash_amount=None,
    online_amount=None,
    deduct_change=False,
    order_payment_amount=None,
    collect_previous_due_amount=Decimal("0.00"),
    save_extra_as_advance=False,
    apply_customer_advance=False,
):
    reference = f"ORDER-{order.id}"
    advance_applied = Decimal("0.00")

    if order.payment_status == "PAID" and not apply_customer_advance:
        raise ValueError("Order already fully paid")

    if apply_customer_advance:
        customer_account = order.customer_account

        if not customer_account and order.customer_phone:
            customer_context = get_customer_context_by_phone(order.customer_phone)
            if customer_context and customer_context["account_id"]:
                customer_account = LedgerAccount.objects.get(id=customer_context["account_id"])

        if customer_account:
            advance_applied = apply_customer_advance_to_order(order, customer_account)

    total_paid = order.payments.aggregate(total=Sum("amount"))["total"] or Decimal("0.00")
    remaining = order.total_amount - total_paid

    if remaining <= 0:
        if collect_previous_due_amount > 0:
            raise ValueError("Use Ledger to collect previous balance once this order is fully paid")
        if save_extra_as_advance:
            raise ValueError("Advance cannot be saved from a fully paid order collection screen")
        return order

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

        order.payment_status = resolve_order_payment_status(order.total_amount, get_order_amount_paid(order))
        order.save(update_fields=["payment_status"])

    else:

        apply_flexible_customer_payment(
            order,
            received_amount,
            payment_type,
            cash_amount=cash_amount,
            online_amount=online_amount,
            order_payment_amount=order_payment_amount,
            collect_previous_due_amount=collect_previous_due_amount,
            save_extra_as_advance=save_extra_as_advance,
            deduct_change=deduct_change,
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
    remaining_balance = get_order_remaining_amount(order)

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
        remaining_balance,
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
    order.payment_status = resolve_order_payment_status(order.total_amount, get_order_amount_paid(order))
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
