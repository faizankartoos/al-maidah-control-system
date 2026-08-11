from rest_framework import serializers

from .models import LedgerAccount


def normalize_contact_number(value):
    if value in ("", None):
        return None

    cleaned = str(value).strip()
    return cleaned or None


def find_conflicting_contact_account(contact_number, exclude_account_id=None):
    cleaned = normalize_contact_number(contact_number)

    if not cleaned:
        return None

    queryset = LedgerAccount.objects.filter(contact_number=cleaned)

    if exclude_account_id:
        queryset = queryset.exclude(id=exclude_account_id)

    return queryset.first()


def serialize_conflicting_account(account):
    if not account:
        return None

    return {
        "id": account.id,
        "name": account.name or "Unnamed account",
        "account_type": account.account_type,
        "account_type_display": account.get_account_type_display(),
        "contact_number": account.contact_number,
        "address": account.address,
        "is_active": account.is_active,
    }


def build_contact_conflict_message(account):
    if not account:
        return "This phone number is already linked to another ledger account."

    account_name = (account.name or "Unnamed account").strip() or "Unnamed account"
    account_label = account.get_account_type_display().lower()

    if not account.is_active:
        return (
            f'This phone number is already reserved by archived {account_label} '
            f'"{account_name}". Restore or edit that account instead of creating a new one.'
        )

    if account.account_type == "VENDOR":
        return (
            f'This phone number is already linked to vendor account "{account_name}". '
            "Open Vendor Ledger to update the existing account instead of creating a duplicate."
        )

    return f'This phone number is already linked to {account_label} "{account_name}".'


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
        extra_kwargs = {
            "contact_number": {
                "validators": [],
            },
        }

    def validate_name(self, value):
        cleaned = value.strip()

        if not cleaned:
            raise serializers.ValidationError("Account name is required.")

        account_type = self.initial_data.get("account_type") or getattr(self.instance, "account_type", None)

        queryset = LedgerAccount.objects.filter(
            name__iexact=cleaned,
            account_type=account_type,
            is_active=True,
        )

        if self.instance:
            queryset = queryset.exclude(id=self.instance.id)

        if queryset.exists() and self.initial_data.get("account_type") in {"DELIVERY", "VENDOR", "CASH"}:
            raise serializers.ValidationError("An account with this name already exists for that type.")

        return cleaned

    def validate_contact_number(self, value):
        cleaned = normalize_contact_number(value)

        if cleaned is None:
            return None

        conflicting_account = find_conflicting_contact_account(
            cleaned,
            exclude_account_id=getattr(self.instance, "id", None),
        )

        if conflicting_account:
            raise serializers.ValidationError(build_contact_conflict_message(conflicting_account))

        return cleaned

    def validate(self, attrs):
        if self.instance and "account_type" in attrs and attrs["account_type"] != self.instance.account_type:
            raise serializers.ValidationError(
                {"account_type": "Account type cannot be changed after creation."}
            )

        account_type = attrs.get("account_type") or getattr(self.instance, "account_type", None)

        if account_type == "CASH":
            raise serializers.ValidationError(
                {"account_type": "Cash drawer is system-managed and should not be created manually."}
            )

        return attrs
