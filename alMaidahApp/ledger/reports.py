from datetime import datetime
from decimal import Decimal

from django.db.models import Sum
from django.utils import timezone

from ledger.models import LedgerAccount, LedgerEntry
from ledger.utils import get_cash_drawer
from orders.models import Order


def account_ledger_report(account_id):
    account = LedgerAccount.objects.get(id=account_id)

    entries = account.entries.order_by("created_at", "id")

    running_balance = Decimal(str(account.opening_balance))
    total_credits = Decimal("0.00")
    total_debits = Decimal("0.00")
    transactions = []

    for entry in entries:
        amount = Decimal(str(entry.amount))

        if entry.entry_type == "CREDIT":
            total_credits += amount
            running_balance += amount
        else:
            total_debits += amount
            running_balance -= amount

        transactions.append(
            {
                "id": entry.id,
                "date": entry.created_at,
                "entry_type": entry.entry_type,
                "payment_type": entry.payment_type,
                "amount": entry.amount,
                "reference": entry.reference,
                "description": entry.description,
                "running_balance": running_balance,
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
            "total_credits": total_credits,
            "total_debits": total_debits,
            "transaction_count": len(transactions),
            "related_orders_count": len(related_orders),
        },
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
