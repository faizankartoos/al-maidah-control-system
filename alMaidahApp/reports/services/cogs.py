from collections import defaultdict
from decimal import Decimal

from inventory.models import StockOutLog


ZERO = Decimal("0.00")


def _resolve_log_cost(log):
    if log.value_reduced is not None:
        return Decimal(str(log.value_reduced))

    if log.unit_cost is not None:
        return Decimal(str(log.unit_cost)) * Decimal(str(log.quantity))

    inventory = getattr(log.product, "inventory", None)

    if not inventory or Decimal(str(inventory.quantity or 0)) <= 0:
        return ZERO

    return Decimal(str(inventory.total_value or 0)) / Decimal(str(inventory.quantity)) * Decimal(str(log.quantity))


def get_cogs_report(from_date, to_date):
    stock_logs = list(
        StockOutLog.objects.filter(
            used_at__date__range=(from_date, to_date)
        )
        .select_related("product", "product__inventory")
        .order_by("-used_at", "-id")
    )

    total_cogs = ZERO
    total_quantity = ZERO
    usage_list = []
    daily_totals_map = defaultdict(lambda: {"total_cogs": ZERO, "total_quantity": ZERO, "log_count": 0})
    reason_breakdown_map = defaultdict(lambda: {"total_cogs": ZERO, "total_quantity": ZERO, "log_count": 0})

    for log in stock_logs:
        quantity = Decimal(str(log.quantity or 0))
        line_cogs = _resolve_log_cost(log)
        total_cogs += line_cogs
        total_quantity += quantity

        log_day = log.used_at.date()
        daily_totals_map[log_day]["total_cogs"] += line_cogs
        daily_totals_map[log_day]["total_quantity"] += quantity
        daily_totals_map[log_day]["log_count"] += 1

        reason_key = (log.reason or "Unspecified").strip() or "Unspecified"
        reason_breakdown_map[reason_key]["total_cogs"] += line_cogs
        reason_breakdown_map[reason_key]["total_quantity"] += quantity
        reason_breakdown_map[reason_key]["log_count"] += 1

        usage_list.append({
            "id": log.id,
            "product_name": log.product.name,
            "quantity": log.quantity,
            "unit": log.product.unit,
            "reason": log.reason,
            "used_at": log.used_at,
            "estimated_cost": line_cogs,
        })

    daily_totals = [
        {
            "date": day,
            "total_cogs": values["total_cogs"],
            "total_quantity": values["total_quantity"],
            "log_count": values["log_count"],
        }
        for day, values in sorted(daily_totals_map.items(), key=lambda item: item[0])
    ]

    reason_breakdown = [
        {
            "reason": reason,
            "total_cogs": values["total_cogs"],
            "total_quantity": values["total_quantity"],
            "log_count": values["log_count"],
        }
        for reason, values in sorted(
            reason_breakdown_map.items(),
            key=lambda item: (-item[1]["total_cogs"], item[0].lower()),
        )
    ]

    return {
        "summary": {
            "total_cogs": total_cogs,
            "total_stock_out_logs": len(stock_logs),
            "total_quantity": total_quantity,
        },
        "daily_totals": daily_totals,
        "reason_breakdown": reason_breakdown,
        "usage": usage_list[:40],
    }
