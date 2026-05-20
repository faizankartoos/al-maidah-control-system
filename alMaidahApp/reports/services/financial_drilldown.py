from decimal import Decimal

from django.db.models import Count, Sum
from django.db.models.functions import Coalesce

from expenses.models import Expense
from inventory.models import StockOutLog
from orders.models import Order


ZERO = Decimal("0.00")


def get_financial_drilldown_report(from_date, to_date, metric):
    if metric == "revenue":
        queryset = (
            Order.objects.filter(
                order_status="COMPLETED",
                completed_at__date__range=(from_date, to_date),
            )
            .order_by("-completed_at", "-id")
        )

        total_amount = queryset.aggregate(total=Coalesce(Sum("total_amount"), ZERO))["total"] or ZERO

        return {
            "metric": metric,
            "date_range": {
                "from_date": from_date,
                "to_date": to_date,
            },
            "summary": {
                "total_amount": total_amount,
                "record_count": queryset.count(),
            },
            "items": [
                {
                    "id": order.id,
                    "title": f"Order #{order.id}",
                    "subtitle": f"{order.get_order_type_display()} • {order.customer_name or 'Unnamed customer'}",
                    "meta": order.customer_phone or "No phone",
                    "amount": order.total_amount,
                    "occurred_at": order.completed_at,
                    "status": order.payment_status,
                }
                for order in queryset
            ],
        }

    if metric == "cogs":
        queryset = (
            StockOutLog.objects.filter(
                used_at__date__range=(from_date, to_date),
            )
            .select_related("product")
            .order_by("-used_at", "-id")
        )

        total_amount = queryset.aggregate(total=Coalesce(Sum("value_reduced"), ZERO))["total"] or ZERO
        total_quantity = queryset.aggregate(total=Coalesce(Sum("quantity"), ZERO))["total"] or ZERO

        return {
            "metric": metric,
            "date_range": {
                "from_date": from_date,
                "to_date": to_date,
            },
            "summary": {
                "total_amount": total_amount,
                "record_count": queryset.count(),
                "total_quantity": total_quantity,
            },
            "items": [
                {
                    "id": log.id,
                    "title": log.product.name,
                    "subtitle": f"{log.quantity} {log.product.unit} • {log.reason or 'No reason'}",
                    "meta": f"{log.unit_cost or ZERO} per {log.product.unit}",
                    "amount": log.value_reduced or ZERO,
                    "occurred_at": log.used_at,
                    "status": "STOCK_OUT",
                }
                for log in queryset
            ],
        }

    queryset = (
        Expense.objects.filter(
            expense_date__range=(from_date, to_date),
        )
        .select_related("category")
        .order_by("-expense_date", "-created_at", "-id")
    )

    total_amount = queryset.aggregate(total=Coalesce(Sum("amount"), ZERO))["total"] or ZERO

    return {
        "metric": metric,
        "date_range": {
            "from_date": from_date,
            "to_date": to_date,
        },
        "summary": {
            "total_amount": total_amount,
            "record_count": queryset.count(),
            "categories_used": queryset.values("category").distinct().count(),
        },
        "items": [
            {
                "id": expense.id,
                "title": expense.category.name,
                "subtitle": expense.description or "No description",
                "meta": expense.get_payment_mode_display(),
                "amount": expense.amount,
                "occurred_at": expense.expense_date,
                "status": expense.reference_id or "",
            }
            for expense in queryset
        ],
    }
