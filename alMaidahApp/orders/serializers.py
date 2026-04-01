from rest_framework import serializers
from .models import Order, OrderItem, OrderPayment


class OrderItemSerializer(serializers.ModelSerializer):
    class Meta:
        model = OrderItem
        fields = "__all__"


class OrderPaymentSerializer(serializers.ModelSerializer):
    class Meta:
        model = OrderPayment
        fields = "__all__"


class OrderSerializer(serializers.ModelSerializer):

    items = OrderItemSerializer(many=True, read_only=True)
    payments = OrderPaymentSerializer(many=True, read_only=True)

    customer_account_name = serializers.SerializerMethodField()
    delivery_boy_name = serializers.SerializerMethodField()
    payment_mode = serializers.SerializerMethodField()

    class Meta:
        model = Order
        fields = [
            "id",
            "order_type",
            "order_status",
            "payment_status",
            "customer_name",
            "customer_phone",
            "delivery_address",
            "order_note",
            "table_number",
            "scheduled_time",
            "guest_count",
            "cooked",
            "refunded",
            "refund_amount",
            "subtotal",
            "discount",
            "delivery_charge",
            "total_amount",
            "created_at",
            "customer_account",
            "customer_account_name",
            "delivery_boy",
            "delivery_boy_name",
            "payment_mode",
            "items",
            "payments",
        ]

    def get_customer_account_name(self, obj):
        if obj.customer_account:
            return obj.customer_account.name
        return None

    def get_delivery_boy_name(self, obj):
        if obj.delivery_boy:
            return obj.delivery_boy.name
        return None

    def get_payment_mode(self, obj):
        if obj.payments.exists():
            return obj.payments.last().payment_type
        return None
