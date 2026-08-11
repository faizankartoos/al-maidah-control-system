from django.contrib import admin
from .models import LedgerAccount, LedgerEntry


@admin.register(LedgerAccount)
class LedgerAccountAdmin(admin.ModelAdmin):

    list_display = (
        "id",
        "name",
        "account_type",
        "contact_number",
        "archived_contact_number",
        "is_active",
        "balance",
        "created_at",
    )

    search_fields = ("name", "contact_number", "archived_contact_number")


@admin.register(LedgerEntry)
class LedgerEntryAdmin(admin.ModelAdmin):

    list_display = (
        "id",
        "ledger_account",
        "entry_type",
        "amount",
        "payment_type",
        "reference",
        "created_at",
    )

    list_filter = ("entry_type", "payment_type")
