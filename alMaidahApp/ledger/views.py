from decimal import Decimal, InvalidOperation

from django.db.models import Q
from django.db.models.deletion import ProtectedError
from django.shortcuts import get_object_or_404
from django.utils.dateparse import parse_date
from django.db import transaction
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
        serializer.is_valid(raise_exception=True)
        account = serializer.save()
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
        serializer.is_valid(raise_exception=True)
        updated_account = serializer.save()
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

        if account.account_type == "CASH":
            return Response(
                {"error": "Cash drawer is system-managed and cannot be quick deleted."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        _detach_account_from_orders(account)

        if account.entries.exists():
            if account.is_active:
                account.is_active = False
                account.save(update_fields=["is_active"])

            return Response(
                {
                    "message": "Ledger account archived safely. Transaction history was kept untouched.",
                    "account_name": account.name,
                    "action": "archived",
                },
                status=status.HTTP_200_OK,
            )

        try:
            account_name = account.name
            account.delete()
        except ProtectedError:
            return Response(
                {
                    "error": "Quick delete could not finish. This account still has protected linked records."
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        return Response(
            {
                "message": "Ledger account deleted.",
                "account_name": account_name,
                "action": "deleted",
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

        data = [
            {
                "id": boy.id,
                "name": boy.name,
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
