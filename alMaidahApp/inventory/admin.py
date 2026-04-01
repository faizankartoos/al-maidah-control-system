from django.contrib import admin, messages
from django.core.exceptions import ValidationError

from .models import (
    Inventory,
    Product,
    PurchaseBill,
    PurchaseItem,
    StockAdjustmentLog,
    StockOutLog,
)
from .services import (
    confirm_purchase_bill,
    create_stock_adjustment,
    create_stock_out,
    recalculate_purchase_bill_total,
)


@admin.register(Product)
class ProductAdmin(admin.ModelAdmin):
    list_display = ("name", "unit", "low_stock_threshold", "created_at")
    search_fields = ("name",)


@admin.register(Inventory)
class InventoryAdmin(admin.ModelAdmin):
    list_display = ("product", "quantity", "total_value", "updated_at")
    readonly_fields = ("updated_at",)


class PurchaseItemInline(admin.TabularInline):
    model = PurchaseItem
    extra = 1
    readonly_fields = ("line_total", "created_at")


@admin.register(PurchaseBill)
class PurchaseBillAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "supplier_name",
        "bill_number",
        "bill_date",
        "status",
        "total_amount",
        "confirmed_at",
    )
    readonly_fields = (
        "status",
        "total_amount",
        "confirmed_at",
        "created_at",
        "updated_at",
    )
    inlines = [PurchaseItemInline]
    actions = ["confirm_selected_bills"]

    @admin.action(description="Confirm selected draft bills")
    def confirm_selected_bills(self, request, queryset):
        confirmed = 0

        for bill in queryset:
            try:
                confirm_purchase_bill(bill)
            except ValidationError as exc:
                self.message_user(
                    request,
                    f"Bill #{bill.id}: {exc.messages[0]}",
                    level=messages.ERROR,
                )
                continue

            confirmed += 1

        if confirmed:
            self.message_user(
                request,
                f"{confirmed} bill(s) confirmed successfully.",
                level=messages.SUCCESS,
            )

    def save_related(self, request, form, formsets, change):
        super().save_related(request, form, formsets, change)
        recalculate_purchase_bill_total(form.instance)


@admin.register(StockOutLog)
class StockOutLogAdmin(admin.ModelAdmin):
    list_display = ("product", "quantity", "unit_cost", "value_reduced", "reason", "used_at")
    list_filter = ("used_at",)
    readonly_fields = ("used_at",)

    def has_change_permission(self, request, obj=None):
        if obj is not None:
            return False
        return super().has_change_permission(request, obj)

    def save_model(self, request, obj, form, change):
        if change:
            return

        created, _inventory = create_stock_out(
            product=obj.product,
            quantity=obj.quantity,
            reason=obj.reason,
        )
        obj.pk = created.pk
        obj.used_at = created.used_at


@admin.register(StockAdjustmentLog)
class StockAdjustmentLogAdmin(admin.ModelAdmin):
    list_display = (
        "product",
        "adjustment_type",
        "quantity_change",
        "unit_cost",
        "value_change",
        "reason",
        "adjusted_at",
    )
    list_filter = ("adjustment_type", "adjusted_at")
    readonly_fields = ("adjusted_at",)

    def has_change_permission(self, request, obj=None):
        if obj is not None:
            return False
        return super().has_change_permission(request, obj)

    def get_readonly_fields(self, request, obj=None):
        if obj is None:
            return ("adjusted_at",)

        return (
            "adjustment_type",
            "unit_cost",
            "value_change",
            "previous_quantity",
            "new_quantity",
            "previous_total_value",
            "new_total_value",
            "adjusted_at",
        )

    def save_model(self, request, obj, form, change):
        if change:
            return

        created, _inventory = create_stock_adjustment(
            product=obj.product,
            quantity_change=obj.quantity_change,
            reason=obj.reason,
            unit_cost=obj.unit_cost,
        )
        obj.pk = created.pk
        obj.adjusted_at = created.adjusted_at
