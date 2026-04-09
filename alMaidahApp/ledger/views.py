from decimal import Decimal, InvalidOperation

from django.db.models import Q
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

        outstanding = Decimal(str(account.balance))

        if outstanding <= 0:
            return Response(
                {"error": "This customer has no outstanding balance to collect."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if amount > outstanding:
            return Response(
                {"error": "Cannot collect more than the customer's outstanding balance."},
                status=status.HTTP_400_BAD_REQUEST,
            )

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

        return Response(
            {
                "success": True,
                "account": account.name,
                "amount": amount,
                "payment_type": payment_type,
                "updated_orders": updated_orders,
            }
        )
