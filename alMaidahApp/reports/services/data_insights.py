from collections import Counter, defaultdict
from datetime import datetime, time, timedelta, timezone as dt_timezone
from decimal import Decimal
from functools import lru_cache
import json
import re
import ssl
import urllib.parse
import urllib.request
from zoneinfo import ZoneInfo

from django.utils import timezone
try:
    import certifi
except Exception:  # pragma: no cover - optional runtime dependency
    certifi = None

from orders.models import Order
from reports.models import LocationInsightCache


WEEKDAY_LABELS = [
    ("Monday", "Mon"),
    ("Tuesday", "Tue"),
    ("Wednesday", "Wed"),
    ("Thursday", "Thu"),
    ("Friday", "Fri"),
    ("Saturday", "Sat"),
    ("Sunday", "Sun"),
]
NOMINATIM_SEARCH_URL = "https://nominatim.openstreetmap.org/search"
NOMINATIM_USER_AGENT = "al-maidah-control-system/1.0"
AREA_PRIORITY_KEYS = (
    "suburb",
    "quarter",
    "neighbourhood",
    "residential",
    "village",
    "town",
    "hamlet",
    "municipality",
    "city_district",
    "city",
    "county",
)
AREA_STOPWORDS = {
    "road",
    "lane",
    "bridge",
    "masjid",
    "shop",
    "market",
    "near",
    "opp",
    "opposite",
    "chicken",
    "hotel",
    "restaurant",
    "main",
    "street",
}
AREA_ADMIN_SUFFIXES = {
    "tehsil",
    "district",
    "block",
    "town",
    "village",
    "city",
    "area",
}
DEFAULT_JK_COORDINATES = {
    "Chadoora": (33.906200, 74.774700),
    "Buchroo": (33.866900, 74.733000),
    "Budgam": (34.015000, 74.723900),
    "Srinagar": (34.083700, 74.797300),
}


def _decimal(value):
    if value is None:
        return Decimal("0.00")
    return Decimal(str(value))


def _safe_percentage(numerator, denominator):
    denominator_decimal = _decimal(denominator)
    if denominator_decimal <= 0:
        return Decimal("0.00")
    return (_decimal(numerator) / denominator_decimal) * Decimal("100")


def _safe_average(total, count):
    if not count:
        return Decimal("0.00")
    return _decimal(total) / Decimal(str(count))


def _format_hour_label(hour):
    suffix = "AM" if hour < 12 else "PM"
    hour12 = hour % 12 or 12
    return f"{hour12}{suffix}"


def _normalize_phone(phone):
    digits = re.sub(r"\D", "", phone or "")
    if not digits:
        return None
    return digits[-10:] if len(digits) >= 10 else digits


def _normalize_location(address):
    cleaned = re.sub(r"\s+", " ", (address or "")).strip(" ,;-")
    if not cleaned:
        return None

    parts = [
        re.sub(r"\s+", " ", part).strip(" ,;-")
        for part in re.split(r"[\n,]+", cleaned)
        if part.strip(" ,;-")
    ]

    if not parts:
        return None

    candidate = parts[0]
    if re.search(r"\d", candidate) and len(parts) > 1:
        candidate = parts[1]

    shortened = " ".join(candidate.split()[:4]).strip()
    return shortened.title() if shortened else None


def _normalize_cache_key(value):
    tokens = _normalize_text_tokens(value)
    return " ".join(tokens)


def _normalize_text_tokens(value):
    return [
        token
        for token in re.findall(r"[a-z0-9]+", (value or "").lower())
        if token
    ]


def _clean_area_tokens(tokens):
    cleaned = [token for token in tokens if token not in AREA_ADMIN_SUFFIXES]
    return cleaned or tokens


def _extract_overlap_suffix(field_value, original_text):
    field_tokens = _clean_area_tokens(_normalize_text_tokens(field_value))
    original_tokens = _normalize_text_tokens(original_text)

    if not field_tokens:
        return None

    max_len = min(len(field_tokens), len(original_tokens))
    for size in range(max_len, 0, -1):
        candidate = field_tokens[-size:]
        for start in range(0, len(original_tokens) - size + 1):
            if original_tokens[start:start + size] == candidate:
                return " ".join(candidate).title()

    return None


def _pick_main_area_value(field_value, original_text):
    overlap = _extract_overlap_suffix(field_value, original_text)
    if overlap:
        return overlap

    field_tokens = _clean_area_tokens(_normalize_text_tokens(field_value))
    if not field_tokens:
        return None

    if len(field_tokens) > 1:
        return " ".join(field_tokens[-2:]).title()

    return field_tokens[0].title()


def _location_query_candidates(address):
    seen = set()
    candidates = []

    parts = [
        re.sub(r"\s+", " ", part).strip(" ,;-")
        for part in re.split(r"[\n,]+", address or "")
        if part.strip(" ,;-")
    ]

    def add_candidate(value):
        cleaned = re.sub(r"\s+", " ", (value or "")).strip(" ,;-")
        lowered = cleaned.lower()
        if not cleaned or lowered in seen:
            return
        seen.add(lowered)
        candidates.append(cleaned)

    for part in parts or [address]:
        cleaned_tokens = [
            token
            for token in _normalize_text_tokens(part)
            if token not in AREA_STOPWORDS
        ]
        if cleaned_tokens:
            add_candidate(cleaned_tokens[-1])
            if len(cleaned_tokens) >= 2:
                add_candidate(" ".join(cleaned_tokens[-2:]))

        words = [word for word in part.split() if word]
        if len(words) >= 1:
            add_candidate(words[-1])
        if len(words) >= 2:
            add_candidate(" ".join(words[-2:]))
        add_candidate(part)

    add_candidate(address)
    return candidates[:5]


def _get_cached_location_metadata(label):
    normalized_key = _normalize_cache_key(label)
    if not normalized_key:
        return None

    cached = (
        LocationInsightCache.objects.filter(normalized_label=normalized_key)
        .values("display_label", "latitude", "longitude")
        .first()
    )
    if not cached:
        return None

    latitude = float(cached["latitude"]) if cached["latitude"] is not None else None
    longitude = float(cached["longitude"]) if cached["longitude"] is not None else None
    return {
        "label": cached["display_label"],
        "latitude": latitude,
        "longitude": longitude,
    }


def _store_location_metadata(label, latitude, longitude, resolved_query="", source="nominatim"):
    normalized_key = _normalize_cache_key(label)
    if not normalized_key or latitude is None or longitude is None:
        return

    LocationInsightCache.objects.update_or_create(
        normalized_label=normalized_key,
        defaults={
            "display_label": label,
            "latitude": Decimal(str(latitude)),
            "longitude": Decimal(str(longitude)),
            "resolved_query": resolved_query,
            "source": source,
        },
    )


def _default_location_metadata(label):
    coordinates = DEFAULT_JK_COORDINATES.get(label)
    if not coordinates:
        return None

    return {
        "label": label,
        "latitude": coordinates[0],
        "longitude": coordinates[1],
    }


@lru_cache(maxsize=512)
def _nominatim_search(query):
    url = NOMINATIM_SEARCH_URL + "?" + urllib.parse.urlencode(
        {
            "q": f"{query}, Budgam, Jammu and Kashmir, India",
            "format": "jsonv2",
            "addressdetails": 1,
            "limit": 1,
            "countrycodes": "in",
            "accept-language": "en",
        }
    )
    request = urllib.request.Request(url, headers={"User-Agent": NOMINATIM_USER_AGENT})
    context = (
        ssl.create_default_context(cafile=certifi.where())
        if certifi is not None
        else ssl.create_default_context()
    )

    try:
        with urllib.request.urlopen(request, timeout=2, context=context) as response:
            payload = json.load(response)
    except Exception:
        return None

    if not payload:
        return None

    return payload[0]


def _fallback_location_label(address):
    tokens = [
        token
        for token in _normalize_text_tokens(address)
        if token not in AREA_STOPWORDS
    ]

    if not tokens:
        fallback = _normalize_location(address)
        return fallback.title() if fallback else None

    return tokens[-1].title()


def _extract_result_coordinates(result):
    try:
        latitude = float(result.get("lat"))
        longitude = float(result.get("lon"))
    except (TypeError, ValueError):
        return None, None

    return latitude, longitude


@lru_cache(maxsize=512)
def _resolve_location_metadata(address):
    if not address:
        return None

    fallback_label = _fallback_location_label(address)
    if fallback_label:
        cached = _get_cached_location_metadata(fallback_label)
        if cached:
            return cached

        default_location = _default_location_metadata(fallback_label)
        if default_location:
            return default_location

    for query in _location_query_candidates(address):
        result = _nominatim_search(query)
        if not result:
            continue

        address_parts = result.get("address", {})
        for key in AREA_PRIORITY_KEYS:
            field_value = address_parts.get(key)
            if not field_value:
                continue

            picked = _pick_main_area_value(field_value, address)
            if picked:
                latitude, longitude = _extract_result_coordinates(result)
                _store_location_metadata(
                    picked,
                    latitude,
                    longitude,
                    resolved_query=query,
                )
                return {
                    "label": picked,
                    "latitude": latitude,
                    "longitude": longitude,
                }

        display_name = result.get("display_name")
        picked = _pick_main_area_value(display_name, address) if display_name else None
        if picked:
            latitude, longitude = _extract_result_coordinates(result)
            _store_location_metadata(
                picked,
                latitude,
                longitude,
                resolved_query=query,
            )
            return {
                "label": picked,
                "latitude": latitude,
                "longitude": longitude,
            }

    if fallback_label:
        label_result = _nominatim_search(fallback_label)
        if label_result:
            latitude, longitude = _extract_result_coordinates(label_result)
            if latitude is not None and longitude is not None:
                _store_location_metadata(
                    fallback_label,
                    latitude,
                    longitude,
                    resolved_query=fallback_label,
                )
                return {
                    "label": fallback_label,
                    "latitude": latitude,
                    "longitude": longitude,
                }

        return {
            "label": fallback_label,
            "latitude": None,
            "longitude": None,
        }

    return None


def _top_counter_summary(counter, max_items=3):
    if not counter:
        return "No item pattern yet"

    top_items = counter.most_common(max_items)
    return ", ".join(f"{item} x{count}" for item, count in top_items)


def _build_daily_rows(from_date, to_date):
    current = from_date
    rows = {}

    while current <= to_date:
        rows[current.isoformat()] = {
            "date": current.isoformat(),
            "order_count": 0,
            "revenue": Decimal("0.00"),
            "delivery_orders": 0,
            "takeaway_orders": 0,
            "dine_in_orders": 0,
            "cancelled_orders": 0,
        }
        current += timedelta(days=1)

    return rows


def _build_weekday_heatmap():
    rows = []

    for weekday_index, (label, short_label) in enumerate(WEEKDAY_LABELS):
        hours = []
        for hour in range(24):
            hours.append(
                {
                    "hour": hour,
                    "hour_label": _format_hour_label(hour),
                    "order_count": 0,
                    "revenue": Decimal("0.00"),
                }
            )

        rows.append(
            {
                "weekday": label,
                "weekday_label": short_label,
                "weekday_index": weekday_index,
                "total_orders": 0,
                "total_revenue": Decimal("0.00"),
                "hours": hours,
            }
        )

    return rows


def _build_order_highlight(order):
    if order.order_type == "DELIVERY":
        return (
            (order.area.name if getattr(order, "area", None) else "")
            or order.delivery_address
            or order.customer_phone
            or order.customer_name
            or "-"
        ).strip()
    if order.order_type == "DINE_IN":
        return f"Table {order.table_number}" if order.table_number else (order.customer_name or "Walk-in")
    return (order.customer_phone or order.customer_name or "Takeaway").strip()


def _build_order_items_preview(order):
    items = list(order.items.all())
    item_names = [item.item_name.strip() for item in items[:3] if item.item_name.strip()]
    if not item_names:
        return "No items"

    preview = ", ".join(item_names)
    remaining = max(len(items) - len(item_names), 0)
    if remaining:
        preview = f"{preview} +{remaining} more"

    return preview


def _serialize_location_order(order, report_tz):
    local_dt = timezone.localtime(order.created_at, report_tz)
    items = list(order.items.all())
    return {
        "id": order.id,
        "created_at": order.created_at.isoformat(),
        "created_at_local": local_dt.isoformat(),
        "created_date": local_dt.date().isoformat(),
        "created_time_label": local_dt.strftime("%I:%M %p").lstrip("0"),
        "order_type": order.order_type,
        "order_status": order.order_status,
        "payment_status": order.payment_status,
        "customer_name": (order.customer_name or "").strip(),
        "customer_phone": (order.customer_phone or "").strip(),
        "delivery_address": (order.delivery_address or "").strip(),
        "area_name": (order.area.name if getattr(order, "area", None) else "").strip(),
        "order_note": (order.order_note or "").strip(),
        "table_number": (order.table_number or "").strip() if order.table_number else "",
        "total_amount": order.total_amount,
        "highlight": _build_order_highlight(order),
        "items_preview": _build_order_items_preview(order),
        "items": [
            {
                "item_name": item.item_name,
                "quantity": item.quantity,
                "price": item.price,
                "total_price": item.total_price,
            }
            for item in items
        ],
    }


def _build_strengths(summary, charts, rankings):
    strengths = []

    if summary["peak_hour_label"]:
        strengths.append(
            {
                "title": "Peak Ordering Window",
                "body": f"Most orders arrive around {summary['peak_hour_label']}. Keep your kitchen and counter strongest around that window.",
            }
        )

    top_location = charts["location_hotspots"][0] if charts["location_hotspots"] else None
    if top_location:
        strengths.append(
            {
                "title": "Strongest Delivery Zone",
                "body": (
                    f"{top_location['location_label']} generated {top_location['order_count']} delivery orders "
                    f"worth Rs {top_location['total_amount']} in this range."
                ),
            }
        )

    top_item = charts["customer_favorite_items"][0] if charts["customer_favorite_items"] else None
    if top_item:
        strengths.append(
            {
                "title": "Most Loved Item",
                "body": (
                    f"{top_item['item_name']} was ordered by {top_item['customer_count']} different customers "
                    f"for a total of {top_item['total_quantity']} portions."
                ),
            }
        )

    top_customer = rankings["top_customers"][0] if rankings["top_customers"] else None
    if top_customer:
        strengths.append(
            {
                "title": "Top Customer",
                "body": (
                    f"{top_customer['customer_name']} placed {top_customer['order_count']} orders and spent "
                    f"Rs {top_customer['total_spent']}."
                ),
            }
        )

    return strengths[:4]


def _build_improvements(summary, charts):
    improvements = []

    cancellation_rate = _decimal(summary["cancellation_rate"])
    repeat_share = _decimal(summary["repeat_customer_share"])
    phone_capture_rate = _decimal(summary["phone_capture_rate"])
    address_capture_rate = _decimal(summary["delivery_address_capture_rate"])

    if cancellation_rate >= Decimal("8.00"):
        improvements.append(
            {
                "title": "Reduce Cancellations",
                "body": (
                    f"{summary['cancelled_orders']} orders were cancelled in this range. "
                    "Review confirmation flow, kitchen timing, and stock availability before rush windows."
                ),
            }
        )

    if repeat_share < Decimal("30.00"):
        improvements.append(
            {
                "title": "Build Repeat Business",
                "body": (
                    f"Repeat customers contributed only {summary['repeat_customer_share']}% of tracked customer revenue. "
                    "Follow up with regulars, build combo offers, and keep a simple loyalty habit."
                ),
            }
        )

    if phone_capture_rate < Decimal("85.00"):
        improvements.append(
            {
                "title": "Capture More Customer Phones",
                "body": (
                    f"Only {summary['phone_capture_rate']}% of orders have a usable phone number. "
                    "That weakens ranking, remarketing, and repeat-customer tracking."
                ),
            }
        )

    if summary["delivery_orders"] and address_capture_rate < Decimal("90.00"):
        improvements.append(
            {
                "title": "Tighten Delivery Address Capture",
                "body": (
                    f"Only {summary['delivery_address_capture_rate']}% of delivery orders have a structured address. "
                    "Without stronger address capture, your location analytics stay approximate."
                ),
            }
        )

    if charts["location_hotspots"]:
        top_location = charts["location_hotspots"][0]
        location_share = _safe_percentage(
            top_location["order_count"],
            summary["delivery_orders"],
        )
        if location_share >= Decimal("35.00"):
            improvements.append(
                {
                    "title": "Own Your Best Zone",
                    "body": (
                        f"{top_location['location_label']} alone contributes {location_share.quantize(Decimal('0.01'))}% "
                        "of your delivery orders. Push local flyers, repeat offers, and faster rider coverage there."
                    ),
                }
            )

    return improvements[:4]


def _build_missing_signals(summary):
    missing = [
        {
            "title": "No Standard Delivery Area Field",
            "body": "Locations are being read from free-text addresses, so the zone map is useful but still approximate. A fixed area or locality field would sharpen this.",
        },
        {
            "title": "No Order Source Tracking",
            "body": "The system still does not tell you whether the customer came from walk-in, WhatsApp, Instagram, call, or referral. That blocks channel-level business decisions.",
        },
        {
            "title": "No Service Time Tracking",
            "body": "You cannot yet see order-to-ready time, rider dispatch time, or average delay by shift. That makes speed improvement harder than it should be.",
        },
        {
            "title": "No Customer Feedback Signal",
            "body": "You know what people ordered and spent, but not whether they liked the food or delivery experience. Ratings or complaint tags would complete the picture.",
        },
    ]

    if summary["orders_without_phone"] == 0:
        missing = [item for item in missing if item["title"] != "No Customer Feedback Signal"] + [
            {
                "title": "No Customer Feedback Signal",
                "body": "Your customer phone capture is already strong, so the next missing signal is post-order feedback. Even a simple satisfied / not satisfied flag would help.",
            }
        ]

    return missing[:4]


def _resolve_report_timezone(report_timezone):
    if report_timezone:
        return ZoneInfo(report_timezone)
    return timezone.get_current_timezone()


def _build_local_datetime_range(from_date, to_date, report_tz):
    local_start = datetime.combine(from_date, time.min, tzinfo=report_tz)
    local_end = datetime.combine(to_date + timedelta(days=1), time.min, tzinfo=report_tz)

    return (
        local_start.astimezone(dt_timezone.utc),
        local_end.astimezone(dt_timezone.utc),
    )


def get_data_insights_report(from_date, to_date, report_timezone=None):
    report_tz = _resolve_report_timezone(report_timezone)
    utc_start, utc_end = _build_local_datetime_range(from_date, to_date, report_tz)

    orders = list(
        Order.objects.filter(created_at__gte=utc_start, created_at__lt=utc_end)
        .exclude(acceptance_status="DECLINED")
        .select_related("area")
        .prefetch_related("items")
        .order_by("created_at")
    )

    daily_rows = _build_daily_rows(from_date, to_date)
    hourly_rows = [
        {
            "hour": hour,
            "hour_label": _format_hour_label(hour),
            "order_count": 0,
            "revenue": Decimal("0.00"),
        }
        for hour in range(24)
    ]
    weekday_heatmap = _build_weekday_heatmap()
    type_mix = {
        "DINE_IN": {
            "order_type": "DINE_IN",
            "label": "Dine In",
            "order_count": 0,
            "total_amount": Decimal("0.00"),
        },
        "TAKEAWAY": {
            "order_type": "TAKEAWAY",
            "label": "Takeaway",
            "order_count": 0,
            "total_amount": Decimal("0.00"),
        },
        "DELIVERY": {
            "order_type": "DELIVERY",
            "label": "Delivery",
            "order_count": 0,
            "total_amount": Decimal("0.00"),
        },
    }
    location_stats = defaultdict(
        lambda: {
            "location_label": "",
            "order_count": 0,
            "total_amount": Decimal("0.00"),
            "customers": set(),
            "latitude": None,
            "longitude": None,
            "orders": [],
        }
    )
    customer_stats = {}
    item_stats = defaultdict(
        lambda: {
            "item_name": "",
            "customers": set(),
            "total_quantity": 0,
            "total_revenue": Decimal("0.00"),
            "order_count": 0,
        }
    )

    total_orders = len(orders)
    fulfilled_orders = 0
    cancelled_orders = 0
    delivery_orders = 0
    takeaway_orders = 0
    dine_in_orders = 0
    total_revenue = Decimal("0.00")
    orders_with_phone = 0
    delivery_orders_with_address = 0
    unknown_location_orders = 0

    for order in orders:
        local_dt = timezone.localtime(order.created_at, report_tz)
        day_key = local_dt.date().isoformat()
        hour = local_dt.hour
        weekday_index = local_dt.weekday()
        amount = _decimal(order.total_amount)
        is_cancelled = order.order_status == "CANCELLED"
        normalized_phone = _normalize_phone(order.customer_phone)

        daily_rows[day_key]["order_count"] += 1
        daily_rows[day_key][f"{order.order_type.lower()}_orders"] += 1
        hourly_rows[hour]["order_count"] += 1
        weekday_heatmap[weekday_index]["total_orders"] += 1
        weekday_heatmap[weekday_index]["hours"][hour]["order_count"] += 1
        type_mix[order.order_type]["order_count"] += 1

        if normalized_phone:
            orders_with_phone += 1

        if order.order_type == "DELIVERY":
            delivery_orders += 1
        elif order.order_type == "TAKEAWAY":
            takeaway_orders += 1
        else:
            dine_in_orders += 1

        if is_cancelled:
            cancelled_orders += 1
            daily_rows[day_key]["cancelled_orders"] += 1
            continue

        fulfilled_orders += 1
        total_revenue += amount
        daily_rows[day_key]["revenue"] += amount
        hourly_rows[hour]["revenue"] += amount
        weekday_heatmap[weekday_index]["total_revenue"] += amount
        weekday_heatmap[weekday_index]["hours"][hour]["revenue"] += amount
        type_mix[order.order_type]["total_amount"] += amount

        if normalized_phone:
            customer_entry = customer_stats.setdefault(
                normalized_phone,
                {
                    "phone": normalized_phone,
                    "customer_name": (order.customer_name or "Unknown customer").strip() or "Unknown customer",
                    "order_count": 0,
                    "total_spent": Decimal("0.00"),
                    "favorite_counter": Counter(),
                    "latest_order_at": order.created_at,
                },
            )
            customer_entry["order_count"] += 1
            customer_entry["total_spent"] += amount
            if order.customer_name:
                customer_entry["customer_name"] = order.customer_name.strip()
            if order.created_at > customer_entry["latest_order_at"]:
                customer_entry["latest_order_at"] = order.created_at
        else:
            customer_entry = None

        for item in order.items.all():
            item_name = item.item_name.strip()
            quantity = int(item.quantity or 0)
            total_price = _decimal(item.total_price)
            item_entry = item_stats[item_name]
            item_entry["item_name"] = item_name
            item_entry["total_quantity"] += quantity
            item_entry["total_revenue"] += total_price
            item_entry["order_count"] += 1

            if customer_entry:
                customer_entry["favorite_counter"][item_name] += quantity
                item_entry["customers"].add(normalized_phone)

        if order.order_type == "DELIVERY":
            location_lookup_value = (
                order.area.name.strip()
                if getattr(order, "area", None) and order.area.name
                else (order.delivery_address or "").strip()
            )
            location_meta = _resolve_location_metadata(location_lookup_value)
            normalized_location = location_meta["label"] if location_meta else None

            if order.delivery_address:
                delivery_orders_with_address += 1

            if normalized_location:
                location_entry = location_stats[normalized_location]
                location_entry["location_label"] = normalized_location
                location_entry["order_count"] += 1
                location_entry["total_amount"] += amount
                if location_meta:
                    if location_entry["latitude"] is None:
                        location_entry["latitude"] = location_meta.get("latitude")
                    if location_entry["longitude"] is None:
                        location_entry["longitude"] = location_meta.get("longitude")
                if normalized_phone:
                    location_entry["customers"].add(normalized_phone)
                location_entry["orders"].append(_serialize_location_order(order, report_tz))
            else:
                unknown_location_orders += 1

    top_customers = sorted(
        [
            {
                "phone": row["phone"],
                "customer_name": row["customer_name"],
                "order_count": row["order_count"],
                "total_spent": row["total_spent"],
                "average_order_value": _safe_average(row["total_spent"], row["order_count"]),
                "favorite_items": _top_counter_summary(row["favorite_counter"]),
            }
            for row in customer_stats.values()
        ],
        key=lambda row: (
            -row["order_count"],
            -row["total_spent"],
            row["customer_name"].lower(),
        ),
    )[:10]

    favorite_items = sorted(
        [
            {
                "item_name": row["item_name"],
                "customer_count": len(row["customers"]),
                "total_quantity": row["total_quantity"],
                "total_revenue": row["total_revenue"],
                "order_count": row["order_count"],
            }
            for row in item_stats.values()
        ],
        key=lambda row: (
            -row["customer_count"],
            -row["total_quantity"],
            -row["total_revenue"],
            row["item_name"].lower(),
        ),
    )[:10]

    location_hotspots = sorted(
        [
            {
                "location_label": row["location_label"],
                "order_count": row["order_count"],
                "total_amount": row["total_amount"],
                "average_order_value": _safe_average(row["total_amount"], row["order_count"]),
                "customer_count": len(row["customers"]),
                "latitude": row["latitude"],
                "longitude": row["longitude"],
                "orders": sorted(
                    row["orders"],
                    key=lambda order_row: order_row["created_at"],
                    reverse=True,
                ),
            }
            for row in location_stats.values()
        ],
        key=lambda row: (
            -row["order_count"],
            -row["total_amount"],
            row["location_label"].lower(),
        ),
    )[:10]

    repeat_customer_count = sum(
        1 for customer in customer_stats.values() if customer["order_count"] > 1
    )
    repeat_customer_revenue = sum(
        customer["total_spent"]
        for customer in customer_stats.values()
        if customer["order_count"] > 1
    ) if customer_stats else Decimal("0.00")

    peak_hour = max(hourly_rows, key=lambda row: (row["order_count"], row["revenue"]), default=None)
    peak_weekday = max(
        weekday_heatmap,
        key=lambda row: (row["total_orders"], row["total_revenue"]),
        default=None,
    )

    summary = {
        "total_orders": total_orders,
        "fulfilled_orders": fulfilled_orders,
        "cancelled_orders": cancelled_orders,
        "delivery_orders": delivery_orders,
        "takeaway_orders": takeaway_orders,
        "dine_in_orders": dine_in_orders,
        "gross_revenue": total_revenue,
        "average_order_value": _safe_average(total_revenue, fulfilled_orders),
        "tracked_customers": len(customer_stats),
        "repeat_customer_count": repeat_customer_count,
        "repeat_customer_share": _safe_percentage(repeat_customer_revenue, total_revenue).quantize(Decimal("0.01")),
        "phone_capture_rate": _safe_percentage(orders_with_phone, total_orders).quantize(Decimal("0.01")),
        "orders_without_phone": max(total_orders - orders_with_phone, 0),
        "delivery_address_capture_rate": _safe_percentage(
            delivery_orders_with_address,
            delivery_orders,
        ).quantize(Decimal("0.01")),
        "unknown_delivery_location_orders": unknown_location_orders,
        "cancellation_rate": _safe_percentage(cancelled_orders, total_orders).quantize(Decimal("0.01")),
        "peak_hour_label": peak_hour["hour_label"] if peak_hour and peak_hour["order_count"] else "",
        "peak_hour_orders": peak_hour["order_count"] if peak_hour else 0,
        "peak_weekday_label": peak_weekday["weekday_label"] if peak_weekday and peak_weekday["total_orders"] else "",
        "peak_weekday_orders": peak_weekday["total_orders"] if peak_weekday else 0,
    }

    charts = {
        "daily_orders": list(daily_rows.values()),
        "hourly_demand": hourly_rows,
        "weekday_heatmap": weekday_heatmap,
        "order_type_mix": list(type_mix.values()),
        "location_hotspots": location_hotspots,
        "customer_favorite_items": favorite_items,
    }
    rankings = {
        "top_customers": top_customers,
    }
    insights = {
        "strengths": _build_strengths(summary, charts, rankings),
        "improvements": _build_improvements(summary, charts),
        "missing_signals": _build_missing_signals(summary),
    }

    return {
        "date_range": {
            "from_date": from_date,
            "to_date": to_date,
            "days": (to_date - from_date).days + 1,
        },
        "summary": summary,
        "charts": charts,
        "rankings": rankings,
        "insights": insights,
    }
