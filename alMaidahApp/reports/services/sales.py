from decimal import Decimal

from django.db.models import Avg, Count, Sum
from django.db.models.functions import Coalesce, TruncDate

from orders.models import Order, OrderItem, OrderPayment


ZERO = Decimal("0.00")


def _payment_breakdowns(from_date, to_date):
    payments = OrderPayment.objects.filter(
        created_at__date__range=(from_date, to_date)
    ).order_by("created_at", "id")

    method_totals = {
        value: {
            "payment_type": value,
            "label": label,
            "payment_count": 0,
            "total_amount": ZERO,
        }
        for value, label in OrderPayment.PAYMENT_TYPES
    }
    channel_totals = {
        "CASH": ZERO,
        "ONLINE": ZERO,
    }

    for payment in payments:
        amount = Decimal(str(payment.amount or 0))
        cash_amount = Decimal(str(payment.cash_amount or 0))
        online_amount = Decimal(str(payment.online_amount or 0))

        method_totals[payment.payment_type]["payment_count"] += 1
        method_totals[payment.payment_type]["total_amount"] += amount

        if payment.payment_type == "MIXED":
            channel_totals["CASH"] += cash_amount
            channel_totals["ONLINE"] += online_amount
        elif payment.payment_type == "ONLINE":
            channel_totals["ONLINE"] += amount
        elif payment.payment_type == "ADVANCE":
            continue
        else:
            channel_totals["CASH"] += amount

    payment_breakdown = [
        method_totals[key]
        for key, _ in OrderPayment.PAYMENT_TYPES
        if method_totals[key]["payment_count"] or method_totals[key]["total_amount"] > 0
    ]

    collection_channel_breakdown = [
        {
            "channel": "CASH",
            "label": "Cash",
            "total_amount": channel_totals["CASH"],
        },
        {
            "channel": "ONLINE",
            "label": "Online",
            "total_amount": channel_totals["ONLINE"],
        },
    ]

    return payment_breakdown, collection_channel_breakdown


def get_sales_report(from_date, to_date):
    queryset = (
        Order.objects
        .filter(
            order_status="COMPLETED",
            completed_at__date__range=(from_date, to_date),
        )
        .order_by("-completed_at", "-id")
    )

    aggregates = queryset.aggregate(
        total_orders=Count("id"),
        gross_revenue=Coalesce(Sum("total_amount"), ZERO),
        average_order_value=Coalesce(Avg("total_amount"), ZERO),
    )

    total_orders = aggregates["total_orders"] or 0
    gross_revenue = aggregates["gross_revenue"] or ZERO
    average_order_value = aggregates["average_order_value"] or ZERO

    order_type_breakdown = [
        {
            "order_type": row["order_type"],
            "label": dict(Order.ORDER_TYPES).get(row["order_type"], row["order_type"]),
            "order_count": row["order_count"],
            "total_revenue": row["total_revenue"],
        }
        for row in (
            queryset
            .values("order_type")
            .annotate(
                order_count=Count("id"),
                total_revenue=Coalesce(Sum("total_amount"), ZERO),
            )
            .order_by("-total_revenue", "order_type")
        )
    ]

    daily_revenue = [
        {
            "date": row["date"],
            "total_orders": row["total_orders"],
            "total_revenue": row["total_revenue"],
        }
        for row in (
            queryset
            .annotate(date=TruncDate("completed_at"))
            .values("date")
            .annotate(
                total_orders=Count("id"),
                total_revenue=Coalesce(Sum("total_amount"), ZERO),
            )
            .order_by("date")
        )
    ]

    top_items = [
        {
            "item_name": row["item_name"],
            "quantity_sold": row["quantity_sold"],
            "total_sales": row["total_sales"],
            "orders_count": row["orders_count"],
        }
        for row in (
            OrderItem.objects
            .filter(
                order__order_status="COMPLETED",
                order__completed_at__date__range=(from_date, to_date),
            )
            .values("item_name")
            .annotate(
                quantity_sold=Coalesce(Sum("quantity"), 0),
                total_sales=Coalesce(Sum("total_price"), ZERO),
                orders_count=Count("order_id", distinct=True),
            )
            .order_by("-quantity_sold", "-total_sales", "item_name")[:12]
        )
    ]

    payment_breakdown, collection_channel_breakdown = _payment_breakdowns(from_date, to_date)

    orders_list = [
        {
            "id": order.id,
            "order_type": order.order_type,
            "order_type_display": order.get_order_type_display(),
            "payment_status": order.payment_status,
            "customer_name": order.customer_name,
            "customer_phone": order.customer_phone,
            "total_amount": order.total_amount,
            "completed_at": order.completed_at,
        }
        for order in queryset[:25]
    ]

    unpaid_completed_orders = queryset.exclude(payment_status="PAID")

    return {
        "summary": {
            "total_orders": total_orders,
            "gross_revenue": gross_revenue,
            "average_order_value": average_order_value,
            "paid_completed_orders": queryset.filter(payment_status="PAID").count(),
            "unpaid_completed_orders": unpaid_completed_orders.count(),
            "unpaid_completed_total": unpaid_completed_orders.aggregate(
                total=Coalesce(Sum("total_amount"), ZERO)
            )["total"] or ZERO,
        },
        "order_type_breakdown": order_type_breakdown,
        "payment_breakdown": payment_breakdown,
        "collection_channel_breakdown": collection_channel_breakdown,
        "daily_revenue": daily_revenue,
        "top_items": top_items,
        "orders": orders_list,
    }
