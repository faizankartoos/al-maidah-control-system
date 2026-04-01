from django.db import models
from django.db.models import Sum


class LedgerAccount(models.Model):

    ACCOUNT_TYPES = (
        ("CASH", "Cash Drawer"),
        ("CUSTOMER", "Customer"),
        ("DELIVERY", "Delivery Boy"),
        ("VENDOR", "Vendor"),
    )

    name = models.CharField(max_length=150)

    account_type = models.CharField(
        max_length=20,
        choices=ACCOUNT_TYPES
    )

    contact_number = models.CharField(
        max_length=20,
        blank=True,
        null=True,
        unique=True
    )

    address = models.CharField(
        max_length=255,
        blank=True,
        null=True
    )

    opening_balance = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        default=0
    )

    is_active = models.BooleanField(default=True)

    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["name"]

    def __str__(self):
        return f"{self.name} ({self.account_type})"

    @property
    def balance(self):

        credits = self.entries.filter(
            entry_type="CREDIT"
        ).aggregate(total=Sum("amount"))["total"] or 0

        debits = self.entries.filter(
            entry_type="DEBIT"
        ).aggregate(total=Sum("amount"))["total"] or 0

        return self.opening_balance + credits - debits


class LedgerEntry(models.Model):

    ENTRY_TYPES = (
        ("CREDIT", "Credit"),
        ("DEBIT", "Debit"),
    )

    PAYMENT_TYPES = (
        ("CASH", "Cash"),
        ("ONLINE", "Online"),
        ("SYSTEM", "System"),
    )

    ledger_account = models.ForeignKey(
        LedgerAccount,
        on_delete=models.PROTECT,
        related_name="entries"
    )

    amount = models.DecimalField(
        max_digits=12,
        decimal_places=2
    )

    entry_type = models.CharField(
        max_length=10,
        choices=ENTRY_TYPES
    )

    payment_type = models.CharField(
        max_length=10,
        choices=PAYMENT_TYPES,
        default="SYSTEM"
    )

    reference = models.CharField(
        max_length=100,
        blank=True,
        null=True
    )

    description = models.CharField(
        max_length=255,
        blank=True,
        null=True
    )

    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.entry_type} {self.amount} → {self.ledger_account.name}"