from datetime import timedelta
from decimal import Decimal

from django.db.models import Count, Sum
from django.db.models.functions import Coalesce

from expenses.services import get_expenses_dashboard
from inventory.models import Inventory
from ledger.models import LedgerAccount
from ledger.utils import get_cash_drawer
from orders.models import Order

from .cogs import get_cogs_report
from .profit import get_profit_report
from .sales import get_sales_report


ZERO = Decimal("0.00")


def _positive_customer_outstanding():
    total = ZERO

    for account in LedgerAccount.objects.filter(account_type="CUSTOMER", is_active=True):
        balance = Decimal(str(account.balance or 0))
        if balance > 0:
            total += balance

    return total


def _delivery_pending_total():
    total = ZERO

    for account in LedgerAccount.objects.filter(account_type="DELIVERY", is_active=True):
        balance = Decimal(str(account.balance or 0))
        if balance < 0:
            total += abs(balance)

    return total


def _combine_daily_financials(from_date, to_date, sales, cogs, expenses):
    sales_map = {
        row["date"]: Decimal(str(row["total_revenue"] or 0))
        for row in sales["daily_revenue"]
    }
    cogs_map = {
        row["date"]: Decimal(str(row["total_cogs"] or 0))
        for row in cogs["daily_totals"]
    }
    expenses_map = {
        row["expense_date"]: Decimal(str(row["total_amount"] or 0))
        for row in expenses["daily_totals"]
    }

    rows = []
    current = from_date

    while current <= to_date:
        revenue = sales_map.get(current, ZERO)
        cogs_value = cogs_map.get(current, ZERO)
        expense_value = expenses_map.get(current, ZERO)
        profit = revenue - cogs_value - expense_value

        rows.append({
            "date": current,
            "revenue": revenue,
            "cogs": cogs_value,
            "expenses": expense_value,
            "profit": profit,
        })
        current += timedelta(days=1)

    return rows


def _serialize_low_stock_items():
    low_stock_items = []

    for inventory in Inventory.objects.select_related("product").all():
        threshold = Decimal(str(inventory.product.low_stock_threshold or 0))
        quantity = Decimal(str(inventory.quantity or 0))

        if threshold <= 0 or quantity > threshold:
            continue

        low_stock_items.append({
            "product_id": inventory.product_id,
            "product_name": inventory.product.name,
            "unit": inventory.product.unit,
            "quantity": inventory.quantity,
            "threshold": inventory.product.low_stock_threshold,
            "total_value": inventory.total_value,
        })

    return sorted(
        low_stock_items,
        key=lambda item: (Decimal(str(item["quantity"])), item["product_name"].lower()),
    )


def _serialize_inventory_snapshot():
    rows = [
        {
            "product_id": inventory.product_id,
            "product_name": inventory.product.name,
            "unit": inventory.product.unit,
            "quantity": inventory.quantity,
            "total_value": inventory.total_value,
            "average_unit_cost": inventory.average_unit_cost,
            "updated_at": inventory.updated_at,
        }
        for inventory in Inventory.objects.select_related("product").all()
    ]

    return sorted(
        rows,
        key=lambda item: (-Decimal(str(item["total_value"] or 0)), item["product_name"].lower()),
    )


def _serialize_open_unpaid_orders():
    queryset = (
        Order.objects
        .filter(payment_status="UNPAID")
        .exclude(order_status="CANCELLED")
        .order_by("-created_at", "-id")
    )

    return [
        {
            "id": order.id,
            "order_type": order.order_type,
            "order_type_display": order.get_order_type_display(),
            "order_status": order.order_status,
            "customer_name": order.customer_name,
            "customer_phone": order.customer_phone,
            "total_amount": order.total_amount,
            "created_at": order.created_at,
        }
        for order in queryset[:12]
    ]


def _serialize_scheduled_orders():
    queryset = (
        Order.objects
        .filter(order_status="SCHEDULED")
        .order_by("scheduled_time", "created_at")
    )

    return [
        {
            "id": order.id,
            "order_type": order.order_type,
            "order_type_display": order.get_order_type_display(),
            "customer_name": order.customer_name,
            "customer_phone": order.customer_phone,
            "scheduled_time": order.scheduled_time,
            "total_amount": order.total_amount,
        }
        for order in queryset[:12]
    ]


def _serialize_cancelled_orders(from_date, to_date):
    queryset = (
        Order.objects
        .filter(cancelled_at__date__range=(from_date, to_date))
        .order_by("-cancelled_at", "-id")
    )

    return [
        {
            "id": order.id,
            "order_type": order.order_type,
            "order_type_display": order.get_order_type_display(),
            "customer_name": order.customer_name,
            "customer_phone": order.customer_phone,
            "total_amount": order.total_amount,
            "cooked": order.cooked,
            "refunded": order.refunded,
            "refund_amount": order.refund_amount,
            "cancelled_at": order.cancelled_at,
        }
        for order in queryset[:12]
    ]


def _live_order_status_chart():
    rows = (
        Order.objects
        .values("order_status")
        .annotate(order_count=Count("id"))
        .order_by("order_status")
    )

    labels = dict(Order.ORDER_STATUS)

    return [
        {
            "order_status": row["order_status"],
            "label": labels.get(row["order_status"], row["order_status"]),
            "value": row["order_count"],
        }
        for row in rows
    ]


def get_dashboard_report(from_date, to_date):
    sales = get_sales_report(from_date, to_date)
    cogs = get_cogs_report(from_date, to_date)
    expenses = get_expenses_dashboard(
        {
            "start_date": from_date,
            "end_date": to_date,
        }
    )
    profit = get_profit_report(from_date, to_date)

    cash_drawer = get_cash_drawer()
    inventory_snapshot = _serialize_inventory_snapshot()
    low_stock_items = _serialize_low_stock_items()
    open_unpaid_orders = _serialize_open_unpaid_orders()
    scheduled_orders = _serialize_scheduled_orders()
    cancelled_orders = _serialize_cancelled_orders(from_date, to_date)
    open_unpaid_queryset = Order.objects.filter(payment_status="UNPAID").exclude(order_status="CANCELLED")
    scheduled_orders_queryset = Order.objects.filter(order_status="SCHEDULED")

    created_orders_count = Order.objects.filter(
        created_at__date__range=(from_date, to_date)
    ).count()

    cancelled_queryset = Order.objects.filter(
        cancelled_at__date__range=(from_date, to_date)
    )
    cooked_cancelled_queryset = cancelled_queryset.filter(cooked=True)
    refunds_issued = cancelled_queryset.aggregate(
        total=Coalesce(Sum("refund_amount"), ZERO)
    )["total"] or ZERO
    cooked_cancelled_value = cooked_cancelled_queryset.aggregate(
        total=Coalesce(Sum("total_amount"), ZERO)
    )["total"] or ZERO

    inventory_value = sum(
        Decimal(str(item["total_value"] or 0))
        for item in inventory_snapshot
    )
    open_unpaid_total = open_unpaid_queryset.aggregate(
        total=Coalesce(Sum("total_amount"), ZERO)
    )["total"] or ZERO

    daily_financials = _combine_daily_financials(from_date, to_date, sales, cogs, expenses)

    return {
        "date_range": {
            "from_date": from_date,
            "to_date": to_date,
        },
        "summary": {
            "gross_revenue": sales["summary"]["gross_revenue"],
            "total_cogs": cogs["summary"]["total_cogs"],
            "total_expenses": expenses["summary"]["total_expenses"],
            "gross_profit": profit["summary"]["gross_profit"],
            "net_profit": profit["summary"]["net_profit"],
            "profit_margin": profit["summary"]["profit_margin"],
            "completed_orders": sales["summary"]["total_orders"],
            "created_orders": created_orders_count,
            "average_order_value": sales["summary"]["average_order_value"],
            "refunds_issued": refunds_issued,
            "cooked_cancelled_value": cooked_cancelled_value,
            "cooked_cancelled_count": cooked_cancelled_queryset.count(),
        },
        "snapshot": {
            "cash_drawer_balance": cash_drawer.balance,
            "customer_outstanding": _positive_customer_outstanding(),
            "delivery_pending": _delivery_pending_total(),
            "inventory_value": inventory_value,
            "inventory_items_count": len(inventory_snapshot),
            "low_stock_count": len(low_stock_items),
            "open_unpaid_orders_count": open_unpaid_queryset.count(),
            "open_unpaid_total": open_unpaid_total,
            "scheduled_orders_count": scheduled_orders_queryset.count(),
            "ready_orders_count": Order.objects.filter(order_status="READY").count(),
            "processing_orders_count": Order.objects.filter(order_status="PROCESSING").count(),
        },
        "charts": {
            "daily_financials": daily_financials,
            "sales_by_order_type": sales["order_type_breakdown"],
            "payment_mix": sales["collection_channel_breakdown"],
            "payment_methods": sales["payment_breakdown"],
            "expense_categories": expenses["category_breakdown"][:8],
            "expense_payment_modes": expenses["payment_mode_breakdown"],
            "stock_out_reasons": cogs["reason_breakdown"],
            "live_order_status": _live_order_status_chart(),
        },
        "details": {
            "recent_completed_orders": sales["orders"],
            "top_selling_items": sales["top_items"],
            "low_stock_items": low_stock_items[:12],
            "inventory_snapshot": inventory_snapshot[:12],
            "open_unpaid_orders": open_unpaid_orders,
            "scheduled_orders": scheduled_orders,
            "recent_expenses": expenses["expenses"][:12],
            "cancelled_orders": cancelled_orders,
            "recent_stock_out": cogs["usage"][:12],
        },
        "sales": sales,
        "cogs": cogs,
        "expenses": expenses,
        "profit": profit,
    }
