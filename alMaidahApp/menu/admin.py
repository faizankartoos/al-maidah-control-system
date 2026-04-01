from django.contrib import admin
from .models import Menu

@admin.register(Menu)
class MenuAdmin(admin.ModelAdmin):
    list_display = ("name", "category", "price", "is_available", "updated_at")
    list_filter = ("category", "is_available")
    search_fields = ("name", "category")
    list_editable = ("price", "is_available")
    readonly_fields = ("created_at", "updated_at")
