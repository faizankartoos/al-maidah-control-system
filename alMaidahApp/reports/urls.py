from django.urls import path
from .views import (
    DashboardReportAPIView,
    SalesReportAPIView,
    CogsReportAPIView,
    ExpensesReportAPIView,
    FinancialDrilldownReportAPIView,
    ProfitReportAPIView,
    InventoryConsumptionReportAPIView,
    DataInsightsReportAPIView,
)

urlpatterns = [
    path("dashboard/", DashboardReportAPIView.as_view()),
    path("data-insights/", DataInsightsReportAPIView.as_view()),
    path("sales/", SalesReportAPIView.as_view()),
    path("cogs/", CogsReportAPIView.as_view()),
    path("expenses/", ExpensesReportAPIView.as_view()),
    path("financial-drilldown/", FinancialDrilldownReportAPIView.as_view()),
    path("profit/", ProfitReportAPIView.as_view()),
    path("inventory-consumption/", InventoryConsumptionReportAPIView.as_view()),
]
