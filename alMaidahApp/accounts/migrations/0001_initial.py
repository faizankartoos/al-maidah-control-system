from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


def create_profiles_for_existing_users(apps, schema_editor):
    User = apps.get_model("auth", "User")
    UserProfile = apps.get_model("accounts", "UserProfile")

    all_tab_keys = [
        "MENU",
        "ORDERS",
        "MANAGE_ORDERS",
        "INVENTORY",
        "LEDGER",
        "EXPENSES",
        "REPORTS",
        "USER_MANAGEMENT",
    ]

    for user in User.objects.all():
        UserProfile.objects.get_or_create(
            user=user,
            defaults={
                "role": "ADMIN" if user.is_superuser else "STAFF",
                "display_name": f"{(user.first_name or '').strip()} {(user.last_name or '').strip()}".strip() or user.username,
                "allowed_tabs": all_tab_keys if user.is_superuser else [],
            },
        )


class Migration(migrations.Migration):

    initial = True

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name="UserProfile",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("role", models.CharField(choices=[("ADMIN", "Admin"), ("STAFF", "Staff")], default="STAFF", max_length=20)),
                ("display_name", models.CharField(blank=True, max_length=150, null=True)),
                ("allowed_tabs", models.JSONField(blank=True, default=list)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("user", models.OneToOneField(on_delete=django.db.models.deletion.CASCADE, related_name="profile", to=settings.AUTH_USER_MODEL)),
            ],
            options={
                "ordering": ["user__username"],
            },
        ),
        migrations.RunPython(
            create_profiles_for_existing_users,
            migrations.RunPython.noop,
        ),
    ]
