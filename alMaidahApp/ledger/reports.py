from datetime import datetime
from decimal import Decimal

from django.db.models import Sum
from django.utils import timezone

from ledger.models import LedgerAccount, LedgerEntry
from ledger.utils import get_cash_drawer
from orders.models import Order


VENDOR_ACTION_LABELS = {
    "VENDOR-DUE": "Invoice Recorded",
    "VENDOR-PAY": "Payment Issued",
    "VENDOR-ADJUST-UP": "Balance Correction (Increase)",
    "VENDOR-ADJUST-DOWN": "Balance Correction (Decrease)",
}

VENDOR_UNDO_REFERENCES = set(VENDOR_ACTION_LABELS.keys())


def _entry_business_date(entry):
    return entry.entry_date or timezone.localtime(entry.created_at).date()


def _entry_sort_key(entry):
    return (_entry_business_date(entry), entry.created_at, entry.id)


def _apply_entry_to_balance(running_balance, entry):
    amount = Decimal(str(entry.amount))

    if entry.entry_type == "CREDIT":
        return running_balance + amount

    return running_balance - amount


def _entry_actor_name(entry):
    if not entry.created_by:
        return None

    full_name = entry.created_by.get_full_name().strip()
    return full_name or entry.created_by.username


def _entry_action_label(entry):
    if entry.reference in VENDOR_ACTION_LABELS:
        return VENDOR_ACTION_LABELS[entry.reference]

    if (entry.reference or "").startswith("UNDO-ENTRY-"):
        return "Reversal Entry"

    return entry.entry_type


def _vendor_statement_totals(transactions):
    totals = {
        "due_added": Decimal("0.00"),
        "payments_made": Decimal("0.00"),
        "adjustments_up": Decimal("0.00"),
        "adjustments_down": Decimal("0.00"),
    }

    for entry in transactions:
        amount = Decimal(str(entry["amount"]))
        reference = entry["reference"]

        if reference == "VENDOR-DUE":
            totals["due_added"] += amount
        elif reference == "VENDOR-PAY":
            totals["payments_made"] += amount
        elif reference == "VENDOR-ADJUST-UP":
            totals["adjustments_up"] += amount
        elif reference == "VENDOR-ADJUST-DOWN":
            totals["adjustments_down"] += amount

    return totals


def account_ledger_report(account_id, start_date=None, end_date=None):
    account = LedgerAccount.objects.get(id=account_id)

    entries = list(
        account.entries.select_related("created_by").order_by("created_at", "id")
    )
    entries.sort(key=_entry_sort_key)
    undone_references = set(
        account.entries.filter(reference__startswith="UNDO-ENTRY-")
        .values_list("reference", flat=True)
    )

    running_balance = Decimal(str(account.opening_balance))
    statement_opening_balance = Decimal(str(account.opening_balance))
    total_credits = Decimal("0.00")
    total_debits = Decimal("0.00")
    transactions = []

    for entry in entries:
        business_date = _entry_business_date(entry)

        if start_date and business_date < start_date:
            running_balance = _apply_entry_to_balance(running_balance, entry)
            statement_opening_balance = running_balance
            continue

        if end_date and business_date > end_date:
            continue

        amount = Decimal(str(entry.amount))

        if entry.entry_type == "CREDIT":
            total_credits += amount
        else:
            total_debits += amount

        running_balance = _apply_entry_to_balance(running_balance, entry)

        transactions.append(
            {
                "id": entry.id,
                "date": entry.created_at,
                "entry_date": business_date,
                "entry_type": entry.entry_type,
                "payment_type": entry.payment_type,
                "amount": entry.amount,
                "reference": entry.reference,
                "document_number": entry.document_number,
                "description": entry.description,
                "created_by_name": _entry_actor_name(entry),
                "action_label": _entry_action_label(entry),
                "running_balance": running_balance,
                "can_undo": (
                    account.account_type == "VENDOR"
                    and entry.reference in VENDOR_UNDO_REFERENCES
                    and f"UNDO-ENTRY-{entry.id}" not in undone_references
                ),
            }
        )

    related_orders_queryset = Order.objects.none()

    if account.account_type == "CUSTOMER":
        related_orders_queryset = Order.objects.filter(customer_account=account)
    elif account.account_type == "DELIVERY":
        related_orders_queryset = Order.objects.filter(delivery_boy=account)

    related_orders = [
        {
            "id": order.id,
            "order_type": order.order_type,
            "order_status": order.order_status,
            "payment_status": order.payment_status,
            "customer_name": order.customer_name,
            "customer_phone": order.customer_phone,
            "delivery_address": order.delivery_address,
            "table_number": order.table_number,
            "total_amount": order.total_amount,
            "created_at": order.created_at,
        }
        for order in related_orders_queryset.order_by("-created_at")[:100]
    ]

    statement_closing_balance = (
        transactions[-1]["running_balance"] if transactions else statement_opening_balance
    )

    vendor_totals = (
        _vendor_statement_totals(transactions)
        if account.account_type == "VENDOR"
        else None
    )

    return {
        "account": {
            "id": account.id,
            "name": account.name,
            "account_type": account.account_type,
            "account_type_display": account.get_account_type_display(),
            "contact_number": account.contact_number,
            "address": account.address,
            "opening_balance": account.opening_balance,
            "balance": account.balance,
            "is_active": account.is_active,
            "created_at": account.created_at,
        },
        "summary": {
            "opening_balance": account.opening_balance,
            "current_balance": account.balance,
            "statement_opening_balance": statement_opening_balance,
            "statement_closing_balance": statement_closing_balance,
            "total_credits": total_credits,
            "total_debits": total_debits,
            "transaction_count": len(transactions),
            "related_orders_count": len(related_orders),
        },
        "filters": {
            "start_date": start_date,
            "end_date": end_date,
        },
        "vendor_statement": vendor_totals,
        "transactions": transactions,
        "related_orders": related_orders,
    }


def customer_ledger_report(customer_id):
    account = LedgerAccount.objects.get(
        id=customer_id,
        account_type="CUSTOMER",
    )
    return account_ledger_report(account.id)


def _sum_entries(queryset):
    return queryset.aggregate(total=Sum("amount"))["total"] or Decimal("0.00")


def _positive_customer_outstanding():
    total = Decimal("0.00")

    for account in LedgerAccount.objects.filter(account_type="CUSTOMER", is_active=True):
        balance = Decimal(str(account.balance))
        if balance > 0:
            total += balance

    return total


def _delivery_pending_total():
    total = Decimal("0.00")

    for account in LedgerAccount.objects.filter(account_type="DELIVERY", is_active=True):
        balance = Decimal(str(account.balance))
        if balance < 0:
            total += abs(balance)

    return total


def daily_sales_report(date=None):
    if not date:
        date = timezone.now().date()

    start = timezone.make_aware(datetime.combine(date, datetime.min.time()))
    end = timezone.make_aware(datetime.combine(date, datetime.max.time()))

    cash_drawer = get_cash_drawer()

    cash_entries = LedgerEntry.objects.filter(
        ledger_account=cash_drawer,
        created_at__range=(start, end),
    )

    order_collections = cash_entries.filter(
        entry_type="CREDIT",
        reference__startswith="ORDER-",
    )
    manual_collections = cash_entries.filter(
        entry_type="CREDIT",
        reference="MANUAL-COLLECT",
    )
    refunds = cash_entries.filter(
        entry_type="DEBIT",
        description__icontains="Refund issued for cancelled Order",
    )
    change_given = cash_entries.filter(
        entry_type="DEBIT",
        description__icontains="Change returned for Order",
    )

    order_cash_collections = _sum_entries(order_collections.filter(payment_type="CASH"))
    order_online_collections = _sum_entries(order_collections.filter(payment_type="ONLINE"))
    manual_cash_collections = _sum_entries(manual_collections.filter(payment_type="CASH"))
    manual_online_collections = _sum_entries(manual_collections.filter(payment_type="ONLINE"))
    total_credits = _sum_entries(cash_entries.filter(entry_type="CREDIT"))
    total_debits = _sum_entries(cash_entries.filter(entry_type="DEBIT"))

    unpaid_orders = Order.objects.filter(
        payment_status="UNPAID",
    ).exclude(order_status="CANCELLED").order_by("-created_at")

    unpaid_list = [
        {
            "id": order.id,
            "type": order.order_type,
            "customer": order.customer_name,
            "phone": order.customer_phone,
            "total": order.total_amount,
            "status": order.order_status,
            "created_at": order.created_at,
        }
        for order in unpaid_orders
    ]

    return {
        "date": date,
        "summary": {
            "cash_drawer_balance": cash_drawer.balance,
            "order_cash_collections": order_cash_collections,
            "order_online_collections": order_online_collections,
            "total_order_collections": order_cash_collections + order_online_collections,
            "manual_cash_collections": manual_cash_collections,
            "manual_online_collections": manual_online_collections,
            "total_manual_collections": manual_cash_collections + manual_online_collections,
            "refunds_issued": _sum_entries(refunds),
            "change_given": _sum_entries(change_given),
            "total_cash_out": total_debits,
            "net_cash_movement": total_credits - total_debits,
            "customer_outstanding": _positive_customer_outstanding(),
            "delivery_pending": _delivery_pending_total(),
            "unpaid_total": sum(order.total_amount for order in unpaid_orders),
            "unpaid_orders_count": len(unpaid_list),
        },
        "unpaid_orders": unpaid_list,
    }


def delivery_boy_report(boy_id):
    boy = LedgerAccount.objects.get(
        id=boy_id,
        account_type="DELIVERY",
    )

    entries = LedgerEntry.objects.filter(
        ledger_account=boy,
    ).order_by("created_at")

    collected = entries.filter(
        entry_type="CREDIT",
    ).aggregate(total=Sum("amount"))["total"] or Decimal("0.00")

    returned = entries.filter(
        entry_type="DEBIT",
    ).aggregate(total=Sum("amount"))["total"] or Decimal("0.00")

    transactions = [
        {
            "date": entry.created_at,
            "type": entry.entry_type,
            "amount": entry.amount,
            "description": entry.description,
            "reference": entry.reference,
        }
        for entry in entries
    ]

    pending = abs(Decimal(str(boy.balance))) if Decimal(str(boy.balance)) < 0 else Decimal("0.00")

    return {
        "delivery_boy": boy.name,
        "collected": collected,
        "returned": returned,
        "pending": pending,
        "transactions": transactions,
    }
