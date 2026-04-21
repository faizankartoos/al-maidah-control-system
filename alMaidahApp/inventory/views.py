from django.core.exceptions import ValidationError as DjangoValidationError
from django.db.models import Count
from django.shortcuts import get_object_or_404
from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import Inventory, Product, PurchaseBill, PurchaseItem, StockAdjustmentLog, StockOutLog
from .serializers import (
    InventorySerializer,
    ProductSerializer,
    PurchaseBillDetailSerializer,
    PurchaseBillSerializer,
    PurchaseBillUpdateSerializer,
    PurchaseItemSerializer,
    StockAdjustmentLogSerializer,
    StockOutLogSerializer,
)
from .services import (
    confirm_purchase_bill,
    create_stock_adjustment,
    create_stock_out,
    delete_purchase_bill,
    delete_purchase_item,
    get_inventory_history,
    list_low_stock_items,
)


def validation_error_response(exc):
    message = exc.messages[0] if getattr(exc, "messages", None) else str(exc)
    return Response({"error": message}, status=status.HTTP_400_BAD_REQUEST)


class ProductAPIView(APIView):
    def get(self, request):
        products = Product.objects.all()
        serializer = ProductSerializer(products, many=True)
        return Response(serializer.data)

    def post(self, request):
        serializer = ProductSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data, status=status.HTTP_201_CREATED)


class ProductDetailAPIView(APIView):
    def patch(self, request, product_id):
        product = get_object_or_404(Product, id=product_id)
        serializer = ProductSerializer(product, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data, status=status.HTTP_200_OK)

    def delete(self, request, product_id):
        product = get_object_or_404(Product, id=product_id)

        if PurchaseItem.objects.filter(product=product).exists():
            return Response(
                {"error": "This item already has bill history, so it cannot be deleted safely."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if StockOutLog.objects.filter(product=product).exists():
            return Response(
                {"error": "This item already has stock-out history, so it cannot be deleted safely."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if StockAdjustmentLog.objects.filter(product=product).exists():
            return Response(
                {"error": "This item already has adjustment history, so it cannot be deleted safely."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        inventory = getattr(product, "inventory", None)
        if inventory and (inventory.quantity > 0 or inventory.total_value > 0):
            return Response(
                {"error": "This item still has live stock or value in inventory. Reduce it to zero first."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        product_name = product.name
        product.delete()
        return Response(
            {"message": f"{product_name} deleted safely."},
            status=status.HTTP_200_OK,
        )


class InventoryAPIView(APIView):
    def get(self, request):
        inventory = Inventory.objects.select_related("product").all()
        serializer = InventorySerializer(inventory, many=True)
        return Response(serializer.data)


class LowStockAPIView(APIView):
    def get(self, request):
        return Response(list_low_stock_items())


class InventoryHistoryAPIView(APIView):
    def get(self, request):
        return Response(get_inventory_history(request.query_params))


class PurchaseBillAPIView(APIView):
    def get(self, request):
        bills = PurchaseBill.objects.annotate(item_count=Count("items"))
        status_filter = request.query_params.get("status")

        if status_filter:
            bills = bills.filter(status=status_filter.upper())

        serializer = PurchaseBillSerializer(bills, many=True)
        return Response(serializer.data)

    def post(self, request):
        serializer = PurchaseBillSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        bill = serializer.save()
        bill.item_count = 0
        return Response(
            PurchaseBillDetailSerializer(bill).data,
            status=status.HTTP_201_CREATED,
        )


class PurchaseBillDetailAPIView(APIView):
    def get_bill(self, bill_id):
        return PurchaseBill.objects.annotate(item_count=Count("items")).get(id=bill_id)

    def get(self, request, bill_id):
        try:
            bill = self.get_bill(bill_id)
        except PurchaseBill.DoesNotExist:
            return Response({"error": "Bill not found."}, status=status.HTTP_404_NOT_FOUND)

        serializer = PurchaseBillDetailSerializer(bill)
        return Response(serializer.data)

    def patch(self, request, bill_id):
        try:
            bill = PurchaseBill.objects.get(id=bill_id)
        except PurchaseBill.DoesNotExist:
            return Response({"error": "Bill not found."}, status=status.HTTP_404_NOT_FOUND)

        serializer = PurchaseBillUpdateSerializer(bill, data=request.data, partial=True)
        try:
            serializer.is_valid(raise_exception=True)
            bill = serializer.save()
        except DjangoValidationError as exc:
            return validation_error_response(exc)

        bill = self.get_bill(bill.id)
        return Response(PurchaseBillDetailSerializer(bill).data)

    def delete(self, request, bill_id):
        try:
            bill = PurchaseBill.objects.get(id=bill_id)
        except PurchaseBill.DoesNotExist:
            return Response({"error": "Bill not found."}, status=status.HTTP_404_NOT_FOUND)

        try:
            delete_purchase_bill(bill)
        except DjangoValidationError as exc:
            return validation_error_response(exc)

        return Response(status=status.HTTP_204_NO_CONTENT)


class PurchaseItemAPIView(APIView):
    def post(self, request):
        serializer = PurchaseItemSerializer(data=request.data)
        try:
            serializer.is_valid(raise_exception=True)
            item = serializer.save()
        except DjangoValidationError as exc:
            return validation_error_response(exc)

        return Response(
            PurchaseItemSerializer(item).data,
            status=status.HTTP_201_CREATED,
        )


class PurchaseItemDetailAPIView(APIView):
    def get_item(self, item_id):
        return PurchaseItem.objects.select_related("bill", "product").get(id=item_id)

    def patch(self, request, item_id):
        try:
            item = self.get_item(item_id)
        except PurchaseItem.DoesNotExist:
            return Response({"error": "Bill item not found."}, status=status.HTTP_404_NOT_FOUND)

        serializer = PurchaseItemSerializer(item, data=request.data, partial=True)
        try:
            serializer.is_valid(raise_exception=True)
            item = serializer.save()
        except DjangoValidationError as exc:
            return validation_error_response(exc)

        return Response(PurchaseItemSerializer(item).data)

    def delete(self, request, item_id):
        try:
            item = self.get_item(item_id)
        except PurchaseItem.DoesNotExist:
            return Response({"error": "Bill item not found."}, status=status.HTTP_404_NOT_FOUND)

        try:
            delete_purchase_item(item)
        except DjangoValidationError as exc:
            return validation_error_response(exc)

        return Response(status=status.HTTP_204_NO_CONTENT)


class ConfirmPurchaseBillAPIView(APIView):
    def post(self, request, bill_id):
        try:
            bill = PurchaseBill.objects.get(id=bill_id)
        except PurchaseBill.DoesNotExist:
            return Response({"error": "Bill not found."}, status=status.HTTP_404_NOT_FOUND)

        try:
            bill = confirm_purchase_bill(bill)
        except DjangoValidationError as exc:
            return validation_error_response(exc)

        bill.item_count = bill.items.count()

        return Response(
            {
                "message": "Bill confirmed and inventory updated.",
                "bill": PurchaseBillDetailSerializer(bill).data,
            }
        )


class StockOutAPIView(APIView):
    def get(self, request):
        logs = StockOutLog.objects.select_related("product")[:50]
        serializer = StockOutLogSerializer(logs, many=True)
        return Response(serializer.data)

    def post(self, request):
        serializer = StockOutLogSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        try:
            stock_out, inventory = create_stock_out(**serializer.validated_data)
        except DjangoValidationError as exc:
            return validation_error_response(exc)

        return Response(
            {
                "message": "Stock updated successfully.",
                "stock_out": StockOutLogSerializer(stock_out).data,
                "remaining_quantity": inventory.quantity,
            },
            status=status.HTTP_201_CREATED,
        )


class StockAdjustmentAPIView(APIView):
    def post(self, request):
        serializer = StockAdjustmentLogSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        try:
            adjustment, inventory = create_stock_adjustment(**serializer.validated_data)
        except DjangoValidationError as exc:
            return validation_error_response(exc)

        return Response(
            {
                "message": "Stock adjusted successfully.",
                "adjustment": StockAdjustmentLogSerializer(adjustment).data,
                "current_quantity": inventory.quantity,
            },
            status=status.HTTP_201_CREATED,
        )
