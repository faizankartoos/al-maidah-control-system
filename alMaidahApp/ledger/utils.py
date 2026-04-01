from .models import LedgerAccount


def get_cash_drawer():
    """
    Returns the system Cash Drawer account.
    If it doesn't exist, it will be created automatically.
    """

    cash_account, created = LedgerAccount.objects.get_or_create(
        name="Cash Drawer",
        account_type="CASH",
        defaults={
            "is_active": True,
        },
    )

    return cash_account


def get_or_create_customer(name, contact_number, address=None):
    """
    Find existing customer using phone number
    or create a new one.
    """

    customer, created = LedgerAccount.objects.get_or_create(
        contact_number=contact_number,
        defaults={
            "name": name,
            "account_type": "CUSTOMER",
            "address": address,
        }
    )

    return customer
