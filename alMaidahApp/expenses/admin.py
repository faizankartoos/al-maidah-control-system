# expenses/admin.py

from django.contrib import admin
from .models import Expense, ExpenseCategory


@admin.register(ExpenseCategory)
class ExpenseCategoryAdmin(admin.ModelAdmin):
    list_display = ("name", "is_active", "created_at")
    search_fields = ("name",)
    list_filter = ("is_active",)


@admin.register(Expense)
class ExpenseAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "category",
        "amount",
        "payment_mode",
        "expense_date",
        "reference_id",
        "created_at",
    )
    list_filter = ("payment_mode", "category", "expense_date")
    search_fields = ("description", "reference_id", "category__name")
