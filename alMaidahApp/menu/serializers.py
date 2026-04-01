from rest_framework import serializers

from .models import Menu


def normalize_text(value):
    return " ".join(value.strip().split())


class MenuSerializer(serializers.ModelSerializer):
    class Meta:
        model = Menu
        fields = [
            "id",
            "name",
            "category",
            "price",
            "is_available",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ("id", "created_at", "updated_at")

    def validate_name(self, value):
        value = normalize_text(value)
        if not value:
            raise serializers.ValidationError("Item name is required.")
        return value

    def validate_category(self, value):
        value = normalize_text(value)
        if not value:
            raise serializers.ValidationError("Category is required.")
        return value

    def validate_price(self, value):
        if value <= 0:
            raise serializers.ValidationError("Price must be greater than zero.")
        return value

    def validate(self, attrs):
        name = attrs.get("name", getattr(self.instance, "name", ""))
        category = attrs.get("category", getattr(self.instance, "category", ""))

        duplicate_qs = Menu.objects.filter(
            name__iexact=name,
            category__iexact=category,
        )

        if self.instance:
            duplicate_qs = duplicate_qs.exclude(pk=self.instance.pk)

        if duplicate_qs.exists():
            raise serializers.ValidationError(
                {"name": "This menu item already exists in this category."}
            )

        return attrs
