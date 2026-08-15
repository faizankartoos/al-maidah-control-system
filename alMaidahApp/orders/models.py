import re

from django.db import models
from django.db.models import Sum
from django.contrib.auth.models import User
from ledger.models import LedgerAccount
from decimal import Decimal


def normalize_area_name(value):
    cleaned = re.sub(r"\s+", " ", (value or "").strip())
    return cleaned.lower()


class Area(models.Model):
    name = models.CharField(max_length=120, unique=True)
    normalized_name = models.CharField(max_length=120, unique=True, editable=False)
    delivery_charge = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        default=0
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["name"]

    def save(self, *args, **kwargs):
        self.name = re.sub(r"\s+", " ", (self.name or "").strip())
        self.normalized_name = normalize_area_name(self.name)
        super().save(*args, **kwargs)

    def __str__(self):
        return self.name

class Order(models.Model):

    ORDER_TYPES = (
        ("DINE_IN", "Dine In"),
        ("TAKEAWAY", "Takeaway"),
        ("DELIVERY", "Delivery"),
    )

    ORDER_STATUS = (
        ('SCHEDULED', 'Scheduled'),
        ("PROCESSING", "Processing"),
        ("READY", "Ready"),
        ("COMPLETED", "Completed"),
        ("CANCELLED", "Cancelled"),
    )

    PAYMENT_STATUS = (
        ("UNPAID", "Unpaid"),
        ("PARTIAL", "Partial"),
        ("PAID", "Paid"),
    )

    SUBMISSION_SOURCES = (
        ("INTERNAL", "Internal"),
        ("EXTERNAL", "External"),
    )

    ACCEPTANCE_STATUS = (
        ("NOT_REQUIRED", "Not Required"),
        ("PENDING", "Pending"),
        ("ACCEPTED", "Accepted"),
        ("DECLINED", "Declined"),
    )

    order_type = models.CharField(
        max_length=20,
        choices=ORDER_TYPES
    )

    order_status = models.CharField(
        max_length=20,
        choices=ORDER_STATUS,
        default="PROCESSING",
    )

    payment_status = models.CharField(
        max_length=20,
        choices=PAYMENT_STATUS,
        default="UNPAID",
    )

    submission_source = models.CharField(
        max_length=20,
        choices=SUBMISSION_SOURCES,
        default="INTERNAL",
    )

    acceptance_status = models.CharField(
        max_length=20,
        choices=ACCEPTANCE_STATUS,
        default="NOT_REQUIRED",
    )

    customer_name = models.CharField(
        max_length=150,
        blank=True,
        null=True
    )

    customer_phone = models.CharField(
        max_length=20,
        blank=True,
        null=True
    )

    delivery_address = models.TextField(
        blank=True,
        null=True
    )

    area = models.ForeignKey(
        Area,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="orders",
    )

    order_note = models.TextField(
        blank=True,
        null=True
    )

    subtotal = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        default=0
    )

    discount = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        default=0
    )
    delivery_charge = models.DecimalField(
    max_digits=10,
    decimal_places=2,
    default=0
    )

    total_amount = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        default=0
    )
    update_count = models.PositiveIntegerField(default=0)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    completed_at = models.DateTimeField(
        null=True,
        blank=True
    )
    cancelled_at = models.DateTimeField(
        null=True,
        blank=True
    )

    submitted_by = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="submitted_orders",
    )

    acceptance_decided_by = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="accepted_or_declined_orders",
    )

    acceptance_decided_at = models.DateTimeField(
        null=True,
        blank=True
    )

    customer_account = models.ForeignKey(
        LedgerAccount,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="orders"
    )
    delivery_boy = models.ForeignKey(
    LedgerAccount,
    on_delete=models.PROTECT,
    null=True,
    blank=True,
    related_name="delivery_orders"
    )
    table_number = models.CharField(
    max_length=20,
    blank=True,
    null=True
    )
    scheduled_time = models.DateTimeField(
    null=True,
    blank=True
    )

    guest_count = models.PositiveIntegerField(
        null=True,
        blank=True
    )
    cooked = models.BooleanField(null=True, blank=True)
    refunded = models.BooleanField(default=False)
    refund_amount = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        default=0
    )

    def update_totals(self):

        subtotal = self.items.aggregate(
            total=Sum("total_price")
        )["total"] or 0

        self.subtotal = subtotal
        self.total_amount = subtotal - self.discount + self.delivery_charge

        if self.total_amount < 0:
            self.total_amount = 0

        self.save(update_fields=["subtotal", "total_amount"])

    def __str__(self):
        return f"Order #{self.id} ({self.order_type})"


class OrderItem(models.Model):

    order = models.ForeignKey(
        Order,
        on_delete=models.CASCADE,
        related_name="items"
    )

    item_name = models.CharField(max_length=150)

    quantity = models.PositiveIntegerField()

    price = models.DecimalField(
        max_digits=10,
        decimal_places=2
    )

    total_price = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        blank=True,
        null=True
    )



    def save(self, *args, **kwargs):

        self.total_price = self.quantity * self.price

        super().save(*args, **kwargs)

        self.order.update_totals()

    def delete(self, *args, **kwargs):

        order = self.order

        super().delete(*args, **kwargs)

        order.update_totals()

    def __str__(self):
        return f"{self.item_name} x {self.quantity}"
    
class OrderPayment(models.Model):

    PAYMENT_TYPES = (
        ("CASH", "Cash"),
        ("ONLINE", "Online"),
        ("MIXED", "Mixed"),
        ("ADVANCE", "Advance"),
    )

    order = models.ForeignKey(
        Order,
        on_delete=models.CASCADE,
        related_name="payments",
    )

    amount = models.DecimalField(
        max_digits=12,
        decimal_places=2
    )

    payment_type = models.CharField(
        max_length=10,
        choices=PAYMENT_TYPES
    )

    cash_amount = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        default=Decimal("0.00")
    )

    online_amount = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        default=Decimal("0.00")
    )

    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.amount} payment for Order #{self.order.id}"
