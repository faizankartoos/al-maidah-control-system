from django.db import models
# Create your models here.

class Product(models.Model):
    name = models.CharField(max_length=100, unique=True)
    unit = models.CharField(max_length=20)  # kg, pc, ltr, etc.
    low_stock_threshold = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        default=0,
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["name"]

    def __str__(self):
        return self.name

class Inventory(models.Model):
    product = models.OneToOneField(
        Product,
        on_delete=models.CASCADE,
        related_name='inventory'
    )

    quantity = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        default=0
    )

    total_value = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        default=0
    )

    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["product__name"]

    @property
    def average_unit_cost(self):
        if self.quantity == 0:
            return 0
        return self.total_value / self.quantity

    def __str__(self):
        return f"{self.product.name}: {self.quantity} {self.product.unit}"


class PurchaseBill(models.Model):
    STATUS_CHOICES = (
        ("DRAFT", "Draft"),
        ("CONFIRMED", "Confirmed"),
    )

    supplier_name = models.CharField(max_length=150)
    bill_number = models.CharField(max_length=100, blank=True, null=True)
    bill_date = models.DateField()
    status = models.CharField(
        max_length=20,
        choices=STATUS_CHOICES,
        default="DRAFT"
    )
    confirmed_at = models.DateTimeField(null=True, blank=True)

    total_amount = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        default=0
    )

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"Bill #{self.id} - {self.supplier_name}"

class PurchaseItem(models.Model):
    bill = models.ForeignKey(
        PurchaseBill,
        on_delete=models.CASCADE,
        related_name="items"
    )

    product = models.ForeignKey(
        Product,
        on_delete=models.PROTECT
    )

    quantity = models.DecimalField(
        max_digits=12,
        decimal_places=2
    )

    unit_price = models.DecimalField(
        max_digits=12,
        decimal_places=2
    )

    line_total = models.DecimalField(
        max_digits=12,
        decimal_places=2
    )

    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["id"]

    def save(self, *args, **kwargs):
        self.line_total = self.quantity * self.unit_price
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.product.name} x {self.quantity}"


class StockOutLog(models.Model):
    product = models.ForeignKey(Product, on_delete=models.PROTECT)
    quantity = models.DecimalField(max_digits=10, decimal_places=2)
    reason = models.CharField(max_length=255)
    unit_cost = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    value_reduced = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    used_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-used_at"]

    def __str__(self):
        return f"OUT {self.quantity} {self.product.name} ({self.reason})"


class StockAdjustmentLog(models.Model):
    ADJUSTMENT_TYPES = (
        ("INCREASE", "Increase"),
        ("DECREASE", "Decrease"),
    )

    product = models.ForeignKey(
        Product,
        on_delete=models.PROTECT,
        related_name="stock_adjustments",
    )
    adjustment_type = models.CharField(max_length=20, choices=ADJUSTMENT_TYPES)
    quantity_change = models.DecimalField(max_digits=12, decimal_places=2)
    unit_cost = models.DecimalField(max_digits=12, decimal_places=2)
    value_change = models.DecimalField(max_digits=12, decimal_places=2)
    previous_quantity = models.DecimalField(max_digits=12, decimal_places=2)
    new_quantity = models.DecimalField(max_digits=12, decimal_places=2)
    previous_total_value = models.DecimalField(max_digits=12, decimal_places=2)
    new_total_value = models.DecimalField(max_digits=12, decimal_places=2)
    reason = models.CharField(max_length=255)
    adjusted_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-adjusted_at"]

    def __str__(self):
        direction = "+" if self.quantity_change > 0 else ""
        return f"{direction}{self.quantity_change} {self.product.name} ({self.reason})"
