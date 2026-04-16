from rest_framework import serializers
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from inventory.models import Product


class DateRangeSerializer(serializers.Serializer):
    from_date = serializers.DateField(required=True)
    to_date = serializers.DateField(required=True)

    def validate(self, attrs):
        if attrs["to_date"] < attrs["from_date"]:
            raise serializers.ValidationError("To date cannot be earlier than from date.")
        return attrs


class InventoryConsumptionRequestSerializer(DateRangeSerializer):
    product_id = serializers.PrimaryKeyRelatedField(
        source="product",
        queryset=Product.objects.all(),
        required=True,
    )


class DataInsightsRequestSerializer(DateRangeSerializer):
    timezone = serializers.CharField(required=False, allow_blank=True)

    def validate_timezone(self, value):
        if not value:
            return value

        try:
            ZoneInfo(value)
        except ZoneInfoNotFoundError:
            raise serializers.ValidationError("Enter a valid timezone.")

        return value


class SalesReportSerializer(serializers.Serializer):
    summary = serializers.DictField()
    order_type_breakdown = serializers.ListField(required=False)
    payment_breakdown = serializers.ListField(required=False)
    collection_channel_breakdown = serializers.ListField(required=False)
    daily_revenue = serializers.ListField(required=False)
    top_items = serializers.ListField(required=False)
    orders = serializers.ListField()

class CogsReportSerializer(serializers.Serializer):
    summary = serializers.DictField()
    daily_totals = serializers.ListField(required=False)
    reason_breakdown = serializers.ListField(required=False)
    usage = serializers.ListField()

class ExpensesReportSerializer(serializers.Serializer):
    summary = serializers.DictField()
    expenses = serializers.ListField()
    category_breakdown = serializers.ListField(required=False)
    payment_mode_breakdown = serializers.ListField(required=False)
    daily_totals = serializers.ListField(required=False)

class ProfitReportSerializer(serializers.Serializer):
    summary = serializers.DictField()
    breakdown = serializers.DictField()


class DashboardReportSerializer(serializers.Serializer):
    date_range = serializers.DictField()
    summary = serializers.DictField()
    snapshot = serializers.DictField()
    charts = serializers.DictField()
    details = serializers.DictField()
    sales = serializers.DictField()
    cogs = serializers.DictField()
    expenses = serializers.DictField()
    profit = serializers.DictField()


class InventoryConsumptionReportSerializer(serializers.Serializer):
    date_range = serializers.DictField()
    product = serializers.DictField()
    summary = serializers.DictField()
    charts = serializers.DictField()
    details = serializers.DictField()


class DataInsightsReportSerializer(serializers.Serializer):
    date_range = serializers.DictField()
    summary = serializers.DictField()
    charts = serializers.DictField()
    rankings = serializers.DictField()
    insights = serializers.DictField()
