from django.contrib import admin

# Register your models here.
from django.contrib import admin
from .models import Order, OrderItem, OrderPayment


class OrderItemInline(admin.TabularInline):
    model = OrderItem
    extra = 1

class OrderPaymentInline(admin.TabularInline):
    model = OrderPayment
    extra = 0
    fields = (
        "amount",
        "payment_type",
        "cash_amount",
        "online_amount",
        "created_at",
    )
    readonly_fields = fields


@admin.register(Order)
class OrderAdmin(admin.ModelAdmin):

    list_display = (
        "id",
        "order_type",
        "order_status",
        "payment_status",
        "total_amount",
        "created_at",
        "scheduled_time",
        "guest_count",
        "cooked"
    )

    inlines = [OrderItemInline, OrderPaymentInline]


@admin.register(OrderItem)
class OrderItemAdmin(admin.ModelAdmin):

    list_display = (
        "order",
        "item_name",
        "quantity",
        "price",
        "total_price",
    )

@admin.register(OrderPayment)
class OrderPaymentAdmin(admin.ModelAdmin):

    list_display = (
        "order",
        "amount",
        "payment_type",
        "cash_amount",
        "online_amount",
        "created_at",
    )
