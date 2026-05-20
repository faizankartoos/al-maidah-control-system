from django.db import migrations


def seed_default_cost_categories(apps, schema_editor):
    ExpenseCategory = apps.get_model("expenses", "ExpenseCategory")

    default_categories = [
        (
            "Labour",
            "Use this for salaries, wages, payroll, overtime, and other staff compensation costs.",
        ),
        (
            "Marketing",
            "Use this for advertising, promotions, banners, flyers, social campaigns, and ad spend.",
        ),
    ]

    for name, description in default_categories:
        if ExpenseCategory.objects.filter(name__iexact=name).exists():
            continue

        ExpenseCategory.objects.create(
            name=name,
            description=description,
            is_active=True,
        )


class Migration(migrations.Migration):

    dependencies = [
        ("expenses", "0001_initial"),
    ]

    operations = [
        migrations.RunPython(seed_default_cost_categories, migrations.RunPython.noop),
    ]
