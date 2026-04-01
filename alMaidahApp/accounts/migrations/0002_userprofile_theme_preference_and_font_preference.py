from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("accounts", "0001_initial"),
    ]

    operations = [
        migrations.AddField(
            model_name="userprofile",
            name="font_preference",
            field=models.CharField(
                choices=[("SMALL", "Small"), ("MEDIUM", "Medium"), ("BIG", "Big")],
                default="MEDIUM",
                max_length=10,
            ),
        ),
        migrations.AddField(
            model_name="userprofile",
            name="theme_preference",
            field=models.CharField(
                choices=[("NIGHT", "Night"), ("DAY", "Day")],
                default="NIGHT",
                max_length=10,
            ),
        ),
    ]
