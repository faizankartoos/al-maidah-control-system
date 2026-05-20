from datetime import datetime, time, timedelta
from decimal import Decimal

from django.db.models import Q, Sum
from django.db.models.functions import Coalesce
from django.utils import timezone

from expenses.models import Expense
from inventory.models import Inventory, PurchaseItem, StockAdjustmentLog, StockOutLog


ZERO = Decimal("0.00")

LABOUR_CATEGORY_ALIASES = (
    "Labour",
    "Labor",
    "Salary",
    "Salaries",
    "Wage",
    "Wages",
    "Payroll",
)

MARKETING_CATEGORY_ALIASES = (
    "Marketing",
    "Advertisement",
    "Advertisements",
    "Advertising",
    "Ad Spend",
    "Ads",
    "Promotion",
    "Promotions",
)

LABOUR_TEXT_KEYWORDS = (
    "salary",
    "salaries",
    "wage",
    "wages",
    "payroll",
    "staff",
    "employee",
    "employees",
    "worker",
    "workers",
    "helper",
    "helpers",
)

MARKETING_TEXT_KEYWORDS = (
    "marketing",
    "advertisement",
    "advertisements",
    "advertising",
    "ad spend",
    "ads",
    "promotion",
    "promotions",
    "promo",
    "banner",
    "banners",
    "flyer",
    "flyers",
    "instagram",
    "facebook",
    "boost",
)


def _decimal(value):
    return Decimal(str(value or 0))


def _safe_percentage(numerator, denominator):
    denominator_decimal = _decimal(denominator)
    if denominator_decimal <= 0:
        return Decimal("0.00")

    return round((_decimal(numerator) / denominator_decimal) * Decimal("100.00"), 2)


def _purchase_occurred_at(item):
    if item.bill.confirmed_at:
        return item.bill.confirmed_at

    naive = datetime.combine(item.bill.bill_date, time(hour=9, minute=0))
    return timezone.make_aware(naive, timezone.get_current_timezone())


def _resolve_stock_out_value(log):
    if log.value_reduced is not None:
        return _decimal(log.value_reduced)

    if log.unit_cost is not None:
        return _decimal(log.unit_cost) * _decimal(log.quantity)

    inventory = getattr(log.product, "inventory", None)
    if not inventory or _decimal(inventory.quantity) <= 0:
        return ZERO

    return (_decimal(inventory.total_value) / _decimal(inventory.quantity)) * _decimal(log.quantity)


def _build_category_alias_filter(aliases):
    category_filter = Q()
    for alias in aliases:
        category_filter |= Q(category__name__iexact=alias)
    return category_filter


def _build_inventory_boundaries(from_date, to_date):
    report_tz = timezone.get_current_timezone()
    range_start = timezone.make_aware(datetime.combine(from_date, time.min), report_tz)
    range_end = timezone.make_aware(datetime.combine(to_date + timedelta(days=1), time.min), report_tz)
    return range_start, range_end


def _normalize_text(value):
    return " ".join((value or "").strip().lower().split())


def _expense_matches_keywords(expense, keywords):
    searchable_text = " ".join(
        part
        for part in (
            _normalize_text(getattr(expense.category, "name", "")),
            _normalize_text(expense.description),
            _normalize_text(expense.reference_id),
        )
        if part
    )

    if not searchable_text:
        return False, []

    matched = [keyword for keyword in keywords if keyword in searchable_text]
    return bool(matched), matched


def get_food_cost_metrics(from_date, to_date, revenue):
    range_start, range_end = _build_inventory_boundaries(from_date, to_date)

    current_inventory_value = (
        Inventory.objects.aggregate(total=Coalesce(Sum("total_value"), ZERO))["total"] or ZERO
    )

    opening_reverse_delta = ZERO
    closing_reverse_delta = ZERO
    purchases_value = ZERO
    purchase_event_count = 0
    stock_out_event_count = 0
    adjustment_event_count = 0

    purchase_items = (
        PurchaseItem.objects.filter(
            bill__status="CONFIRMED",
        )
        .filter(
            Q(bill__confirmed_at__gte=range_start)
            | Q(bill__confirmed_at__isnull=True, bill__bill_date__gte=from_date)
        )
        .select_related("bill")
        .order_by("bill__confirmed_at", "bill__bill_date", "id")
    )

    for item in purchase_items:
        occurred_at = _purchase_occurred_at(item)
        value_delta = _decimal(item.line_total)

        opening_reverse_delta += value_delta
        if occurred_at >= range_end:
            closing_reverse_delta += value_delta
        else:
            purchases_value += value_delta
            purchase_event_count += 1

    stock_out_logs = (
        StockOutLog.objects.filter(used_at__gte=range_start)
        .select_related("product", "product__inventory")
        .order_by("used_at", "id")
    )

    for log in stock_out_logs:
        value_delta = -_resolve_stock_out_value(log)
        opening_reverse_delta += value_delta

        if log.used_at >= range_end:
            closing_reverse_delta += value_delta
        else:
            stock_out_event_count += 1

    adjustment_logs = (
        StockAdjustmentLog.objects.filter(adjusted_at__gte=range_start)
        .order_by("adjusted_at", "id")
    )

    for log in adjustment_logs:
        value_delta = _decimal(log.value_change)
        opening_reverse_delta += value_delta

        if log.adjusted_at >= range_end:
            closing_reverse_delta += value_delta
        else:
            adjustment_event_count += 1

    opening_stock_value = current_inventory_value - opening_reverse_delta
    closing_stock_value = current_inventory_value - closing_reverse_delta
    food_cost_value = opening_stock_value + purchases_value - closing_stock_value

    return {
        "opening_stock_value": opening_stock_value,
        "purchases_value": purchases_value,
        "closing_stock_value": closing_stock_value,
        "food_cost_value": food_cost_value,
        "food_cost_ratio": _safe_percentage(food_cost_value, revenue),
        "purchase_event_count": purchase_event_count,
        "stock_out_event_count": stock_out_event_count,
        "adjustment_event_count": adjustment_event_count,
        "calculation_note": (
            "Opening and closing stock are reconstructed from current inventory, confirmed purchases, "
            "manual stock-out logs, and manual stock adjustments."
        ),
    }


def _get_expense_bucket_metrics(from_date, to_date, revenue, aliases, fallback_keywords):
    queryset = Expense.objects.filter(
        expense_date__range=(from_date, to_date),
    ).select_related("category")

    explicit_queryset = queryset.filter(_build_category_alias_filter(aliases))
    explicit_total = explicit_queryset.aggregate(total=Coalesce(Sum("amount"), ZERO))["total"] or ZERO

    if explicit_total > 0:
        matched_categories = sorted(
            {name for name in explicit_queryset.values_list("category__name", flat=True) if name}
        )
        return {
            "total_amount": explicit_total,
            "ratio": _safe_percentage(explicit_total, revenue),
            "expense_count": explicit_queryset.count(),
            "matched_categories": matched_categories,
            "matching_mode": "category",
            "matched_keywords": [],
        }

    fallback_total = ZERO
    fallback_count = 0
    matched_categories = set()
    matched_keywords = set()

    for expense in queryset:
        is_match, keyword_hits = _expense_matches_keywords(expense, fallback_keywords)
        if not is_match:
            continue

        fallback_total += _decimal(expense.amount)
        fallback_count += 1
        if getattr(expense.category, "name", None):
            matched_categories.add(expense.category.name)
        matched_keywords.update(keyword_hits)

    return {
        "total_amount": fallback_total,
        "ratio": _safe_percentage(fallback_total, revenue),
        "expense_count": fallback_count,
        "matched_categories": sorted(matched_categories),
        "matching_mode": "keyword_fallback",
        "matched_keywords": sorted(matched_keywords),
    }


def get_operational_ratio_metrics(from_date, to_date, revenue):
    return {
        "food_cost": get_food_cost_metrics(from_date, to_date, revenue),
        "labour_cost": _get_expense_bucket_metrics(
            from_date,
            to_date,
            revenue,
            LABOUR_CATEGORY_ALIASES,
            LABOUR_TEXT_KEYWORDS,
        ),
        "marketing_expense": _get_expense_bucket_metrics(
            from_date,
            to_date,
            revenue,
            MARKETING_CATEGORY_ALIASES,
            MARKETING_TEXT_KEYWORDS,
        ),
    }
