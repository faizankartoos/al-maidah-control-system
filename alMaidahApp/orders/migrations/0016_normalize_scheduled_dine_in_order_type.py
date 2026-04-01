from django.db import migrations, models


def normalize_scheduled_dine_in(apps, schema_editor):
    Order = apps.get_model("orders", "Order")
    Order.objects.filter(order_type="SCHEDULED_DINE_IN").update(order_type="DINE_IN")


class Migration(migrations.Migration):

    dependencies = [
        ("orders", "0015_order_refunded_order_refund_amount"),
    ]

    operations = [
        migrations.RunPython(normalize_scheduled_dine_in, migrations.RunPython.noop),
        migrations.AlterField(
            model_name="order",
            name="order_type",
            field=models.CharField(
                choices=[
                    ("DINE_IN", "Dine In"),
                    ("TAKEAWAY", "Takeaway"),
                    ("DELIVERY", "Delivery"),
                ],
                max_length=20,
            ),
        ),
    ]
