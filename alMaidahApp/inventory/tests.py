from decimal import Decimal

from django.contrib.auth.models import User
from django.test import TestCase
from django.utils import timezone
from rest_framework.authtoken.models import Token
from rest_framework.test import APIClient

from .models import Inventory, Product, PurchaseBill, PurchaseItem, StockAdjustmentLog, StockOutLog
from .services import recalculate_purchase_bill_total


class InventoryAPITests(TestCase):
    def setUp(self):
        self.client = APIClient()
        user = User.objects.create_superuser(
            username="inventory-admin",
            password="testpass123",
            email="inventory-admin@example.com",
        )
        token = Token.objects.create(user=user)
        self.client.defaults["HTTP_AUTHORIZATION"] = f"Token {token.key}"
        self.product = Product.objects.create(name="Rice", unit="kg")
        self.other_product = Product.objects.create(name="Oil", unit="ltr")

    def create_draft_bill(self):
        return PurchaseBill.objects.create(
            supplier_name="Metro Supplier",
            bill_number="B-100",
            bill_date=timezone.now().date(),
        )

    def add_bill_item(self, bill, *, product=None, quantity="2.00", unit_price="100.00"):
        item = PurchaseItem.objects.create(
            bill=bill,
            product=product or self.product,
            quantity=Decimal(quantity),
            unit_price=Decimal(unit_price),
        )
        recalculate_purchase_bill_total(bill)
        return item

    def test_confirming_same_bill_twice_does_not_double_inventory(self):
        bill = self.create_draft_bill()
        self.add_bill_item(bill)

        first = self.client.post(f"/api/purchase-bills/{bill.id}/confirm/")
        second = self.client.post(f"/api/purchase-bills/{bill.id}/confirm/")

        inventory = Inventory.objects.get(product=self.product)
        bill.refresh_from_db()

        self.assertEqual(first.status_code, 200)
        self.assertEqual(second.status_code, 400)
        self.assertEqual(inventory.quantity, Decimal("2.00"))
        self.assertEqual(inventory.total_value, Decimal("200.00"))
        self.assertEqual(bill.status, "CONFIRMED")

    def test_insufficient_stock_out_does_not_create_log(self):
        Inventory.objects.create(
            product=self.product,
            quantity=Decimal("3.00"),
            total_value=Decimal("300.00"),
        )

        response = self.client.post(
            "/api/stock-out/",
            {
                "product_id": self.product.id,
                "quantity": "5.00",
                "reason": "Used in kitchen",
            },
            format="json",
        )

        inventory = Inventory.objects.get(product=self.product)

        self.assertEqual(response.status_code, 400)
        self.assertEqual(StockOutLog.objects.count(), 0)
        self.assertEqual(inventory.quantity, Decimal("3.00"))
        self.assertEqual(inventory.total_value, Decimal("300.00"))

    def test_missing_inventory_stock_out_returns_clean_error(self):
        response = self.client.post(
            "/api/stock-out/",
            {
                "product_id": self.product.id,
                "quantity": "1.00",
                "reason": "Used in kitchen",
            },
            format="json",
        )

        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.data["error"], "This item is not in inventory yet.")
        self.assertEqual(StockOutLog.objects.count(), 0)

    def test_invalid_purchase_item_reference_returns_400(self):
        bill = self.create_draft_bill()

        response = self.client.post(
            "/api/purchase-items/",
            {
                "bill_id": bill.id,
                "product_id": 999999,
                "quantity": "1.00",
                "unit_price": "50.00",
            },
            format="json",
        )

        self.assertEqual(response.status_code, 400)
        self.assertIn("product_id", response.data)
        self.assertEqual(PurchaseItem.objects.count(), 0)

    def test_missing_unit_price_uses_last_price_for_same_item(self):
        old_bill = self.create_draft_bill()
        self.add_bill_item(old_bill, quantity="1.00", unit_price="85.00")

        new_bill = self.create_draft_bill()

        response = self.client.post(
            "/api/purchase-items/",
            {
                "bill_id": new_bill.id,
                "product_id": self.product.id,
                "quantity": "2.00",
                "unit_price": None,
            },
            format="json",
        )

        self.assertEqual(response.status_code, 201)

        item = PurchaseItem.objects.get(bill=new_bill, product=self.product)
        new_bill.refresh_from_db()

        self.assertEqual(item.unit_price, Decimal("85.00"))
        self.assertEqual(item.line_total, Decimal("170.00"))
        self.assertEqual(new_bill.total_amount, Decimal("170.00"))

    def test_missing_unit_price_without_history_returns_clear_error(self):
        bill = self.create_draft_bill()

        response = self.client.post(
            "/api/purchase-items/",
            {
                "bill_id": bill.id,
                "product_id": self.product.id,
                "quantity": "2.00",
                "unit_price": None,
            },
            format="json",
        )

        self.assertEqual(response.status_code, 400)
        self.assertEqual(
            response.data["error"],
            "Enter unit_price because last price for the same item wasn't found.",
        )
        self.assertEqual(PurchaseItem.objects.count(), 0)

    def test_draft_bill_can_be_fetched_updated_and_resumed_with_items(self):
        bill = self.create_draft_bill()
        item = self.add_bill_item(bill, quantity="4.00", unit_price="25.00")

        list_response = self.client.get("/api/purchase-bills/?status=DRAFT")
        detail_response = self.client.get(f"/api/purchase-bills/{bill.id}/")
        patch_response = self.client.patch(
            f"/api/purchase-items/{item.id}/",
            {"quantity": "5.00", "unit_price": "20.00"},
            format="json",
        )

        bill.refresh_from_db()

        self.assertEqual(list_response.status_code, 200)
        self.assertEqual(detail_response.status_code, 200)
        self.assertEqual(patch_response.status_code, 200)
        self.assertEqual(len(list_response.data), 1)
        self.assertEqual(detail_response.data["items"][0]["product"]["name"], "Rice")
        self.assertEqual(bill.total_amount, Decimal("100.00"))

    def test_draft_bill_item_can_be_deleted_and_total_recalculated(self):
        bill = self.create_draft_bill()
        first_item = self.add_bill_item(bill, quantity="1.00", unit_price="10.00")
        self.add_bill_item(bill, product=self.other_product, quantity="2.00", unit_price="20.00")

        response = self.client.delete(f"/api/purchase-items/{first_item.id}/")

        bill.refresh_from_db()

        self.assertEqual(response.status_code, 204)
        self.assertEqual(bill.items.count(), 1)
        self.assertEqual(bill.total_amount, Decimal("40.00"))

    def test_low_stock_endpoint_returns_products_at_or_below_threshold(self):
        low_stock_product = Product.objects.create(
            name="Tea",
            unit="pc",
            low_stock_threshold=Decimal("5.00"),
        )
        no_stock_product = Product.objects.create(
            name="Sugar",
            unit="kg",
            low_stock_threshold=Decimal("2.00"),
        )
        Inventory.objects.create(
            product=low_stock_product,
            quantity=Decimal("3.00"),
            total_value=Decimal("150.00"),
        )
        Inventory.objects.create(
            product=self.product,
            quantity=Decimal("10.00"),
            total_value=Decimal("500.00"),
        )

        response = self.client.get("/api/inventory/low-stock/")

        self.assertEqual(response.status_code, 200)
        product_names = {row["product_name"] for row in response.data}
        self.assertIn("Tea", product_names)
        self.assertIn("Sugar", product_names)
        self.assertNotIn("Rice", product_names)

    def test_manual_stock_adjustment_updates_inventory_and_creates_log(self):
        Inventory.objects.create(
            product=self.product,
            quantity=Decimal("3.00"),
            total_value=Decimal("300.00"),
        )

        response = self.client.post(
            "/api/stock-adjustments/",
            {
                "product_id": self.product.id,
                "quantity_change": "-1.00",
                "reason": "Count correction",
            },
            format="json",
        )

        inventory = Inventory.objects.get(product=self.product)
        adjustment = StockAdjustmentLog.objects.get(product=self.product)

        self.assertEqual(response.status_code, 201)
        self.assertEqual(inventory.quantity, Decimal("2.00"))
        self.assertEqual(inventory.total_value, Decimal("200.00"))
        self.assertEqual(adjustment.adjustment_type, "DECREASE")
        self.assertEqual(adjustment.quantity_change, Decimal("-1.00"))

    def test_product_details_can_be_renamed_and_updated(self):
        response = self.client.patch(
            f"/api/products/{self.product.id}/",
            {
                "name": "Premium Rice",
                "unit": "bag",
                "low_stock_threshold": "5.00",
            },
            format="json",
        )

        self.assertEqual(response.status_code, 200)

        self.product.refresh_from_db()

        self.assertEqual(self.product.name, "Premium Rice")
        self.assertEqual(self.product.unit, "bag")
        self.assertEqual(self.product.low_stock_threshold, Decimal("5.00"))

    def test_unused_zero_stock_product_can_be_deleted_safely(self):
        Inventory.objects.create(
            product=self.product,
            quantity=Decimal("0.00"),
            total_value=Decimal("0.00"),
        )

        response = self.client.delete(f"/api/products/{self.product.id}/")

        self.assertEqual(response.status_code, 200)
        self.assertFalse(Product.objects.filter(id=self.product.id).exists())

    def test_product_with_purchase_history_cannot_be_deleted(self):
        bill = self.create_draft_bill()
        self.add_bill_item(bill)

        response = self.client.delete(f"/api/products/{self.product.id}/")

        self.assertEqual(response.status_code, 400)
        self.assertEqual(
            response.data["error"],
            "This item already has bill history, so it cannot be deleted safely.",
        )
        self.assertTrue(Product.objects.filter(id=self.product.id).exists())

    def test_product_with_live_stock_cannot_be_deleted(self):
        Inventory.objects.create(
            product=self.product,
            quantity=Decimal("3.00"),
            total_value=Decimal("150.00"),
        )

        response = self.client.delete(f"/api/products/{self.product.id}/")

        self.assertEqual(response.status_code, 400)
        self.assertEqual(
            response.data["error"],
            "This item still has live stock or value in inventory. Reduce it to zero first.",
        )
        self.assertTrue(Product.objects.filter(id=self.product.id).exists())

    def test_positive_adjustment_without_cost_requires_unit_cost_for_new_stock(self):
        response = self.client.post(
            "/api/stock-adjustments/",
            {
                "product_id": self.product.id,
                "quantity_change": "2.00",
                "reason": "Opening correction",
            },
            format="json",
        )

        self.assertEqual(response.status_code, 400)
        self.assertEqual(
            response.data["error"],
            "Unit cost is required when increasing stock without an existing average cost.",
        )
        self.assertEqual(StockAdjustmentLog.objects.count(), 0)

    def test_inventory_history_combines_stock_in_stock_out_and_adjustments(self):
        bill = self.create_draft_bill()
        self.add_bill_item(bill, quantity="2.00", unit_price="100.00")
        self.client.post(f"/api/purchase-bills/{bill.id}/confirm/")
        self.client.post(
            "/api/stock-out/",
            {
                "product_id": self.product.id,
                "quantity": "1.00",
                "reason": "Used in kitchen",
            },
            format="json",
        )
        self.client.post(
            "/api/stock-adjustments/",
            {
                "product_id": self.product.id,
                "quantity_change": "1.00",
                "unit_cost": "100.00",
                "reason": "Count correction",
            },
            format="json",
        )

        response = self.client.get("/api/inventory/history/")

        self.assertEqual(response.status_code, 200)
        entry_types = {row["entry_type"] for row in response.data["entries"]}
        self.assertIn("STOCK_IN", entry_types)
        self.assertIn("STOCK_OUT", entry_types)
        self.assertIn("ADJUSTMENT_INCREASE", entry_types)
        self.assertEqual(response.data["summary"]["stock_in_count"], 1)
        self.assertEqual(response.data["summary"]["stock_out_count"], 1)
        self.assertEqual(response.data["summary"]["adjustment_count"], 1)
