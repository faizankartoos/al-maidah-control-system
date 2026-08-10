from django.db import transaction
from django.utils import timezone
from .models import LedgerEntry


def _normalize_entry_defaults(extra_fields):
    normalized = {**extra_fields}
    normalized.setdefault("entry_date", timezone.localdate())
    return normalized


@transaction.atomic
def record_credit(account, amount, payment_type="SYSTEM", reference=None, description="", **extra_fields):
    """
    Record money coming INTO an account.
    """

    payload = _normalize_entry_defaults(extra_fields)

    return LedgerEntry.objects.create(
        ledger_account=account,
        amount=amount,
        entry_type="CREDIT",
        payment_type=payment_type,
        reference=reference,
        description=description,
        **payload,
    )


@transaction.atomic
def record_debit(account, amount, payment_type="SYSTEM", reference=None, description="", **extra_fields):
    """
    Record money leaving an account.
    """

    payload = _normalize_entry_defaults(extra_fields)

    return LedgerEntry.objects.create(
        ledger_account=account,
        amount=amount,
        entry_type="DEBIT",
        payment_type=payment_type,
        reference=reference,
        description=description,
        **payload,
    )


@transaction.atomic
def transfer_money(from_account, to_account, amount, payment_type="SYSTEM", reference=None, **extra_fields):
    """
    Transfer money between two accounts.
    """

    record_debit(
        account=from_account,
        amount=amount,
        payment_type=payment_type,
        reference=reference,
        description="Transfer out",
        **extra_fields,
    )

    record_credit(
        account=to_account,
        amount=amount,
        payment_type=payment_type,
        reference=reference,
        description="Transfer in",
        **extra_fields,
    )
