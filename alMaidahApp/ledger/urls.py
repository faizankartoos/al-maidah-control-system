from django.urls import path
from .views import (
    AccountDetailAPIView,
    AccountListCreateAPIView,
    CustomerLedgerAPIView,
    DailyReportAPIView,
    DeliveryBoysAPIView,
    LedgerEntriesAPIView,
    CollectFromAccountAPIView
)

urlpatterns = [

    path("accounts/", AccountListCreateAPIView.as_view()),
    path("accounts/<int:account_id>/", AccountDetailAPIView.as_view()),
    path("customer-ledger/<int:customer_id>/", CustomerLedgerAPIView.as_view()),
    path("daily-report/", DailyReportAPIView.as_view()),
    path("ledger/delivery-boys/", DeliveryBoysAPIView.as_view()),
    path("ledger/entries/", LedgerEntriesAPIView.as_view()),
    path("ledger/collect/", CollectFromAccountAPIView.as_view()),

]
