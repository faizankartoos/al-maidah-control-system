from django.urls import path
from .views import (
    AccountBulkQuickDeleteAPIView,
    AccountDetailAPIView,
    AccountQuickDeleteAPIView,
    AccountListCreateAPIView,
    CustomerLedgerAPIView,
    DailyReportAPIView,
    DeliveryBoysAPIView,
    DeliveryBoyBulkCollectAPIView,
    DeliveryBoyLedgerAPIView,
    LedgerEntriesAPIView,
    CollectFromAccountAPIView,
    VendorLedgerEntryAPIView,
    LedgerEntryUndoAPIView,
)

urlpatterns = [

    path("accounts/", AccountListCreateAPIView.as_view()),
    path("accounts/bulk-quick-delete/", AccountBulkQuickDeleteAPIView.as_view()),
    path("accounts/<int:account_id>/", AccountDetailAPIView.as_view()),
    path("accounts/<int:account_id>/quick-delete/", AccountQuickDeleteAPIView.as_view()),
    path("customer-ledger/<int:customer_id>/", CustomerLedgerAPIView.as_view()),
    path("daily-report/", DailyReportAPIView.as_view()),
    path("ledger/delivery-boys/", DeliveryBoysAPIView.as_view()),
    path("ledger/delivery-boys/<int:account_id>/summary/", DeliveryBoyLedgerAPIView.as_view()),
    path("ledger/delivery-boys/<int:account_id>/collect-all/", DeliveryBoyBulkCollectAPIView.as_view()),
    path("ledger/entries/", LedgerEntriesAPIView.as_view()),
    path("ledger/collect/", CollectFromAccountAPIView.as_view()),
    path("ledger/vendor-entry/", VendorLedgerEntryAPIView.as_view()),
    path("ledger/entries/<int:entry_id>/undo/", LedgerEntryUndoAPIView.as_view()),

]
