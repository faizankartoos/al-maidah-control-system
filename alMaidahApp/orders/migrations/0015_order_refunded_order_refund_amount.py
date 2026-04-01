from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("orders", "0014_orderpayment_cash_amount_orderpayment_online_amount_and_more"),
    ]

    operations = [
        migrations.AddField(
            model_name="order",
            name="refunded",
            field=models.BooleanField(default=False),
        ),
        migrations.AddField(
            model_name="order",
            name="refund_amount",
            field=models.DecimalField(decimal_places=2, default=0, max_digits=12),
        ),
    ]
