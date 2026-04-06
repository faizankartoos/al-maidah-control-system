from rest_framework import serializers

from .models import (
    Inventory,
    Product,
    PurchaseBill,
    PurchaseItem,
    StockAdjustmentLog,
    StockOutLog,
)
from .services import (
    add_purchase_item,
    create_stock_adjustment,
    ensure_draft_bill,
    get_latest_unit_price_for_product,
    recalculate_purchase_bill_total,
    update_purchase_item,
)


class ProductBaseSerializer(serializers.ModelSerializer):
    last_unit_price = serializers.SerializerMethodField()

    def get_last_unit_price(self, obj):
        return get_latest_unit_price_for_product(obj)


class ProductSerializer(ProductBaseSerializer):
    class Meta:
        model = Product
        fields = ["id", "name", "unit", "low_stock_threshold", "last_unit_price", "created_at"]
        read_only_fields = ["id", "created_at"]


class ProductMiniSerializer(ProductBaseSerializer):
    class Meta:
        model = Product
        fields = ["id", "name", "unit", "low_stock_threshold", "last_unit_price"]
        read_only_fields = fields


class InventorySerializer(serializers.ModelSerializer):
    product_name = serializers.CharField(source="product.name", read_only=True)
    unit = serializers.CharField(source="product.unit", read_only=True)
    low_stock_threshold = serializers.DecimalField(
        source="product.low_stock_threshold",
        max_digits=12,
        decimal_places=2,
        read_only=True,
    )
    average_unit_cost = serializers.DecimalField(
        max_digits=12,
        decimal_places=2,
        read_only=True,
    )
    is_low_stock = serializers.SerializerMethodField()
    shortage_quantity = serializers.SerializerMethodField()

    class Meta:
        model = Inventory
        fields = [
            "id",
            "product",
            "product_name",
            "unit",
            "quantity",
            "total_value",
            "average_unit_cost",
            "low_stock_threshold",
            "is_low_stock",
            "shortage_quantity",
            "updated_at",
        ]
        read_only_fields = fields

    def get_is_low_stock(self, obj):
        threshold = obj.product.low_stock_threshold
        return threshold > 0 and obj.quantity <= threshold

    def get_shortage_quantity(self, obj):
        threshold = obj.product.low_stock_threshold
        if threshold > 0 and obj.quantity <= threshold:
            return threshold - obj.quantity
        return 0


class PurchaseItemSerializer(serializers.ModelSerializer):
    bill_id = serializers.PrimaryKeyRelatedField(
        source="bill",
        queryset=PurchaseBill.objects.all(),
        write_only=True,
        error_messages={"does_not_exist": "This bill does not exist."},
    )
    product_id = serializers.PrimaryKeyRelatedField(
        source="product",
        queryset=Product.objects.all(),
        write_only=True,
        error_messages={"does_not_exist": "This item does not exist."},
    )
    bill = serializers.IntegerField(source="bill.id", read_only=True)
    product = ProductMiniSerializer(read_only=True)
    unit_price = serializers.DecimalField(
        max_digits=12,
        decimal_places=2,
        required=False,
        allow_null=True,
    )

    class Meta:
        model = PurchaseItem
        fields = [
            "id",
            "bill",
            "bill_id",
            "product",
            "product_id",
            "quantity",
            "unit_price",
            "line_total",
            "created_at",
        ]
        read_only_fields = ["id", "bill", "product", "line_total", "created_at"]

    def validate(self, attrs):
        bill = attrs.get("bill") or getattr(self.instance, "bill", None)

        if bill:
            ensure_draft_bill(bill)

        return attrs

    def validate_quantity(self, value):
        if value <= 0:
            raise serializers.ValidationError("Quantity must be greater than zero.")
        return value

    def validate_unit_price(self, value):
        if value is None:
            return value
        if value <= 0:
            raise serializers.ValidationError("Unit price must be greater than zero.")
        return value

    def create(self, validated_data):
        validated_data.setdefault("unit_price", None)
        return add_purchase_item(**validated_data)

    def update(self, instance, validated_data):
        validated_data.pop("bill", None)
        if validated_data.get("unit_price") is None:
            validated_data.pop("unit_price", None)
        return update_purchase_item(instance, **validated_data)


class PurchaseBillSerializer(serializers.ModelSerializer):
    item_count = serializers.IntegerField(read_only=True)

    class Meta:
        model = PurchaseBill
        fields = [
            "id",
            "supplier_name",
            "bill_number",
            "bill_date",
            "status",
            "total_amount",
            "confirmed_at",
            "created_at",
            "updated_at",
            "item_count",
        ]
        read_only_fields = [
            "id",
            "status",
            "total_amount",
            "confirmed_at",
            "created_at",
            "updated_at",
            "item_count",
        ]


class PurchaseBillDetailSerializer(PurchaseBillSerializer):
    items = PurchaseItemSerializer(many=True, read_only=True)

    class Meta(PurchaseBillSerializer.Meta):
        fields = PurchaseBillSerializer.Meta.fields + ["items"]


class PurchaseBillUpdateSerializer(serializers.ModelSerializer):
    class Meta:
        model = PurchaseBill
        fields = ["supplier_name", "bill_number", "bill_date"]

    def validate(self, attrs):
        bill = self.instance
        ensure_draft_bill(bill)
        return attrs

    def update(self, instance, validated_data):
        for field, value in validated_data.items():
            setattr(instance, field, value)
        if validated_data:
            instance.save(update_fields=[*validated_data.keys(), "updated_at"])
        recalculate_purchase_bill_total(instance)
        return instance


class StockOutLogSerializer(serializers.ModelSerializer):
    product_id = serializers.PrimaryKeyRelatedField(
        source="product",
        queryset=Product.objects.all(),
        write_only=True,
        error_messages={"does_not_exist": "This item does not exist."},
    )
    product = ProductMiniSerializer(read_only=True)

    class Meta:
        model = StockOutLog
        fields = [
            "id",
            "product",
            "product_id",
            "quantity",
            "reason",
            "unit_cost",
            "value_reduced",
            "used_at",
        ]
        read_only_fields = ["id", "product", "unit_cost", "value_reduced", "used_at"]

    def validate_quantity(self, value):
        if value <= 0:
            raise serializers.ValidationError("Quantity must be greater than zero.")
        return value

    def validate_reason(self, value):
        value = value.strip()
        if not value:
            raise serializers.ValidationError("Reason is required.")
        return value


class StockAdjustmentLogSerializer(serializers.ModelSerializer):
    product_id = serializers.PrimaryKeyRelatedField(
        source="product",
        queryset=Product.objects.all(),
        write_only=True,
        error_messages={"does_not_exist": "This item does not exist."},
    )
    product = ProductMiniSerializer(read_only=True)
    unit_cost = serializers.DecimalField(
        max_digits=12,
        decimal_places=2,
        required=False,
        allow_null=True,
    )

    class Meta:
        model = StockAdjustmentLog
        fields = [
            "id",
            "product",
            "product_id",
            "adjustment_type",
            "quantity_change",
            "unit_cost",
            "value_change",
            "previous_quantity",
            "new_quantity",
            "previous_total_value",
            "new_total_value",
            "reason",
            "adjusted_at",
        ]
        read_only_fields = [
            "id",
            "product",
            "adjustment_type",
            "value_change",
            "previous_quantity",
            "new_quantity",
            "previous_total_value",
            "new_total_value",
            "adjusted_at",
        ]

    def validate_quantity_change(self, value):
        if value == 0:
            raise serializers.ValidationError("Adjustment quantity cannot be zero.")
        return value

    def validate_unit_cost(self, value):
        if value is not None and value <= 0:
            raise serializers.ValidationError("Unit cost must be greater than zero.")
        return value

    def validate_reason(self, value):
        value = value.strip()
        if not value:
            raise serializers.ValidationError("Reason is required.")
        return value

    def create(self, validated_data):
        return create_stock_adjustment(**validated_data)
