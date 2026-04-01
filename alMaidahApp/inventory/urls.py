from django.urls import path
from .views import (
    ProductAPIView,
    ProductDetailAPIView,
    InventoryAPIView,
    InventoryHistoryAPIView,
    LowStockAPIView,
    PurchaseBillAPIView,
    PurchaseBillDetailAPIView,
    PurchaseItemAPIView,
    PurchaseItemDetailAPIView,
    ConfirmPurchaseBillAPIView,
    StockAdjustmentAPIView,
    StockOutAPIView,
)

urlpatterns = [
    path("products/", ProductAPIView.as_view()),
    path("products/<int:product_id>/", ProductDetailAPIView.as_view()),
    path("inventory/", InventoryAPIView.as_view()),
    path("inventory/low-stock/", LowStockAPIView.as_view()),
    path("inventory/history/", InventoryHistoryAPIView.as_view()),
    path("purchase-bills/", PurchaseBillAPIView.as_view()),
    path("purchase-bills/<int:bill_id>/", PurchaseBillDetailAPIView.as_view()),
    path("purchase-items/", PurchaseItemAPIView.as_view()),
    path("purchase-items/<int:item_id>/", PurchaseItemDetailAPIView.as_view()),
    path("purchase-bills/<int:bill_id>/confirm/", ConfirmPurchaseBillAPIView.as_view()),
    path("stock-adjustments/", StockAdjustmentAPIView.as_view()),
    path("stock-out/", StockOutAPIView.as_view()),
]
