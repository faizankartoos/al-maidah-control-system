from collections import defaultdict
from datetime import datetime, time, timedelta
from decimal import Decimal

from django.utils import timezone

from inventory.models import Inventory, Product, PurchaseItem, StockOutLog


ZERO = Decimal("0.00")


def _decimal(value):
    return Decimal(str(value or 0))


def _resolve_stock_out_value(log):
    if log.value_reduced is not None:
        return _decimal(log.value_reduced)

    if log.unit_cost is not None:
        return _decimal(log.unit_cost) * _decimal(log.quantity)

    return ZERO


def _purchase_event_datetime(item):
    if item.bill.confirmed_at:
        return item.bill.confirmed_at

    naive = datetime.combine(item.bill.bill_date, time(hour=9, minute=0))
    return timezone.make_aware(naive, timezone.get_current_timezone())


def get_inventory_consumption_report(from_date, to_date, product: Product):
    inventory = Inventory.objects.select_related("product").filter(product=product).first()

    purchase_items = list(
        PurchaseItem.objects.filter(
            product=product,
            bill__status="CONFIRMED",
            bill__bill_date__range=(from_date, to_date),
        )
        .select_related("bill", "product")
        .order_by("bill__bill_date", "bill_id", "id")
    )

    stock_out_logs = list(
        StockOutLog.objects.filter(
            product=product,
            used_at__date__range=(from_date, to_date),
        )
        .select_related("product")
        .order_by("used_at", "id")
    )

    total_stocked_in_qty = ZERO
    total_stocked_in_value = ZERO
    total_stocked_out_qty = ZERO
    total_stocked_out_value = ZERO

    timeline = []
    daily_map = defaultdict(
        lambda: {
            "stocked_in_qty": ZERO,
            "stocked_in_value": ZERO,
            "stocked_out_qty": ZERO,
            "stocked_out_value": ZERO,
        }
    )

    for item in purchase_items:
        quantity = _decimal(item.quantity)
        line_total = _decimal(item.line_total)
        occurred_at = _purchase_event_datetime(item)
        total_stocked_in_qty += quantity
        total_stocked_in_value += line_total

        day = item.bill.bill_date
        daily_map[day]["stocked_in_qty"] += quantity
        daily_map[day]["stocked_in_value"] += line_total

        timeline.append(
            {
                "id": f"stock-in-{item.id}",
                "event_type": "STOCK_IN",
                "label": "Stock In",
                "occurred_at": occurred_at,
                "quantity": item.quantity,
                "value": item.line_total,
                "unit_price": item.unit_price,
                "reference": item.bill.bill_number or f"Bill #{item.bill_id}",
                "notes": item.bill.supplier_name,
            }
        )

    for log in stock_out_logs:
        quantity = _decimal(log.quantity)
        line_total = _resolve_stock_out_value(log)
        total_stocked_out_qty += quantity
        total_stocked_out_value += line_total

        day = log.used_at.date()
        daily_map[day]["stocked_out_qty"] += quantity
        daily_map[day]["stocked_out_value"] += line_total

        timeline.append(
            {
                "id": f"stock-out-{log.id}",
                "event_type": "STOCK_OUT",
                "label": "Stock Out",
                "occurred_at": log.used_at,
                "quantity": log.quantity,
                "value": line_total,
                "unit_price": log.unit_cost,
                "reference": "Stock Out",
                "notes": log.reason,
            }
        )

    timeline.sort(key=lambda row: (row["occurred_at"], row["id"]), reverse=True)

    current_stock = _decimal(inventory.quantity) if inventory else ZERO
    current_value = _decimal(inventory.total_value) if inventory else ZERO
    average_unit_cost = _decimal(inventory.average_unit_cost) if inventory else ZERO

    days_in_range = Decimal(str((to_date - from_date).days + 1))
    average_daily_usage = (
        total_stocked_out_qty / days_in_range if days_in_range > 0 and total_stocked_out_qty > 0 else ZERO
    )
    days_per_unit_used = (
        days_in_range / total_stocked_out_qty if total_stocked_out_qty > 0 else None
    )
    current_stock_cover_days = (
        current_stock / average_daily_usage if average_daily_usage > 0 else None
    )

    daily_movements = []
    day = from_date
    while day <= to_date:
        row = daily_map[day]
        daily_movements.append(
            {
                "date": day,
                "stocked_in_qty": row["stocked_in_qty"],
                "stocked_in_value": row["stocked_in_value"],
                "stocked_out_qty": row["stocked_out_qty"],
                "stocked_out_value": row["stocked_out_value"],
                "net_qty_change": row["stocked_in_qty"] - row["stocked_out_qty"],
            }
        )
        day += timedelta(days=1)

    return {
        "date_range": {
            "from_date": from_date,
            "to_date": to_date,
            "days": int(days_in_range),
        },
        "product": {
            "id": product.id,
            "name": product.name,
            "unit": product.unit,
            "current_stock": current_stock,
            "current_value": current_value,
            "average_unit_cost": average_unit_cost,
        },
        "summary": {
            "total_stocked_in_qty": total_stocked_in_qty,
            "total_stocked_in_value": total_stocked_in_value,
            "total_stocked_out_qty": total_stocked_out_qty,
            "total_stocked_out_value": total_stocked_out_value,
            "net_quantity_change": total_stocked_in_qty - total_stocked_out_qty,
            "average_daily_usage": average_daily_usage,
            "days_per_unit_used": days_per_unit_used,
            "current_stock_cover_days": current_stock_cover_days,
            "stock_in_events_count": len(purchase_items),
            "stock_out_events_count": len(stock_out_logs),
            "timeline_events_count": len(timeline),
        },
        "charts": {
            "daily_movements": daily_movements,
        },
        "details": {
            "timeline": timeline[:120],
            "stock_in_events": [row for row in timeline if row["event_type"] == "STOCK_IN"][:60],
            "stock_out_events": [row for row in timeline if row["event_type"] == "STOCK_OUT"][:60],
        },
    }
