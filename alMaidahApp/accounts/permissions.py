from rest_framework.permissions import BasePermission

from .models import SPECIAL_ACCESS_KEYS, TAB_PERMISSIONS, ensure_user_profile


DEFAULT_MODULE_TABS = {
    "menu.views": ("MENU",),
    "inventory.views": ("INVENTORY",),
    "ledger.views": ("LEDGER",),
    "expenses.views": ("EXPENSES",),
    "reports.views": ("REPORTS",),
    "orders.views": ("ORDERS", "MANAGE_ORDERS"),
}

VALID_TAB_KEYS = {value for value, _label in TAB_PERMISSIONS}
VALID_SPECIAL_KEYS = set(SPECIAL_ACCESS_KEYS)


class TabAccessPermission(BasePermission):
    message = "You do not have permission to access this part of the system."

    def _required_tabs(self, view):
        explicit_tabs = getattr(view, "required_tabs", None)
        if explicit_tabs:
            return tuple(tab for tab in explicit_tabs if tab in VALID_TAB_KEYS)

        module_name = getattr(getattr(view, "__class__", None), "__module__", "")
        return DEFAULT_MODULE_TABS.get(module_name, ())

    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False

        profile = ensure_user_profile(request.user)
        required_tabs = self._required_tabs(view)
        required_permissions = tuple(
            permission
            for permission in getattr(view, "required_permissions", ())
            if permission in VALID_SPECIAL_KEYS
        )

        if required_tabs and not profile.has_any_tab(required_tabs):
            return False

        if required_permissions and not profile.has_special_access(required_permissions):
            return False

        return True


class AdminOnlyPermission(BasePermission):
    message = "Admin access required."

    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False

        profile = ensure_user_profile(request.user)
        return profile.effective_role == "ADMIN"
