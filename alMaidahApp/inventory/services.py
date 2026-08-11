from decimal import Decimal

from django.core.exceptions import ValidationError
from django.db import transaction
from django.db.models import Sum
from django.utils import timezone

from .models import (
    Inventory,
    Product,
    PurchaseBill,
    PurchaseItem,
    StockAdjustmentLog,
    StockOutLog,
)


def _average_unit_cost(quantity, total_value):
    if quantity <= 0:
        return Decimal("0.00")
    return total_value / quantity


def recalculate_purchase_bill_total(bill: PurchaseBill):
    total_amount = bill.items.aggregate(
        total=Sum("line_total")
    )["total"] or Decimal("0")

    PurchaseBill.objects.filter(pk=bill.pk).update(total_amount=total_amount)
    bill.total_amount = total_amount
    return bill


def ensure_draft_bill(bill: PurchaseBill):
    if bill.status != "DRAFT":
        raise ValidationError("Only draft bills can be changed.")


def get_latest_unit_price_for_product(product: Product):
    latest_item = (
        PurchaseItem.objects.filter(product=product)
        .order_by("-created_at", "-id")
        .only("unit_price")
        .first()
    )
    return latest_item.unit_price if latest_item else None


@transaction.atomic
def add_purchase_item(*, bill: PurchaseBill, product, quantity, unit_price):
    ensure_draft_bill(bill)

    if unit_price is None:
        unit_price = get_latest_unit_price_for_product(product)

    if unit_price is None:
        raise ValidationError(
            "Enter unit_price because last price for the same item wasn't found."
        )

    item = PurchaseItem.objects.create(
        bill=bill,
        product=product,
        quantity=quantity,
        unit_price=unit_price,
    )
    recalculate_purchase_bill_total(bill)
    return item


@transaction.atomic
def update_purchase_item(item: PurchaseItem, **changes):
    ensure_draft_bill(item.bill)

    for field, value in changes.items():
        setattr(item, field, value)

    item.save()
    recalculate_purchase_bill_total(item.bill)
    return item


@transaction.atomic
def delete_purchase_item(item: PurchaseItem):
    bill = item.bill
    ensure_draft_bill(bill)
    item.delete()
    recalculate_purchase_bill_total(bill)


@transaction.atomic
def delete_purchase_bill(bill: PurchaseBill):
    ensure_draft_bill(bill)
    bill.delete()


@transaction.atomic
def confirm_purchase_bill(bill: PurchaseBill):
    bill = (
        PurchaseBill.objects.select_for_update()
        .prefetch_related("items__product")
        .get(pk=bill.pk)
    )
    ensure_draft_bill(bill)

    items = list(bill.items.all())
    if not items:
        raise ValidationError("Cannot confirm empty bill.")

    total_amount = Decimal("0")

    for item in items:
        inventory, _ = Inventory.objects.get_or_create(
            product=item.product,
            defaults={"quantity": 0, "total_value": 0},
        )
        inventory = Inventory.objects.select_for_update().get(pk=inventory.pk)

        inventory.quantity += item.quantity
        inventory.total_value += item.line_total
        inventory.save()

        total_amount += item.line_total

    bill.total_amount = total_amount
    bill.status = "CONFIRMED"
    bill.confirmed_at = timezone.now()
    bill.save(update_fields=["total_amount", "status", "confirmed_at", "updated_at"])

    return bill


@transaction.atomic
def create_stock_out(*, product, quantity, reason):
    if quantity <= 0:
        raise ValidationError("Quantity must be greater than zero.")

    inventory = (
        Inventory.objects.select_for_update()
        .filter(product=product)
        .first()
    )

    if not inventory:
        raise ValidationError("This item is not in inventory yet.")

    if inventory.quantity < quantity:
        raise ValidationError("Insufficient stock.")

    unit_cost = _average_unit_cost(inventory.quantity, inventory.total_value)
    value_to_reduce = unit_cost * quantity

    inventory.quantity -= quantity
    inventory.total_value -= value_to_reduce
    if inventory.quantity == 0:
        inventory.total_value = Decimal("0.00")
    inventory.save()

    stock_out = StockOutLog.objects.create(
        product=product,
        quantity=quantity,
        reason=reason,
        unit_cost=unit_cost,
        value_reduced=value_to_reduce,
    )

    return stock_out, inventory


@transaction.atomic
def create_stock_adjustment(*, product, quantity_change, reason, unit_cost=None):
    if quantity_change == 0:
        raise ValidationError("Adjustment quantity cannot be zero.")

    inventory, _ = Inventory.objects.get_or_create(
        product=product,
        defaults={"quantity": 0, "total_value": 0},
    )
    inventory = Inventory.objects.select_for_update().get(pk=inventory.pk)

    previous_quantity = inventory.quantity
    previous_total_value = inventory.total_value
    current_unit_cost = _average_unit_cost(previous_quantity, previous_total_value)

    if quantity_change > 0:
        if unit_cost is not None and unit_cost <= 0:
            raise ValidationError("Unit cost must be greater than zero.")

        if unit_cost is None:
            if current_unit_cost <= 0:
                raise ValidationError(
                    "Unit cost is required when increasing stock without an existing average cost."
                )
            unit_cost = current_unit_cost

        value_change = unit_cost * quantity_change
        inventory.quantity += quantity_change
        inventory.total_value += value_change
        adjustment_type = "INCREASE"
    else:
        quantity_to_reduce = abs(quantity_change)
        if previous_quantity < quantity_to_reduce:
            raise ValidationError("Insufficient stock for this adjustment.")

        unit_cost = current_unit_cost
        value_change = -(unit_cost * quantity_to_reduce)
        inventory.quantity -= quantity_to_reduce
        inventory.total_value += value_change
        if inventory.quantity == 0:
            inventory.total_value = Decimal("0.00")
        adjustment_type = "DECREASE"

    inventory.save()

    adjustment = StockAdjustmentLog.objects.create(
        product=product,
        adjustment_type=adjustment_type,
        quantity_change=quantity_change,
        unit_cost=unit_cost,
        value_change=value_change,
        previous_quantity=previous_quantity,
        new_quantity=inventory.quantity,
        previous_total_value=previous_total_value,
        new_total_value=inventory.total_value,
        reason=reason,
    )

    return adjustment, inventory


@transaction.atomic
def reset_inventory_snapshot_to_zero():
    inventory_rows = list(Inventory.objects.select_for_update().select_related("product").all())
    reset_items_count = 0

    for inventory in inventory_rows:
        if inventory.quantity != 0 or inventory.total_value != 0:
            reset_items_count += 1

        inventory.quantity = Decimal("0.00")
        inventory.total_value = Decimal("0.00")
        inventory.save(update_fields=["quantity", "total_value", "updated_at"])

    return {
        "inventory_items_count": len(inventory_rows),
        "reset_items_count": reset_items_count,
    }


def list_low_stock_items():
    rows = []

    products = Product.objects.order_by("name").select_related("inventory")

    for product in products:
        threshold = product.low_stock_threshold or Decimal("0.00")
        if threshold <= 0:
            continue

        try:
            inventory = product.inventory
        except Inventory.DoesNotExist:
            inventory = None

        quantity = inventory.quantity if inventory else Decimal("0.00")

        if quantity <= threshold:
            rows.append(
                {
                    "product_id": product.id,
                    "product_name": product.name,
                    "unit": product.unit,
                    "quantity": quantity,
                    "low_stock_threshold": threshold,
                    "shortage_quantity": threshold - quantity,
                    "updated_at": inventory.updated_at if inventory else None,
                }
            )

    return sorted(
        rows,
        key=lambda item: (item["shortage_quantity"], item["product_name"].lower()),
        reverse=True,
    )


def get_inventory_history(filters=None):
    product_id = (filters or {}).get("product")

    purchase_items = PurchaseItem.objects.select_related("bill", "product").filter(
        bill__status="CONFIRMED"
    )
    stock_out_logs = StockOutLog.objects.select_related("product").all()
    adjustment_logs = StockAdjustmentLog.objects.select_related("product").all()

    if product_id:
        purchase_items = purchase_items.filter(product_id=product_id)
        stock_out_logs = stock_out_logs.filter(product_id=product_id)
        adjustment_logs = adjustment_logs.filter(product_id=product_id)

    entries = []

    for item in purchase_items:
        entries.append(
            {
                "id": f"stock-in-{item.id}",
                "entry_type": "STOCK_IN",
                "entry_type_display": "Stock In",
                "product_id": item.product_id,
                "product_name": item.product.name,
                "unit": item.product.unit,
                "quantity": item.quantity,
                "quantity_change": item.quantity,
                "unit_cost": item.unit_price,
                "value_change": item.line_total,
                "reference": f"Bill #{item.bill_id}",
                "notes": item.bill.supplier_name,
                "occurred_at": item.bill.confirmed_at or item.bill.updated_at or item.bill.created_at,
            }
        )

    for log in stock_out_logs:
        entries.append(
            {
                "id": f"stock-out-{log.id}",
                "entry_type": "STOCK_OUT",
                "entry_type_display": "Stock Out",
                "product_id": log.product_id,
                "product_name": log.product.name,
                "unit": log.product.unit,
                "quantity": log.quantity,
                "quantity_change": -log.quantity,
                "unit_cost": log.unit_cost,
                "value_change": -log.value_reduced if log.value_reduced is not None else None,
                "reference": "Stock Out",
                "notes": log.reason,
                "occurred_at": log.used_at,
            }
        )

    for log in adjustment_logs:
        entries.append(
            {
                "id": f"adjustment-{log.id}",
                "entry_type": f"ADJUSTMENT_{log.adjustment_type}",
                "entry_type_display": (
                    "Adjustment In" if log.adjustment_type == "INCREASE" else "Adjustment Out"
                ),
                "product_id": log.product_id,
                "product_name": log.product.name,
                "unit": log.product.unit,
                "quantity": abs(log.quantity_change),
                "quantity_change": log.quantity_change,
                "unit_cost": log.unit_cost,
                "value_change": log.value_change,
                "reference": "Manual Adjustment",
                "notes": log.reason,
                "occurred_at": log.adjusted_at,
            }
        )

    entries.sort(
        key=lambda item: (
            item["occurred_at"] or timezone.now(),
            item["id"],
        ),
        reverse=True,
    )

    return {
        "summary": {
            "total_entries": len(entries),
            "stock_in_count": sum(1 for item in entries if item["entry_type"] == "STOCK_IN"),
            "stock_out_count": sum(1 for item in entries if item["entry_type"] == "STOCK_OUT"),
            "adjustment_count": sum(
                1 for item in entries if item["entry_type"].startswith("ADJUSTMENT_")
            ),
        },
        "entries": entries,
    }
