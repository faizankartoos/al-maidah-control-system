from decimal import Decimal

from django.db import migrations, models
from django.db.models import Sum


def normalize_partial_payment_status(apps, schema_editor):
    Order = apps.get_model("orders", "Order")
    OrderPayment = apps.get_model("orders", "OrderPayment")

    for order in Order.objects.filter(payment_status="PARTIAL"):
        total_paid = OrderPayment.objects.filter(order=order).aggregate(
            total=Sum("amount")
        )["total"] or Decimal("0.00")

        if Decimal(str(total_paid)) >= Decimal(str(order.total_amount)):
            order.payment_status = "PAID"
        else:
            order.payment_status = "UNPAID"

        order.save(update_fields=["payment_status"])


class Migration(migrations.Migration):

    dependencies = [
        ("orders", "0016_normalize_scheduled_dine_in_order_type"),
    ]

    operations = [
        migrations.RunPython(normalize_partial_payment_status, migrations.RunPython.noop),
        migrations.AlterField(
            model_name="order",
            name="payment_status",
            field=models.CharField(
                choices=[
                    ("UNPAID", "Unpaid"),
                    ("PAID", "Paid"),
                ],
                default="UNPAID",
                max_length=20,
            ),
        ),
    ]
