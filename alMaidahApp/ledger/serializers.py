from rest_framework import serializers

from .models import LedgerAccount


class AccountSerializer(serializers.ModelSerializer):
    balance = serializers.SerializerMethodField()
    account_type_display = serializers.CharField(
        source="get_account_type_display",
        read_only=True,
    )

    class Meta:
        model = LedgerAccount
        fields = [
            "id",
            "name",
            "account_type",
            "account_type_display",
            "contact_number",
            "address",
            "opening_balance",
            "is_active",
            "created_at",
            "balance"
        ]

    def get_balance(self, obj):
        return obj.balance


class AccountWriteSerializer(serializers.ModelSerializer):

    class Meta:
        model = LedgerAccount
        fields = [
            "id",
            "name",
            "account_type",
            "contact_number",
            "address",
            "opening_balance",
            "is_active",
        ]
        read_only_fields = ["id"]

    def validate_name(self, value):
        cleaned = value.strip()

        if not cleaned:
            raise serializers.ValidationError("Account name is required.")

        account_type = self.initial_data.get("account_type") or getattr(self.instance, "account_type", None)

        queryset = LedgerAccount.objects.filter(
            name__iexact=cleaned,
            account_type=account_type,
        )

        if self.instance:
            queryset = queryset.exclude(id=self.instance.id)

        if queryset.exists() and self.initial_data.get("account_type") in {"DELIVERY", "VENDOR", "CASH"}:
            raise serializers.ValidationError("An account with this name already exists for that type.")

        return cleaned

    def validate_contact_number(self, value):
        if value in ("", None):
            return None

        cleaned = str(value).strip()

        queryset = LedgerAccount.objects.filter(contact_number=cleaned)

        if self.instance:
            queryset = queryset.exclude(id=self.instance.id)

        if queryset.exists():
            raise serializers.ValidationError("An account with this phone number already exists.")

        return cleaned

    def validate(self, attrs):
        if self.instance and "account_type" in attrs and attrs["account_type"] != self.instance.account_type:
            raise serializers.ValidationError(
                {"account_type": "Account type cannot be changed after creation."}
            )

        account_type = attrs.get("account_type") or getattr(self.instance, "account_type", None)
        contact_number = attrs.get("contact_number", getattr(self.instance, "contact_number", None))

        if account_type == "CASH":
            raise serializers.ValidationError(
                {"account_type": "Cash drawer is system-managed and should not be created manually."}
            )

        if account_type in {"CUSTOMER", "DELIVERY"} and not contact_number:
            raise serializers.ValidationError(
                {"contact_number": "Phone number is required for customer and delivery accounts."}
            )

        return attrs
