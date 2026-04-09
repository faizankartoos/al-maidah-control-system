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
    acceptance_status_display = serializers.SerializerMethodField()
    submission_source_display = serializers.SerializerMethodField()
    submitted_by_name = serializers.SerializerMethodField()
    submitted_by_username = serializers.SerializerMethodField()
    acceptance_decided_by_name = serializers.SerializerMethodField()

    class Meta:
        model = Order
        fields = [
            "id",
            "order_type",
            "order_status",
            "payment_status",
            "submission_source",
            "submission_source_display",
            "acceptance_status",
            "acceptance_status_display",
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
            "completed_at",
            "cancelled_at",
            "submitted_by",
            "submitted_by_name",
            "submitted_by_username",
            "acceptance_decided_by",
            "acceptance_decided_by_name",
            "acceptance_decided_at",
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

    def get_acceptance_status_display(self, obj):
        return obj.get_acceptance_status_display()

    def get_submission_source_display(self, obj):
        return obj.get_submission_source_display()

    def get_submitted_by_name(self, obj):
        if not obj.submitted_by:
            return None

        full_name = obj.submitted_by.get_full_name().strip()
        return full_name or obj.submitted_by.username

    def get_submitted_by_username(self, obj):
        if not obj.submitted_by:
            return None
        return obj.submitted_by.username

    def get_acceptance_decided_by_name(self, obj):
        if not obj.acceptance_decided_by:
            return None

        full_name = obj.acceptance_decided_by.get_full_name().strip()
        return full_name or obj.acceptance_decided_by.username
