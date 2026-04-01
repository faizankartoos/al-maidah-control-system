from django.urls import path
from .views import (
    ExpenseCategoryDetailView,
    ExpenseCategoryListCreateView,
    ExpenseListCreateView,
)

urlpatterns = [
    path("expensescategory/", ExpenseCategoryListCreateView.as_view()),
    path("expensescategory/<int:category_id>/", ExpenseCategoryDetailView.as_view()),
    path("expenses/", ExpenseListCreateView.as_view()),
]
