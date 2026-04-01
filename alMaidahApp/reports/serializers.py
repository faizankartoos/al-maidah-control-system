from rest_framework import serializers


class DateRangeSerializer(serializers.Serializer):
    from_date = serializers.DateField(required=True)
    to_date = serializers.DateField(required=True)

    def validate(self, attrs):
        if attrs["to_date"] < attrs["from_date"]:
            raise serializers.ValidationError("To date cannot be earlier than from date.")
        return attrs


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
