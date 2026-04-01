from decimal import Decimal

from django.db import transaction
from django.db.models import Count, Q, Sum
from django.db.models.functions import Coalesce

from .models import Expense, ExpenseCategory


def _payment_mode_breakdown(queryset):
    rows = (
        queryset
        .values("payment_mode")
        .annotate(
            total_amount=Coalesce(Sum("amount"), Decimal("0.00")),
            expense_count=Count("id"),
        )
        .order_by("-total_amount", "payment_mode")
    )

    labels = dict(Expense.PAYMENT_MODES)

    return [
        {
            "payment_mode": row["payment_mode"],
            "payment_mode_display": labels.get(row["payment_mode"], row["payment_mode"]),
            "total_amount": row["total_amount"],
            "expense_count": row["expense_count"],
        }
        for row in rows
    ]


def _category_breakdown(queryset):
    rows = (
        queryset
        .values("category", "category__name")
        .annotate(
            total_amount=Coalesce(Sum("amount"), Decimal("0.00")),
            expense_count=Count("id"),
        )
        .order_by("-total_amount", "category__name")
    )

    return [
        {
            "category_id": row["category"],
            "category_name": row["category__name"],
            "total_amount": row["total_amount"],
            "expense_count": row["expense_count"],
        }
        for row in rows
    ]


def _daily_totals(queryset):
    rows = (
        queryset
        .values("expense_date")
        .annotate(
            total_amount=Coalesce(Sum("amount"), Decimal("0.00")),
            expense_count=Count("id"),
        )
        .order_by("expense_date")
    )

    return [
        {
            "expense_date": row["expense_date"],
            "total_amount": row["total_amount"],
            "expense_count": row["expense_count"],
        }
        for row in rows
    ]


def build_expense_queryset(filters=None):
    queryset = (
        Expense.objects
        .select_related("category")
        .order_by("-expense_date", "-created_at", "-id")
    )

    if not filters:
        return queryset

    category = filters.get("category")
    start_date = filters.get("start_date")
    end_date = filters.get("end_date")
    payment_mode = filters.get("payment_mode")
    search = (filters.get("search") or "").strip()

    if category:
        queryset = queryset.filter(category_id=category)

    if start_date:
        queryset = queryset.filter(expense_date__gte=start_date)

    if end_date:
        queryset = queryset.filter(expense_date__lte=end_date)

    if payment_mode:
        queryset = queryset.filter(payment_mode=payment_mode)

    if search:
        queryset = queryset.filter(
            Q(category__name__icontains=search)
            | Q(description__icontains=search)
            | Q(reference_id__icontains=search)
        )

    return queryset


@transaction.atomic
def create_expense(validated_data):
    """
    Creates an expense record for reporting and audit use.
    """

    return Expense.objects.create(**validated_data)


def list_expense_categories(include_inactive=False):
    queryset = ExpenseCategory.objects.all()

    if not include_inactive:
        queryset = queryset.filter(is_active=True)

    return queryset.annotate(
        expense_count=Count("expenses"),
        total_spend=Coalesce(Sum("expenses__amount"), Decimal("0.00")),
    ).order_by("name")


def list_expenses(filters=None):
    return build_expense_queryset(filters)


def get_expenses_dashboard(filters=None):
    queryset = build_expense_queryset(filters)

    summary = queryset.aggregate(
        total_expenses=Coalesce(Sum("amount"), Decimal("0.00")),
        expense_count=Count("id"),
        cash_expenses=Coalesce(
            Sum("amount", filter=Q(payment_mode="cash")),
            Decimal("0.00"),
        ),
        non_cash_expenses=Coalesce(
            Sum("amount", filter=~Q(payment_mode="cash")),
            Decimal("0.00"),
        ),
    )

    summary["categories_used"] = queryset.values("category").distinct().count()

    expenses = [
        {
            "id": expense.id,
            "category": expense.category_id,
            "category_name": expense.category.name,
            "amount": expense.amount,
            "payment_mode": expense.payment_mode,
            "payment_mode_display": expense.get_payment_mode_display(),
            "expense_date": expense.expense_date,
            "description": expense.description,
            "reference_id": expense.reference_id,
            "created_at": expense.created_at,
        }
        for expense in queryset
    ]

    return {
        "summary": summary,
        "category_breakdown": _category_breakdown(queryset),
        "payment_mode_breakdown": _payment_mode_breakdown(queryset),
        "daily_totals": _daily_totals(queryset),
        "expenses": expenses,
    }
