from django.db import transaction
from .models import LedgerEntry


@transaction.atomic
def record_credit(account, amount, payment_type="SYSTEM", reference=None, description=""):
    """
    Record money coming INTO an account.
    """

    return LedgerEntry.objects.create(
        ledger_account=account,
        amount=amount,
        entry_type="CREDIT",
        payment_type=payment_type,
        reference=reference,
        description=description,
    )


@transaction.atomic
def record_debit(account, amount, payment_type="SYSTEM", reference=None, description=""):
    """
    Record money leaving an account.
    """

    return LedgerEntry.objects.create(
        ledger_account=account,
        amount=amount,
        entry_type="DEBIT",
        payment_type=payment_type,
        reference=reference,
        description=description,
    )


@transaction.atomic
def transfer_money(from_account, to_account, amount, payment_type="SYSTEM", reference=None):
    """
    Transfer money between two accounts.
    """

    record_debit(
        account=from_account,
        amount=amount,
        payment_type=payment_type,
        reference=reference,
        description="Transfer out",
    )

    record_credit(
        account=to_account,
        amount=amount,
        payment_type=payment_type,
        reference=reference,
        description="Transfer in",
    )

