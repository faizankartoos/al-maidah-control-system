from decimal import Decimal

from rest_framework import serializers

from .models import Expense, ExpenseCategory


class ExpenseCategorySerializer(serializers.ModelSerializer):
    expense_count = serializers.IntegerField(read_only=True)
    total_spend = serializers.DecimalField(
        max_digits=12,
        decimal_places=2,
        read_only=True,
    )

    class Meta:
        model = ExpenseCategory
        fields = (
            "id",
            "name",
            "description",
            "is_active",
            "created_at",
            "expense_count",
            "total_spend",
        )
        read_only_fields = ("id", "created_at")

    def validate_name(self, value):
        cleaned = value.strip()

        if not cleaned:
            raise serializers.ValidationError("Category name is required.")

        queryset = ExpenseCategory.objects.filter(name__iexact=cleaned)

        if self.instance:
            queryset = queryset.exclude(id=self.instance.id)

        if queryset.exists():
            raise serializers.ValidationError("Category with this name already exists.")

        return cleaned

    def validate_description(self, value):
        if value is None:
            return None

        cleaned = value.strip()
        return cleaned or None


class ExpenseSerializer(serializers.ModelSerializer):
    category_name = serializers.CharField(
        source="category.name",
        read_only=True
    )
    payment_mode_display = serializers.CharField(
        source="get_payment_mode_display",
        read_only=True,
    )

    class Meta:
        model = Expense
        fields = (
            "id",
            "category",
            "category_name",
            "amount",
            "payment_mode",
            "payment_mode_display",
            "expense_date",
            "description",
            "reference_id",
            "created_at",
        )
        read_only_fields = ("id", "created_at")

    def validate_category(self, value):
        if not value.is_active:
            raise serializers.ValidationError("Please choose an active category.")
        return value

    def validate_amount(self, value):
        if value <= Decimal("0.00"):
            raise serializers.ValidationError("Amount must be greater than zero.")
        return value

    def validate_description(self, value):
        if value is None:
            return None

        cleaned = value.strip()
        return cleaned or None

    def validate_reference_id(self, value):
        if value is None:
            return None

        cleaned = value.strip()
        return cleaned or None
