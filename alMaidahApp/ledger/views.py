from decimal import Decimal, InvalidOperation

from django.db.models import Q
from django.db.models.deletion import ProtectedError
from django.shortcuts import get_object_or_404
from django.utils.dateparse import parse_date
from django.db import IntegrityError, transaction
from django.db.models import Sum
from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import LedgerAccount, LedgerEntry
from .reports import account_ledger_report, daily_sales_report
from .serializers import AccountSerializer, AccountWriteSerializer
from .services import record_credit, record_debit
from .utils import get_cash_drawer
from orders.models import Order, OrderPayment

ACCOUNT_MANAGEMENT_PASSWORD = "admin@almaidah"
UNDO_REFERENCE_PREFIX = "UNDO-ENTRY-"


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


def _detach_account_from_orders(account):
    if account.account_type == "CUSTOMER":
        Order.objects.filter(customer_account=account).update(customer_account=None)
        return

    if account.account_type == "DELIVERY":
        Order.objects.filter(delivery_boy=account).update(delivery_boy=None)


def _vendor_entry_can_be_undone(entry):
    return (
        entry.ledger_account.account_type == "VENDOR"
        and entry.reference in {"VENDOR-DUE", "VENDOR-PAY"}
        and not LedgerEntry.objects.filter(reference=f"{UNDO_REFERENCE_PREFIX}{entry.id}").exists()
    )


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
        if account.is_active:
            account.is_active = False
            account.save(update_fields=["is_active"])

        return {
            "ok": True,
            "account_id": account.id,
            "account_name": account.name,
            "message": "Ledger account archived safely. Transaction history was kept untouched.",
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
                {
                    "error": _extract_error_message(serializer.errors, "Failed to create account."),
                    "errors": serializer.errors,
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            account = serializer.save()
        except IntegrityError as exc:
            return Response(
                _account_integrity_error_message(exc),
                status=status.HTTP_400_BAD_REQUEST,
            )

        return Response(AccountSerializer(account).data, status=status.HTTP_201_CREATED)


class AccountDetailAPIView(APIView):

    def get(self, request, account_id):
        account = get_object_or_404(LedgerAccount, id=account_id)
        return Response(account_ledger_report(account.id))

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
                {
                    "error": _extract_error_message(serializer.errors, "Failed to update account."),
                    "errors": serializer.errors,
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            updated_account = serializer.save()
        except IntegrityError as exc:
            return Response(
                _account_integrity_error_message(exc),
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
        boys = LedgerAccount.objects.filter(account_type="DELIVERY", is_active=True).order_by("name")

        if not boys.exists():
            boys = LedgerAccount.objects.filter(account_type="DELIVERY").order_by("name")

        data = [
            {
                "id": boy.id,
                "name": boy.name,
                "is_active": boy.is_active,
            }
            for boy in boys
        ]

        return Response(data)


class LedgerEntriesAPIView(APIView):

    def get(self, request):
        queryset = LedgerEntry.objects.select_related("ledger_account").order_by("-created_at", "-id")

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
            queryset = queryset.filter(created_at__date__gte=start_date)

        if end_date:
            queryset = queryset.filter(created_at__date__lte=end_date)

        if search:
            queryset = queryset.filter(
                Q(reference__icontains=search)
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
                "description": entry.description,
                "date": entry.created_at,
                "can_undo": (
                    entry.ledger_account.account_type == "VENDOR"
                    and entry.reference in {"VENDOR-DUE", "VENDOR-PAY"}
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

        if not account_id or amount in (None, ""):
            return Response({"error": "Vendor account and amount are required."}, status=status.HTTP_400_BAD_REQUEST)

        vendor = get_object_or_404(LedgerAccount, id=account_id, account_type="VENDOR")

        try:
            amount = Decimal(str(amount))
        except (InvalidOperation, TypeError):
            return Response({"error": "Enter a valid amount."}, status=status.HTTP_400_BAD_REQUEST)

        if amount <= 0:
            return Response({"error": "Amount must be greater than zero."}, status=status.HTTP_400_BAD_REQUEST)

        if mode not in {"OWE", "PAY"}:
            return Response({"error": "Select a valid vendor action."}, status=status.HTTP_400_BAD_REQUEST)

        if mode == "PAY" and payment_type not in {"CASH", "ONLINE"}:
            return Response({"error": "Vendor payment must be cash or online."}, status=status.HTTP_400_BAD_REQUEST)

        if mode == "OWE":
            record_credit(
                account=vendor,
                amount=amount,
                payment_type="SYSTEM",
                reference="VENDOR-DUE",
                description=note or "Vendor due recorded",
            )
        else:
            cash = get_cash_drawer()
            record_debit(
                account=vendor,
                amount=amount,
                payment_type=payment_type,
                reference="VENDOR-PAY",
                description=note or "Vendor payment recorded",
            )
            record_debit(
                account=cash,
                amount=amount,
                payment_type=payment_type,
                reference=f"VENDOR-PAY-{vendor.id}",
                description=f"Vendor payment made to {vendor.name}",
            )

        vendor.refresh_from_db()

        return Response(
            {
                "success": True,
                "account_id": vendor.id,
                "account_name": vendor.name,
                "mode": mode,
                "amount": amount,
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

        if entry.reference not in {"VENDOR-DUE", "VENDOR-PAY"}:
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
            description=f"Undo for entry #{entry.id}: {entry.description or entry.reference or 'vendor transaction'}",
        )

        if entry.reference == "VENDOR-PAY":
            record_credit(
                account=get_cash_drawer(),
                amount=entry.amount,
                payment_type=entry.payment_type,
                reference=f"{UNDO_REFERENCE_PREFIX}{entry.id}",
                description=f"Undo vendor payment for {entry.ledger_account.name}",
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
