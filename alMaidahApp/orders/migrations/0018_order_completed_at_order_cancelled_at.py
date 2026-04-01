from django.db import migrations, models


def backfill_order_event_timestamps(apps, schema_editor):
    Order = apps.get_model("orders", "Order")

    Order.objects.filter(
        order_status="COMPLETED",
        completed_at__isnull=True,
    ).update(completed_at=models.F("created_at"))

    Order.objects.filter(
        order_status="CANCELLED",
        cancelled_at__isnull=True,
    ).update(cancelled_at=models.F("created_at"))


class Migration(migrations.Migration):

    dependencies = [
        ("orders", "0017_remove_partial_payment_status"),
    ]

    operations = [
        migrations.AddField(
            model_name="order",
            name="completed_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="order",
            name="cancelled_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.RunPython(
            backfill_order_event_timestamps,
            migrations.RunPython.noop,
        ),
    ]
