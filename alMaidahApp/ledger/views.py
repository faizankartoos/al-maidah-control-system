from decimal import Decimal, InvalidOperation

from django.db.models import DecimalField, Q, Sum, Value
from django.db.models.deletion import ProtectedError
from django.db.models.functions import Coalesce
from django.shortcuts import get_object_or_404
from django.utils.dateparse import parse_date
from django.db import IntegrityError, transaction
from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import LedgerAccount, LedgerEntry
from .reports import account_ledger_report, daily_sales_report
from .serializers import (
    AccountSerializer,
    AccountWriteSerializer,
    build_contact_conflict_message,
    find_conflicting_contact_account,
    normalize_contact_number,
    serialize_conflicting_account,
)
from .services import record_credit, record_debit
from .utils import get_cash_drawer
from orders.models import Order, OrderPayment
from orders.services import collect_payment

ACCOUNT_MANAGEMENT_PASSWORD = "admin@almaidah"
UNDO_REFERENCE_PREFIX = "UNDO-ENTRY-"
ACTIVE_DELIVERY_ACCEPTANCE_STATUSES = {"NOT_REQUIRED", "ACCEPTED"}
VENDOR_ENTRY_REFERENCES = {
    "VENDOR-DUE",
    "VENDOR-PAY",
    "VENDOR-ADJUST-UP",
    "VENDOR-ADJUST-DOWN",
}


def _extract_error_message(error_payload, fallback="Request failed."):
    if isinstance(error_payload, str):
        return error_payload

    if isinstance(error_payload, list) and error_payload:
        return _extract_error_message(error_payload[0], fallback)

    if isinstance(error_payload, dict):
        for value in error_payload.values():
            message = _extract_error_message(value, fallback)
            if message:
                return message

    return fallback


def _account_integrity_error_message(exc):
    message = str(exc).lower()

    if "contact_number" in message:
        return {
            "error": "This phone number is already linked to another ledger account.",
            "errors": {
                "contact_number": ["This phone number is already linked to another ledger account."],
            },
        }

    return {
        "error": "Ledger account could not be saved because the data conflicts with an existing record.",
        "errors": {
            "non_field_errors": [
                "Ledger account could not be saved because the data conflicts with an existing record.",
            ],
        },
    }


def _build_account_validation_error_response(serializer_errors, request_data, exclude_account_id=None, fallback="Request failed."):
    error_message = _extract_error_message(serializer_errors, fallback)
    normalized_phone = normalize_contact_number(request_data.get("contact_number"))
    conflicting_account = find_conflicting_contact_account(
        normalized_phone,
        exclude_account_id=exclude_account_id,
    )

    if conflicting_account:
        error_message = build_contact_conflict_message(conflicting_account)

        errors = serializer_errors.copy()
        errors["contact_number"] = [error_message]

        return {
            "error": error_message,
            "errors": errors,
            "conflict_account": serialize_conflicting_account(conflicting_account),
        }

    return {
        "error": error_message,
        "errors": serializer_errors,
    }


def _build_contact_integrity_error_response(exc, request_data, exclude_account_id=None):
    normalized_phone = normalize_contact_number(request_data.get("contact_number"))
    conflicting_account = find_conflicting_contact_account(
        normalized_phone,
        exclude_account_id=exclude_account_id,
    )

    if conflicting_account:
        return {
            "error": build_contact_conflict_message(conflicting_account),
            "errors": {
                "contact_number": [build_contact_conflict_message(conflicting_account)],
            },
            "conflict_account": serialize_conflicting_account(conflicting_account),
        }

    return _account_integrity_error_message(exc)


def _detach_account_from_orders(account):
    if account.account_type == "CUSTOMER":
        Order.objects.filter(customer_account=account).update(customer_account=None)
        return

    if account.account_type == "DELIVERY":
        Order.objects.filter(delivery_boy=account).update(delivery_boy=None)


def _archive_account_with_history(account):
    update_fields = ["is_active"]

    if account.contact_number:
        if not account.archived_contact_number:
            account.archived_contact_number = account.contact_number
            update_fields.append("archived_contact_number")
        account.contact_number = None
        update_fields.append("contact_number")

    if account.is_active:
        account.is_active = False

    account.save(update_fields=update_fields)


def _vendor_entry_can_be_undone(entry):
    return (
        entry.ledger_account.account_type == "VENDOR"
        and entry.reference in VENDOR_ENTRY_REFERENCES
        and not LedgerEntry.objects.filter(reference=f"{UNDO_REFERENCE_PREFIX}{entry.id}").exists()
    )


def _delivery_reference_rollups(account, references):
    rollups = {
        reference: {
            "net_balance": Decimal("0.00"),
            "collected_amount": Decimal("0.00"),
            "has_entries": False,
        }
        for reference in references
    }

    if not account or not references:
        return rollups

    entries = LedgerEntry.objects.filter(
        ledger_account=account,
        reference__in=references,
    ).only("reference", "entry_type", "payment_type", "amount")

    for entry in entries:
        reference_data = rollups.setdefault(
            entry.reference,
            {
                "net_balance": Decimal("0.00"),
                "collected_amount": Decimal("0.00"),
                "has_entries": False,
            },
        )
        amount = Decimal(str(entry.amount))
        reference_data["has_entries"] = True

        if entry.entry_type == "CREDIT":
            reference_data["net_balance"] += amount

            if entry.payment_type in {"CASH", "ONLINE"}:
                reference_data["collected_amount"] += amount
        else:
            reference_data["net_balance"] -= amount

    return rollups


def _sync_customer_collection_to_orders(account, amount, payment_type):
    remaining_to_allocate = Decimal(str(amount))
    updated_orders = []

    linked_orders = (
        Order.objects.filter(
            customer_account=account,
            order_status="COMPLETED",
        )
        .exclude(payment_status="PAID")
        .order_by("completed_at", "created_at", "id")
    )

    for order in linked_orders:
        if remaining_to_allocate <= 0:
            break

        total_paid = order.payments.aggregate(total=Sum("amount"))["total"] or Decimal("0.00")
        order_remaining = Decimal(str(order.total_amount)) - Decimal(str(total_paid))

        if order_remaining <= 0:
            if order.payment_status != "PAID":
                order.payment_status = "PAID"
                order.save(update_fields=["payment_status"])
            continue

        applied_amount = min(order_remaining, remaining_to_allocate)

        OrderPayment.objects.create(
            order=order,
            amount=applied_amount,
            payment_type=payment_type,
            cash_amount=applied_amount if payment_type == "CASH" else Decimal("0.00"),
            online_amount=applied_amount if payment_type == "ONLINE" else Decimal("0.00"),
        )

        remaining_after = order_remaining - applied_amount
        order.payment_status = "PAID" if remaining_after <= 0 else "UNPAID"
        order.save(update_fields=["payment_status"])

        updated_orders.append(
            {
                "id": order.id,
                "applied_amount": applied_amount,
                "payment_status": order.payment_status,
            }
        )

        remaining_to_allocate -= applied_amount

    return updated_orders


def _perform_quick_delete(account):
    if account.account_type == "CASH":
        return {
            "ok": False,
            "account_id": account.id,
            "account_name": account.name,
            "error": "Cash drawer is system-managed and cannot be quick deleted.",
            "action": "blocked",
        }

    _detach_account_from_orders(account)

    if account.entries.exists():
        _archive_account_with_history(account)

        return {
            "ok": True,
            "account_id": account.id,
            "account_name": account.name,
            "message": "Ledger account archived safely. Transaction history was kept untouched and the phone number was released for reuse.",
            "action": "archived",
        }

    try:
        account_name = account.name
        account_id = account.id
        account.delete()
    except ProtectedError:
        return {
            "ok": False,
            "account_id": account.id,
            "account_name": account.name,
            "error": "Quick delete could not finish. This account still has protected linked records.",
            "action": "blocked",
        }

    return {
        "ok": True,
        "account_id": account_id,
        "account_name": account_name,
        "message": "Ledger account deleted.",
        "action": "deleted",
    }


class AccountListCreateAPIView(APIView):

    def get(self, request):
        queryset = LedgerAccount.objects.all().order_by("name", "id")

        account_type = request.query_params.get("account_type")
        search = (request.query_params.get("search") or "").strip()
        include_inactive = str(request.query_params.get("include_inactive", "")).lower() in {
            "1",
            "true",
            "yes",
        }

        if account_type:
            queryset = queryset.filter(account_type=account_type)

        if search:
            queryset = queryset.filter(
                Q(name__icontains=search)
                | Q(contact_number__icontains=search)
                | Q(address__icontains=search)
            )

        if not include_inactive:
            queryset = queryset.filter(is_active=True)

        serializer = AccountSerializer(queryset, many=True)
        return Response(serializer.data)

    def post(self, request):
        serializer = AccountWriteSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(
                _build_account_validation_error_response(
                    serializer.errors,
                    request.data,
                    fallback="Failed to create account.",
                ),
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            account = serializer.save()
        except IntegrityError as exc:
            return Response(
                _build_contact_integrity_error_response(exc, request.data),
                status=status.HTTP_400_BAD_REQUEST,
            )

        return Response(AccountSerializer(account).data, status=status.HTTP_201_CREATED)


class AccountDetailAPIView(APIView):

    def get(self, request, account_id):
        account = get_object_or_404(LedgerAccount, id=account_id)
        start_date = request.query_params.get("start_date")
        end_date = request.query_params.get("end_date")

        parsed_start_date = parse_date(start_date) if start_date else None
        parsed_end_date = parse_date(end_date) if end_date else None

        if start_date and not parsed_start_date:
            return Response({"error": "Enter a valid start date."}, status=status.HTTP_400_BAD_REQUEST)

        if end_date and not parsed_end_date:
            return Response({"error": "Enter a valid end date."}, status=status.HTTP_400_BAD_REQUEST)

        if parsed_start_date and parsed_end_date and parsed_start_date > parsed_end_date:
            return Response({"error": "Start date cannot be after end date."}, status=status.HTTP_400_BAD_REQUEST)

        return Response(account_ledger_report(account.id, parsed_start_date, parsed_end_date))

    def patch(self, request, account_id):
        account = get_object_or_404(LedgerAccount, id=account_id)

        if account.account_type == "CASH":
            return Response(
                {"error": "Cash drawer is system-managed and cannot be edited from Ledger."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        serializer = AccountWriteSerializer(account, data=request.data, partial=True)
        if not serializer.is_valid():
            return Response(
                _build_account_validation_error_response(
                    serializer.errors,
                    request.data,
                    exclude_account_id=account.id,
                    fallback="Failed to update account.",
                ),
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            updated_account = serializer.save()
        except IntegrityError as exc:
            return Response(
                _build_contact_integrity_error_response(
                    exc,
                    request.data,
                    exclude_account_id=account.id,
                ),
                status=status.HTTP_400_BAD_REQUEST,
            )

        return Response(AccountSerializer(updated_account).data)

    def delete(self, request, account_id):
        account = get_object_or_404(LedgerAccount, id=account_id)

        if account.account_type == "CASH":
            return Response(
                {"error": "Cash drawer is system-managed and cannot be deleted."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        _detach_account_from_orders(account)

        try:
            account.delete()
        except ProtectedError:
            return Response(
                {
                    "error": "This account cannot be deleted because it still has ledger transaction history."
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        return Response(status=status.HTTP_204_NO_CONTENT)


class AccountQuickDeleteAPIView(APIView):

    @transaction.atomic
    def post(self, request, account_id):
        account = get_object_or_404(LedgerAccount, id=account_id)
        password = str(request.data.get("password") or "")

        if password != ACCOUNT_MANAGEMENT_PASSWORD:
            return Response(
                {"error": "Incorrect password. Quick delete is blocked."},
                status=status.HTTP_403_FORBIDDEN,
            )

        result = _perform_quick_delete(account)

        if not result["ok"]:
            return Response(
                {"error": result["error"]},
                status=status.HTTP_400_BAD_REQUEST,
            )

        return Response(
            {
                "message": result["message"],
                "account_name": result["account_name"],
                "action": result["action"],
            },
            status=status.HTTP_200_OK,
        )


class AccountBulkQuickDeleteAPIView(APIView):

    @transaction.atomic
    def post(self, request):
        password = str(request.data.get("password") or "")
        account_ids = request.data.get("account_ids") or []

        if password != ACCOUNT_MANAGEMENT_PASSWORD:
            return Response(
                {"error": "Incorrect password. Bulk delete is blocked."},
                status=status.HTTP_403_FORBIDDEN,
            )

        if not isinstance(account_ids, list) or not account_ids:
            return Response(
                {"error": "Select at least one ledger account to delete."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        normalized_ids = []
        for value in account_ids:
            try:
                normalized_ids.append(int(value))
            except (TypeError, ValueError):
                continue

        if not normalized_ids:
            return Response(
                {"error": "Select at least one valid ledger account to delete."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        accounts_by_id = {
            account.id: account
            for account in LedgerAccount.objects.filter(id__in=normalized_ids).order_by("name", "id")
        }

        results = []
        deleted_count = 0
        archived_count = 0
        blocked_count = 0

        for account_id in normalized_ids:
            account = accounts_by_id.get(account_id)

            if not account:
                results.append(
                    {
                        "ok": False,
                        "account_id": account_id,
                        "account_name": f"Account #{account_id}",
                        "error": "Ledger account was not found.",
                        "action": "missing",
                    }
                )
                blocked_count += 1
                continue

            result = _perform_quick_delete(account)
            results.append(result)

            if result["ok"] and result["action"] == "deleted":
                deleted_count += 1
            elif result["ok"] and result["action"] == "archived":
                archived_count += 1
            else:
                blocked_count += 1

        processed_count = len(results)

        return Response(
            {
                "message": f"Bulk delete finished. {deleted_count} deleted, {archived_count} archived, {blocked_count} blocked.",
                "summary": {
                    "processed_count": processed_count,
                    "deleted_count": deleted_count,
                    "archived_count": archived_count,
                    "blocked_count": blocked_count,
                },
                "results": results,
            },
            status=status.HTTP_200_OK,
        )


class CustomerLedgerAPIView(APIView):

    def get(self, request, customer_id):
        account = get_object_or_404(LedgerAccount, id=customer_id, account_type="CUSTOMER")
        return Response(account_ledger_report(account.id))


class DailyReportAPIView(APIView):

    def get(self, request):
        date_str = request.query_params.get("date")
        date = None

        if date_str:
            date = parse_date(date_str)
            if not date:
                return Response({"error": "Enter a valid date."}, status=status.HTTP_400_BAD_REQUEST)

        data = daily_sales_report(date=date)
        return Response(data)


class DeliveryBoysAPIView(APIView):

    def get(self, request):
        boys = LedgerAccount.objects.filter(account_type="DELIVERY").order_by("name", "id")

        data = [
            {
                "id": boy.id,
                "name": boy.name,
                "is_active": boy.is_active,
            }
            for boy in boys
        ]

        return Response(data)


class DeliveryBoyLedgerAPIView(APIView):

    def get(self, request, account_id):
        delivery_boy = get_object_or_404(LedgerAccount, id=account_id, account_type="DELIVERY")
        from_date = request.query_params.get("from_date")
        to_date = request.query_params.get("to_date")

        parsed_from_date = parse_date(from_date) if from_date else None
        parsed_to_date = parse_date(to_date) if to_date else None

        if from_date and not parsed_from_date:
            return Response({"error": "Enter a valid from date."}, status=status.HTTP_400_BAD_REQUEST)

        if to_date and not parsed_to_date:
            return Response({"error": "Enter a valid to date."}, status=status.HTTP_400_BAD_REQUEST)

        if parsed_from_date and parsed_to_date and parsed_from_date > parsed_to_date:
            return Response({"error": "From date cannot be after to date."}, status=status.HTTP_400_BAD_REQUEST)

        orders_queryset = (
            Order.objects.filter(
                delivery_boy=delivery_boy,
                acceptance_status__in=ACTIVE_DELIVERY_ACCEPTANCE_STATUSES,
            )
            .exclude(order_status="CANCELLED")
            .annotate(
                amount_paid=Coalesce(
                    Sum("payments__amount"),
                    Value(Decimal("0.00")),
                    output_field=DecimalField(max_digits=12, decimal_places=2),
                )
            )
            .select_related("customer_account")
            .order_by("-created_at", "-id")
        )

        if parsed_from_date:
            orders_queryset = orders_queryset.filter(created_at__date__gte=parsed_from_date)

        if parsed_to_date:
            orders_queryset = orders_queryset.filter(created_at__date__lte=parsed_to_date)

        orders = list(orders_queryset)
        references = [f"ORDER-{order.id}" for order in orders]
        reference_rollups = _delivery_reference_rollups(delivery_boy, references)

        total_order_value = Decimal("0.00")
        total_to_collect = Decimal("0.00")
        collected_so_far = Decimal("0.00")
        pending_balance = Decimal("0.00")
        moved_to_customer_total = Decimal("0.00")
        direct_paid_total = Decimal("0.00")
        collectible_order_count = 0
        rows = []

        for order in orders:
            reference = f"ORDER-{order.id}"
            rollup = reference_rollups.get(reference, {})
            net_balance = Decimal(str(rollup.get("net_balance", "0.00")))
            collected_amount = Decimal(str(rollup.get("collected_amount", "0.00")))
            pending_from_rider = abs(net_balance) if net_balance < 0 else Decimal("0.00")
            amount_paid = Decimal(str(order.amount_paid or "0.00"))
            remaining_amount = Decimal(str(order.total_amount)) - amount_paid

            if remaining_amount < 0:
                remaining_amount = Decimal("0.00")

            if pending_from_rider > 0:
                settlement_status = "PENDING_WITH_RIDER"
            elif order.customer_account_id and order.payment_status != "PAID":
                settlement_status = "MOVED_TO_CUSTOMER_LEDGER"
            elif order.payment_status == "PAID" and rollup.get("has_entries"):
                settlement_status = "COLLECTED_FROM_RIDER"
            elif order.payment_status == "PAID":
                settlement_status = "DIRECT_PAID"
            else:
                settlement_status = "NO_RIDER_BALANCE"

            can_collect_from_rider = (
                pending_from_rider > 0
                and order.payment_status != "PAID"
                and not order.customer_account_id
            )

            total_order_value += Decimal(str(order.total_amount or "0.00"))
            total_to_collect += collected_amount + pending_from_rider
            collected_so_far += collected_amount
            pending_balance += pending_from_rider

            if settlement_status == "MOVED_TO_CUSTOMER_LEDGER":
                moved_to_customer_total += remaining_amount

            if settlement_status == "DIRECT_PAID":
                direct_paid_total += Decimal(str(order.total_amount or "0.00"))

            if can_collect_from_rider:
                collectible_order_count += 1

            rows.append(
                {
                    "id": order.id,
                    "order_type": order.order_type,
                    "order_status": order.order_status,
                    "payment_status": order.payment_status,
                    "created_at": order.created_at,
                    "total_amount": order.total_amount,
                    "amount_paid": amount_paid,
                    "remaining_amount": remaining_amount,
                    "customer_account_id": order.customer_account_id,
                    "customer_account_name": order.customer_account.name if order.customer_account else None,
                    "delivery_reference_balance": net_balance,
                    "collected_from_rider": collected_amount,
                    "pending_from_rider": pending_from_rider,
                    "settlement_status": settlement_status,
                    "can_collect_from_rider": can_collect_from_rider,
                }
            )

        return Response(
            {
                "delivery_boy": {
                    "id": delivery_boy.id,
                    "name": delivery_boy.name,
                    "contact_number": delivery_boy.contact_number,
                    "address": delivery_boy.address,
                    "balance": delivery_boy.balance,
                },
                "filters": {
                    "from_date": parsed_from_date,
                    "to_date": parsed_to_date,
                },
                "summary": {
                    "orders_count": len(rows),
                    "collectible_order_count": collectible_order_count,
                    "total_order_value": total_order_value,
                    "total_to_collect": total_to_collect,
                    "collected_so_far": collected_so_far,
                    "pending_balance": pending_balance,
                    "moved_to_customer_total": moved_to_customer_total,
                    "direct_paid_total": direct_paid_total,
                },
                "orders": rows,
            }
        )


class DeliveryBoyBulkCollectAPIView(APIView):

    @transaction.atomic
    def post(self, request, account_id):
        delivery_boy = get_object_or_404(LedgerAccount, id=account_id, account_type="DELIVERY")
        from_date = request.data.get("from_date")
        to_date = request.data.get("to_date")
        payment_type = str(request.data.get("payment_type") or "").upper()

        parsed_from_date = parse_date(from_date) if from_date else None
        parsed_to_date = parse_date(to_date) if to_date else None

        if not parsed_from_date or not parsed_to_date:
            return Response({"error": "Select a valid from and to date."}, status=status.HTTP_400_BAD_REQUEST)

        if parsed_from_date > parsed_to_date:
            return Response({"error": "From date cannot be after to date."}, status=status.HTTP_400_BAD_REQUEST)

        if payment_type not in {"CASH", "ONLINE"}:
            return Response({"error": "Select a valid payment type."}, status=status.HTTP_400_BAD_REQUEST)

        orders = list(
            Order.objects.filter(
                delivery_boy=delivery_boy,
                acceptance_status__in=ACTIVE_DELIVERY_ACCEPTANCE_STATUSES,
                created_at__date__gte=parsed_from_date,
                created_at__date__lte=parsed_to_date,
            )
            .exclude(order_status="CANCELLED")
            .annotate(
                amount_paid=Coalesce(
                    Sum("payments__amount"),
                    Value(Decimal("0.00")),
                    output_field=DecimalField(max_digits=12, decimal_places=2),
                )
            )
            .order_by("created_at", "id")
        )

        references = [f"ORDER-{order.id}" for order in orders]
        reference_rollups = _delivery_reference_rollups(delivery_boy, references)

        collected_orders = []
        skipped_orders = []
        total_collected_amount = Decimal("0.00")

        for order in orders:
            reference = f"ORDER-{order.id}"
            rollup = reference_rollups.get(reference, {})
            net_balance = Decimal(str(rollup.get("net_balance", "0.00")))
            pending_from_rider = abs(net_balance) if net_balance < 0 else Decimal("0.00")
            amount_paid = Decimal(str(order.amount_paid or "0.00"))
            remaining_amount = Decimal(str(order.total_amount)) - amount_paid

            if remaining_amount < 0:
                remaining_amount = Decimal("0.00")

            if pending_from_rider <= 0:
                if order.customer_account_id and order.payment_status != "PAID":
                    skipped_orders.append(
                        {
                            "id": order.id,
                            "reason": "This order was already moved to customer ledger.",
                        }
                    )
                elif order.payment_status == "PAID":
                    skipped_orders.append(
                        {
                            "id": order.id,
                            "reason": "This order is already settled.",
                        }
                    )
                else:
                    skipped_orders.append(
                        {
                            "id": order.id,
                            "reason": "No rider balance remains on this order.",
                        }
                    )
                continue

            if remaining_amount != pending_from_rider:
                skipped_orders.append(
                    {
                        "id": order.id,
                        "reason": "Rider balance does not match the remaining order amount.",
                    }
                )
                continue

            try:
                collect_payment(order, pending_from_rider, payment_type)
            except ValueError as exc:
                skipped_orders.append(
                    {
                        "id": order.id,
                        "reason": str(exc),
                    }
                )
                continue

            collected_orders.append(
                {
                    "id": order.id,
                    "amount": pending_from_rider,
                }
            )
            total_collected_amount += pending_from_rider

        return Response(
            {
                "success": True,
                "delivery_boy_id": delivery_boy.id,
                "delivery_boy_name": delivery_boy.name,
                "summary": {
                    "collected_count": len(collected_orders),
                    "skipped_count": len(skipped_orders),
                    "total_collected_amount": total_collected_amount,
                    "payment_type": payment_type,
                },
                "collected_orders": collected_orders,
                "skipped_orders": skipped_orders,
            }
        )


class LedgerEntriesAPIView(APIView):

    def get(self, request):
        queryset = LedgerEntry.objects.select_related("ledger_account", "created_by").order_by("-created_at", "-id")

        account_id = request.query_params.get("account_id")
        account_type = request.query_params.get("account_type")
        entry_type = request.query_params.get("entry_type")
        payment_type = request.query_params.get("payment_type")
        start_date = request.query_params.get("start_date")
        end_date = request.query_params.get("end_date")
        search = (request.query_params.get("search") or "").strip()

        if account_id:
            queryset = queryset.filter(ledger_account_id=account_id)

        if account_type:
            queryset = queryset.filter(ledger_account__account_type=account_type)

        if entry_type:
            queryset = queryset.filter(entry_type=entry_type)

        if payment_type:
            queryset = queryset.filter(payment_type=payment_type)

        if start_date:
            parsed_start_date = parse_date(start_date)
            if not parsed_start_date:
                return Response({"error": "Enter a valid start date."}, status=status.HTTP_400_BAD_REQUEST)

            queryset = queryset.filter(
                Q(entry_date__gte=parsed_start_date)
                | Q(entry_date__isnull=True, created_at__date__gte=parsed_start_date)
            )

        if end_date:
            parsed_end_date = parse_date(end_date)
            if not parsed_end_date:
                return Response({"error": "Enter a valid end date."}, status=status.HTTP_400_BAD_REQUEST)

            queryset = queryset.filter(
                Q(entry_date__lte=parsed_end_date)
                | Q(entry_date__isnull=True, created_at__date__lte=parsed_end_date)
            )

        if search:
            queryset = queryset.filter(
                Q(reference__icontains=search)
                | Q(document_number__icontains=search)
                | Q(description__icontains=search)
                | Q(ledger_account__name__icontains=search)
            )

        undone_references = set(
            LedgerEntry.objects.filter(reference__startswith=UNDO_REFERENCE_PREFIX)
            .values_list("reference", flat=True)
        )

        data = [
            {
                "id": entry.id,
                "account_id": entry.ledger_account.id,
                "account": entry.ledger_account.name,
                "account_type": entry.ledger_account.account_type,
                "entry_type": entry.entry_type,
                "payment_type": entry.payment_type,
                "amount": entry.amount,
                "reference": entry.reference,
                "action_label": (
                    "Invoice Recorded"
                    if entry.reference == "VENDOR-DUE"
                    else "Payment Issued"
                    if entry.reference == "VENDOR-PAY"
                    else "Balance Correction (Increase)"
                    if entry.reference == "VENDOR-ADJUST-UP"
                    else "Balance Correction (Decrease)"
                    if entry.reference == "VENDOR-ADJUST-DOWN"
                    else "Reversal Entry"
                    if str(entry.reference or "").startswith(UNDO_REFERENCE_PREFIX)
                    else entry.entry_type
                ),
                "document_number": entry.document_number,
                "description": entry.description,
                "date": entry.created_at,
                "entry_date": entry.entry_date or entry.created_at.date(),
                "created_by_name": (
                    entry.created_by.get_full_name().strip() or entry.created_by.username
                    if entry.created_by else None
                ),
                "can_undo": (
                    entry.ledger_account.account_type == "VENDOR"
                    and entry.reference in VENDOR_ENTRY_REFERENCES
                    and f"{UNDO_REFERENCE_PREFIX}{entry.id}" not in undone_references
                ),
            }
            for entry in queryset
        ]

        return Response(data)


class CollectFromAccountAPIView(APIView):

    @transaction.atomic
    def post(self, request):
        account_id = request.data.get("account_id")
        amount = request.data.get("amount")
        payment_type = str(request.data.get("payment_type") or "CASH").upper()

        if not account_id or amount in (None, ""):
            return Response({"error": "Account and amount required"}, status=status.HTTP_400_BAD_REQUEST)

        account = get_object_or_404(LedgerAccount, id=account_id)

        if account.account_type != "CUSTOMER":
            return Response(
                {"error": "Manual collect is allowed only for customer accounts."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if payment_type not in {"CASH", "ONLINE"}:
            return Response(
                {"error": "Select a valid payment type."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            amount = Decimal(str(amount))
        except (InvalidOperation, TypeError):
            return Response({"error": "Enter a valid amount."}, status=status.HTTP_400_BAD_REQUEST)

        if amount <= 0:
            return Response({"error": "Amount must be greater than zero"}, status=status.HTTP_400_BAD_REQUEST)

        cash = get_cash_drawer()

        record_debit(
            account=account,
            amount=amount,
            payment_type=payment_type,
            reference="MANUAL-COLLECT",
            description="Manual payment received from customer account",
        )

        record_credit(
            account=cash,
            amount=amount,
            payment_type=payment_type,
            reference="MANUAL-COLLECT",
            description=f"Collected from {account.name}",
        )

        updated_orders = _sync_customer_collection_to_orders(
            account=account,
            amount=amount,
            payment_type=payment_type,
        )

        account.refresh_from_db()

        return Response(
            {
                "success": True,
                "account": account.name,
                "amount": amount,
                "payment_type": payment_type,
                "updated_orders": updated_orders,
                "current_balance": account.balance,
            }
        )


class VendorLedgerEntryAPIView(APIView):

    @transaction.atomic
    def post(self, request):
        account_id = request.data.get("account_id")
        mode = str(request.data.get("mode") or "").upper()
        amount = request.data.get("amount")
        payment_type = str(request.data.get("payment_type") or "CASH").upper()
        note = str(request.data.get("note") or "").strip()
        document_number = str(request.data.get("document_number") or "").strip() or None
        entry_date = request.data.get("entry_date")

        if not account_id or amount in (None, ""):
            return Response({"error": "Vendor account and amount are required."}, status=status.HTTP_400_BAD_REQUEST)

        vendor = get_object_or_404(LedgerAccount, id=account_id, account_type="VENDOR")

        try:
            amount = Decimal(str(amount))
        except (InvalidOperation, TypeError):
            return Response({"error": "Enter a valid amount."}, status=status.HTTP_400_BAD_REQUEST)

        if amount <= 0:
            return Response({"error": "Amount must be greater than zero."}, status=status.HTTP_400_BAD_REQUEST)

        if mode not in {"OWE", "PAY", "ADJUST_UP", "ADJUST_DOWN"}:
            return Response({"error": "Select a valid vendor action."}, status=status.HTTP_400_BAD_REQUEST)

        if mode == "PAY" and payment_type not in {"CASH", "ONLINE"}:
            return Response({"error": "Vendor payment must be cash or online."}, status=status.HTTP_400_BAD_REQUEST)

        parsed_entry_date = parse_date(entry_date) if entry_date else None
        if entry_date and not parsed_entry_date:
            return Response({"error": "Enter a valid statement date."}, status=status.HTTP_400_BAD_REQUEST)

        entry_defaults = {
            "entry_date": parsed_entry_date,
            "document_number": document_number,
            "created_by": request.user if getattr(request, "user", None) and request.user.is_authenticated else None,
        }

        if mode == "OWE":
            record_credit(
                account=vendor,
                amount=amount,
                payment_type="SYSTEM",
                reference="VENDOR-DUE",
                description=note or "Vendor due recorded",
                **entry_defaults,
            )
        elif mode == "PAY":
            cash = get_cash_drawer()
            record_debit(
                account=vendor,
                amount=amount,
                payment_type=payment_type,
                reference="VENDOR-PAY",
                description=note or "Vendor payment recorded",
                **entry_defaults,
            )
            record_debit(
                account=cash,
                amount=amount,
                payment_type=payment_type,
                reference=f"VENDOR-PAY-{vendor.id}",
                description=f"Vendor payment made to {vendor.name}",
                **entry_defaults,
            )
        elif mode == "ADJUST_UP":
            record_credit(
                account=vendor,
                amount=amount,
                payment_type="SYSTEM",
                reference="VENDOR-ADJUST-UP",
                description=note or "Vendor balance increased manually",
                **entry_defaults,
            )
        else:
            record_debit(
                account=vendor,
                amount=amount,
                payment_type="SYSTEM",
                reference="VENDOR-ADJUST-DOWN",
                description=note or "Vendor balance decreased manually",
                **entry_defaults,
            )

        vendor.refresh_from_db()

        return Response(
            {
                "success": True,
                "account_id": vendor.id,
                "account_name": vendor.name,
                "mode": mode,
                "amount": amount,
                "document_number": document_number,
                "entry_date": parsed_entry_date,
                "current_balance": vendor.balance,
            },
            status=status.HTTP_201_CREATED,
        )


class LedgerEntryUndoAPIView(APIView):

    @transaction.atomic
    def post(self, request, entry_id):
        entry = get_object_or_404(
            LedgerEntry.objects.select_related("ledger_account"),
            id=entry_id,
        )

        if entry.ledger_account.account_type != "VENDOR":
            return Response({"error": "Undo is only available for vendor ledger entries."}, status=status.HTTP_400_BAD_REQUEST)

        if entry.reference not in VENDOR_ENTRY_REFERENCES:
            return Response({"error": "This transaction cannot be undone from the vendor ledger."}, status=status.HTTP_400_BAD_REQUEST)

        if LedgerEntry.objects.filter(reference=f"{UNDO_REFERENCE_PREFIX}{entry.id}").exists():
            return Response({"error": "This transaction was already undone."}, status=status.HTTP_400_BAD_REQUEST)

        reverse_entry_type = "DEBIT" if entry.entry_type == "CREDIT" else "CREDIT"

        LedgerEntry.objects.create(
            ledger_account=entry.ledger_account,
            amount=entry.amount,
            entry_type=reverse_entry_type,
            payment_type=entry.payment_type,
            reference=f"{UNDO_REFERENCE_PREFIX}{entry.id}",
            document_number=entry.document_number,
            entry_date=entry.entry_date,
            description=f"Undo for entry #{entry.id}: {entry.description or entry.reference or 'vendor transaction'}",
            created_by=request.user if getattr(request, "user", None) and request.user.is_authenticated else None,
        )

        if entry.reference == "VENDOR-PAY":
            record_credit(
                account=get_cash_drawer(),
                amount=entry.amount,
                payment_type=entry.payment_type,
                reference=f"{UNDO_REFERENCE_PREFIX}{entry.id}",
                description=f"Undo vendor payment for {entry.ledger_account.name}",
                document_number=entry.document_number,
                entry_date=entry.entry_date,
                created_by=request.user if getattr(request, "user", None) and request.user.is_authenticated else None,
            )

        entry.ledger_account.refresh_from_db()

        return Response(
            {
                "success": True,
                "entry_id": entry.id,
                "account_id": entry.ledger_account.id,
                "current_balance": entry.ledger_account.balance,
            }
        )
