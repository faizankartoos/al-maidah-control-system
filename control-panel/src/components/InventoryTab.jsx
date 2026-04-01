import { useEffect, useMemo, useRef, useState } from "react";
import api from "../services/api";

const ACTIVE_BILL_KEY = "inventory_active_bill_id";
const STOCK_OUT_REASONS = [
  "Used in kitchen",
  "Damaged",
  "Expired",
  "Wastage",
  "Sample",
  "Other",
];

function getToday() {
  return new Date().toISOString().split("T")[0];
}

function emptyBillForm() {
  return {
    supplier_name: "",
    bill_number: "",
    bill_date: getToday(),
  };
}

function emptyItemForm() {
  return {
    product_id: "",
    quantity: "",
    unit_price: "",
  };
}

function emptyAlertForm() {
  return {
    product_id: "",
    low_stock_threshold: "",
  };
}

function emptyAdjustmentForm() {
  return {
    product_id: "",
    quantity_change: "",
    unit_cost: "",
    reason: "",
  };
}

function emptyStockOutForm() {
  return {
    product_id: "",
    quantity: "",
    reason: STOCK_OUT_REASONS[0],
    custom_reason: "",
  };
}

function emptyQuickAddStockForm() {
  return {
    open: false,
    product_id: "",
    product_name: "",
    unit: "",
    supplier_name: "",
    bill_number: "",
    bill_date: getToday(),
    quantity: "",
    unit_price: "",
  };
}

function emptyQuickStockOutForm() {
  return {
    open: false,
    product_id: "",
    product_name: "",
    unit: "",
    quantity: "",
    reason: STOCK_OUT_REASONS[0],
    custom_reason: "",
  };
}

function formatMoney(value) {
  const amount = Number(value || 0);
  return amount.toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatDate(value) {
  if (!value) return "-";
  return new Date(value).toLocaleDateString("en-GB");
}

function formatDateTime(value) {
  if (!value) return "-";
  return new Date(value).toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function extractError(err, fallback) {
  const data = err?.response?.data;

  if (!data) return fallback;
  if (typeof data.error === "string") return data.error;
  if (typeof data.detail === "string") return data.detail;

  const firstList = Object.values(data).find((value) => Array.isArray(value) && value.length);
  if (firstList) return firstList[0];

  return fallback;
}

export default function InventoryTab() {
  const [products, setProducts] = useState([]);
  const [inventory, setInventory] = useState([]);
  const [bills, setBills] = useState([]);
  const [stockOutLogs, setStockOutLogs] = useState([]);
  const [lowStockItems, setLowStockItems] = useState([]);
  const [historyData, setHistoryData] = useState({
    summary: {
      total_entries: 0,
      stock_in_count: 0,
      stock_out_count: 0,
      adjustment_count: 0,
    },
    entries: [],
  });
  const [activeBill, setActiveBill] = useState(null);
  const [editingItemId, setEditingItemId] = useState(null);
  const [inventorySearch, setInventorySearch] = useState("");

  const [productName, setProductName] = useState("");
  const [productUnit, setProductUnit] = useState("");
  const [productLowStockThreshold, setProductLowStockThreshold] = useState("");
  const [billForm, setBillForm] = useState(emptyBillForm);
  const [itemForm, setItemForm] = useState(emptyItemForm);
  const [alertForm, setAlertForm] = useState(emptyAlertForm);
  const [adjustmentForm, setAdjustmentForm] = useState(emptyAdjustmentForm);
  const [stockOutForm, setStockOutForm] = useState(emptyStockOutForm);
  const [quickAddStockForm, setQuickAddStockForm] = useState(emptyQuickAddStockForm);
  const [quickStockOutForm, setQuickStockOutForm] = useState(emptyQuickStockOutForm);

  const [loading, setLoading] = useState(true);
  const [busyAction, setBusyAction] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const draftBills = useMemo(
    () => bills.filter((bill) => bill.status === "DRAFT"),
    [bills]
  );

  const recentConfirmedBills = useMemo(
    () => bills.filter((bill) => bill.status === "CONFIRMED").slice(0, 5),
    [bills]
  );

  const filteredInventory = useMemo(() => {
    const search = inventorySearch.trim().toLowerCase();
    if (!search) return inventory;

    return inventory.filter((item) =>
      item.product_name.toLowerCase().includes(search)
    );
  }, [inventory, inventorySearch]);

  const totalInventoryValue = useMemo(
    () => inventory.reduce((sum, item) => sum + Number(item.total_value || 0), 0),
    [inventory]
  );

  const inStockCount = useMemo(
    () => inventory.filter((item) => Number(item.quantity) > 0).length,
    [inventory]
  );

  const activeBillItemCount = activeBill?.items?.length || 0;
  const lowStockCount = lowStockItems.length;
  const historyEntries = historyData.entries || [];
  const historySummary = historyData.summary || {
    total_entries: 0,
    stock_in_count: 0,
    stock_out_count: 0,
    adjustment_count: 0,
  };

  const inventoryByProductId = useMemo(
    () => new Map(inventory.map((item) => [String(item.product), item])),
    [inventory]
  );

  const selectedAdjustmentInventory = adjustmentForm.product_id
    ? inventoryByProductId.get(adjustmentForm.product_id)
    : null;

  useEffect(() => {
    loadDashboard();
  }, []);

  const resetMessages = () => {
    setError("");
    setSuccess("");
  };

  const setStoredActiveBill = (billId) => {
    if (billId) {
      localStorage.setItem(ACTIVE_BILL_KEY, String(billId));
      return;
    }
    localStorage.removeItem(ACTIVE_BILL_KEY);
  };

  const fetchProducts = async () => {
    const res = await api.get("/products/");
    setProducts(res.data);
    return res.data;
  };

  const fetchInventory = async () => {
    const res = await api.get("/inventory/");
    setInventory(res.data);
    return res.data;
  };

  const fetchBills = async () => {
    const res = await api.get("/purchase-bills/");
    setBills(res.data);
    return res.data;
  };

  const fetchStockOutLogs = async () => {
    const res = await api.get("/stock-out/");
    setStockOutLogs(res.data);
    return res.data;
  };

  const fetchLowStockItems = async () => {
    const res = await api.get("/inventory/low-stock/");
    setLowStockItems(res.data);
    return res.data;
  };

  const fetchHistory = async () => {
    const res = await api.get("/inventory/history/");
    setHistoryData(res.data);
    return res.data;
  };

  const resetDraftState = () => {
    setActiveBill(null);
    setEditingItemId(null);
    setItemForm(emptyItemForm());
    setBillForm(emptyBillForm());
    setStoredActiveBill(null);
  };

  const loadBillDetail = async (billId) => {
    const res = await api.get(`/purchase-bills/${billId}/`);
    setActiveBill(res.data);
    setBillForm({
      supplier_name: res.data.supplier_name || "",
      bill_number: res.data.bill_number || "",
      bill_date: res.data.bill_date || getToday(),
    });
    setEditingItemId(null);
    setItemForm(emptyItemForm());
    setStoredActiveBill(res.data.id);
    return res.data;
  };

  const maybeResumeDraft = async (billList) => {
    const drafts = billList.filter((bill) => bill.status === "DRAFT");
    if (!drafts.length) {
      resetDraftState();
      return;
    }

    const storedBillId = localStorage.getItem(ACTIVE_BILL_KEY);
    const preferredDraft =
      drafts.find((bill) => String(bill.id) === storedBillId) || drafts[0];

    await loadBillDetail(preferredDraft.id);
  };

  const loadDashboard = async () => {
    try {
      setLoading(true);
      resetMessages();

      const [billList] = await Promise.all([
        fetchBills(),
        fetchProducts(),
        fetchInventory(),
        fetchStockOutLogs(),
        fetchLowStockItems(),
        fetchHistory(),
      ]);

      await maybeResumeDraft(billList);
    } catch {
      setError("Failed to load inventory dashboard.");
    } finally {
      setLoading(false);
    }
  };

  const refreshBillCollections = async ({ keepActiveBill = true } = {}) => {
    const billList = await fetchBills();

    if (!keepActiveBill) {
      resetDraftState();
      return billList;
    }

    if (activeBill?.id) {
      const stillOpen = billList.find(
        (bill) => bill.id === activeBill.id && bill.status === "DRAFT"
      );

      if (stillOpen) {
        await loadBillDetail(stillOpen.id);
        return billList;
      }
    }

    await maybeResumeDraft(billList);
    return billList;
  };

  const handleCreateProduct = async () => {
    resetMessages();

    if (!productName.trim() || !productUnit.trim()) {
      setError("Enter both item name and unit.");
      return;
    }

    try {
      setBusyAction("create-product");
      const res = await api.post("/products/", {
        name: productName.trim(),
        unit: productUnit.trim(),
        low_stock_threshold: productLowStockThreshold || "0",
      });

      setProductName("");
      setProductUnit("");
      setProductLowStockThreshold("");
      await Promise.all([fetchProducts(), fetchLowStockItems()]);
      setSuccess(`${res.data.name} created successfully.`);
    } catch (err) {
      setError(extractError(err, "Failed to create item."));
    } finally {
      setBusyAction("");
    }
  };

  const handleCreateDraftBill = async () => {
    resetMessages();

    if (!billForm.supplier_name.trim() || !billForm.bill_date) {
      setError("Enter supplier name and bill date first.");
      return;
    }

    try {
      setBusyAction("create-draft");
      const res = await api.post("/purchase-bills/", {
        supplier_name: billForm.supplier_name.trim(),
        bill_number: billForm.bill_number.trim() || null,
        bill_date: billForm.bill_date,
      });

      setActiveBill(res.data);
      setStoredActiveBill(res.data.id);
      await fetchBills();
      setSuccess("Draft bill created. Add items below.");
    } catch (err) {
      setError(extractError(err, "Failed to create draft bill."));
    } finally {
      setBusyAction("");
    }
  };

  const handleSaveBillDetails = async () => {
    resetMessages();

    if (!activeBill) {
      setError("Create or resume a draft bill first.");
      return;
    }

    if (!billForm.supplier_name.trim() || !billForm.bill_date) {
      setError("Supplier name and bill date are required.");
      return;
    }

    try {
      setBusyAction("save-bill");
      const res = await api.patch(`/purchase-bills/${activeBill.id}/`, {
        supplier_name: billForm.supplier_name.trim(),
        bill_number: billForm.bill_number.trim() || null,
        bill_date: billForm.bill_date,
      });

      setActiveBill(res.data);
      await fetchBills();
      setSuccess("Draft bill details updated.");
    } catch (err) {
      setError(extractError(err, "Failed to update draft bill."));
    } finally {
      setBusyAction("");
    }
  };

  const handleResumeDraft = async (billId) => {
    resetMessages();

    try {
      setBusyAction(`resume-${billId}`);
      await loadBillDetail(billId);
      setSuccess(`Draft bill #${billId} loaded.`);
    } catch {
      setError("Failed to load the selected draft bill.");
    } finally {
      setBusyAction("");
    }
  };

  const handleDeleteDraft = async (billId) => {
    resetMessages();

    if (!window.confirm("Delete this draft bill?")) {
      return;
    }

    try {
      setBusyAction(`delete-bill-${billId}`);
      await api.delete(`/purchase-bills/${billId}/`);
      await refreshBillCollections();
      setSuccess(`Draft bill #${billId} deleted.`);
    } catch (err) {
      setError(extractError(err, "Failed to delete draft bill."));
    } finally {
      setBusyAction("");
    }
  };

  const handleAddOrUpdateItem = async () => {
    resetMessages();

    if (!activeBill) {
      setError("Create or resume a draft bill first.");
      return;
    }

    if (!itemForm.product_id || !itemForm.quantity || !itemForm.unit_price) {
      setError("Choose item, quantity, and unit price.");
      return;
    }

    const payload = {
      bill_id: activeBill.id,
      product_id: itemForm.product_id,
      quantity: itemForm.quantity,
      unit_price: itemForm.unit_price,
    };

    try {
      setBusyAction(editingItemId ? "update-item" : "add-item");

      if (editingItemId) {
        await api.patch(`/purchase-items/${editingItemId}/`, payload);
      } else {
        await api.post("/purchase-items/", payload);
      }

      await loadBillDetail(activeBill.id);
      await fetchBills();
      setItemForm(emptyItemForm());
      setEditingItemId(null);
      setSuccess(editingItemId ? "Draft item updated." : "Item added to draft bill.");
    } catch (err) {
      setError(
        extractError(
          err,
          editingItemId ? "Failed to update draft item." : "Failed to add item."
        )
      );
    } finally {
      setBusyAction("");
    }
  };

  const handleEditItem = (item) => {
    setEditingItemId(item.id);
    setItemForm({
      product_id: String(item.product.id),
      quantity: item.quantity,
      unit_price: item.unit_price,
    });
    setSuccess("");
    setError("");
  };

  const handleDeleteItem = async (itemId) => {
    resetMessages();

    if (!window.confirm("Remove this item from the draft bill?")) {
      return;
    }

    try {
      setBusyAction(`delete-item-${itemId}`);
      await api.delete(`/purchase-items/${itemId}/`);
      await loadBillDetail(activeBill.id);
      await fetchBills();

      if (editingItemId === itemId) {
        setEditingItemId(null);
        setItemForm(emptyItemForm());
      }

      setSuccess("Draft item removed.");
    } catch (err) {
      setError(extractError(err, "Failed to remove draft item."));
    } finally {
      setBusyAction("");
    }
  };

  const handleConfirmBill = async () => {
    resetMessages();

    if (!activeBill) {
      setError("Create or resume a draft bill first.");
      return;
    }

    try {
      setBusyAction("confirm-bill");
      await api.post(`/purchase-bills/${activeBill.id}/confirm/`);
      await Promise.all([
        fetchInventory(),
        fetchStockOutLogs(),
        fetchLowStockItems(),
        fetchHistory(),
      ]);
      await refreshBillCollections();
      setSuccess("Bill confirmed and stock added to inventory.");
    } catch (err) {
      setError(extractError(err, "Failed to confirm bill."));
    } finally {
      setBusyAction("");
    }
  };

  const handleStockOut = async () => {
    resetMessages();

    if (!stockOutForm.product_id || !stockOutForm.quantity) {
      setError("Choose item and quantity for stock out.");
      return;
    }

    const reason =
      stockOutForm.reason === "Other"
        ? stockOutForm.custom_reason.trim()
        : stockOutForm.reason;

    if (!reason) {
      setError("Enter a reason for this stock out.");
      return;
    }

    try {
      setBusyAction("stock-out");
      const res = await api.post("/stock-out/", {
        product_id: stockOutForm.product_id,
        quantity: stockOutForm.quantity,
        reason,
      });

      setStockOutForm(emptyStockOutForm());
      await Promise.all([
        fetchInventory(),
        fetchStockOutLogs(),
        fetchLowStockItems(),
        fetchHistory(),
      ]);
      setSuccess(
        `${res.data.stock_out.product.name} stock updated. Remaining: ${res.data.remaining_quantity}`
      );
    } catch (err) {
      setError(extractError(err, "Stock out failed."));
    } finally {
      setBusyAction("");
    }
  };

  const openQuickAddStockModal = (inventoryItem) => {
    setQuickAddStockForm({
      open: true,
      product_id: String(inventoryItem.product),
      product_name: inventoryItem.product_name,
      unit: inventoryItem.unit,
      supplier_name: "",
      bill_number: "",
      bill_date: getToday(),
      quantity: "",
      unit_price: "",
    });
  };

  const openQuickStockOutModal = (inventoryItem) => {
    setQuickStockOutForm({
      open: true,
      product_id: String(inventoryItem.product),
      product_name: inventoryItem.product_name,
      unit: inventoryItem.unit,
      quantity: "",
      reason: STOCK_OUT_REASONS[0],
      custom_reason: "",
    });
  };

  const closeQuickAddStockModal = () => {
    setQuickAddStockForm(emptyQuickAddStockForm());
  };

  const closeQuickStockOutModal = () => {
    setQuickStockOutForm(emptyQuickStockOutForm());
  };

  const handleQuickAddStock = async () => {
    resetMessages();

    if (
      !quickAddStockForm.product_id ||
      !quickAddStockForm.supplier_name.trim() ||
      !quickAddStockForm.bill_date ||
      !quickAddStockForm.quantity ||
      !quickAddStockForm.unit_price
    ) {
      setError("Enter supplier, bill date, quantity, and unit price.");
      return;
    }

    const productName = quickAddStockForm.product_name;

    try {
      setBusyAction("quick-add-stock");

      const billRes = await api.post("/purchase-bills/", {
        supplier_name: quickAddStockForm.supplier_name.trim(),
        bill_number: quickAddStockForm.bill_number.trim() || null,
        bill_date: quickAddStockForm.bill_date,
      });

      const createdBill = billRes.data;

      try {
        await api.post("/purchase-items/", {
          bill_id: createdBill.id,
          product_id: quickAddStockForm.product_id,
          quantity: quickAddStockForm.quantity,
          unit_price: quickAddStockForm.unit_price,
        });
      } catch (err) {
        await loadBillDetail(createdBill.id);
        await fetchBills();
        closeQuickAddStockModal();
        setError(
          extractError(
            err,
            `Draft bill #${createdBill.id} was created, but the item could not be added.`
          )
        );
        return;
      }

      await loadBillDetail(createdBill.id);
      await fetchBills();
      closeQuickAddStockModal();
      document.getElementById("inventory-workspace")?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
      setSuccess(`Draft bill #${createdBill.id} created for ${productName}.`);
    } catch (err) {
      setError(extractError(err, "Failed to create a new stock bill."));
    } finally {
      setBusyAction("");
    }
  };

  const handleQuickStockOut = async () => {
    resetMessages();

    if (!quickStockOutForm.product_id || !quickStockOutForm.quantity) {
      setError("Choose item and quantity for stock out.");
      return;
    }

    const reason =
      quickStockOutForm.reason === "Other"
        ? quickStockOutForm.custom_reason.trim()
        : quickStockOutForm.reason;

    if (!reason) {
      setError("Enter a reason for this stock out.");
      return;
    }

    try {
      setBusyAction("quick-stock-out");
      const res = await api.post("/stock-out/", {
        product_id: quickStockOutForm.product_id,
        quantity: quickStockOutForm.quantity,
        reason,
      });

      await Promise.all([
        fetchInventory(),
        fetchStockOutLogs(),
        fetchLowStockItems(),
        fetchHistory(),
      ]);
      closeQuickStockOutModal();
      setSuccess(
        `${res.data.stock_out.product.name} stock updated. Remaining: ${res.data.remaining_quantity}`
      );
    } catch (err) {
      setError(extractError(err, "Stock out failed."));
    } finally {
      setBusyAction("");
    }
  };

  const handleAlertProductChange = (productId) => {
    const product = products.find((item) => String(item.id) === String(productId));
    setAlertForm({
      product_id: productId,
      low_stock_threshold: product ? String(product.low_stock_threshold ?? "0") : "",
    });
  };

  const scrollToSection = (sectionId) => {
    document.getElementById(sectionId)?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  };

  const focusAlertEditor = (productId) => {
    handleAlertProductChange(String(productId));
    scrollToSection("inventory-alerts");
  };

  const focusAdjustmentForm = (productId) => {
    setAdjustmentForm((current) => ({
      ...current,
      product_id: String(productId),
    }));
    scrollToSection("inventory-adjustments");
  };

  const handleSaveAlertThreshold = async () => {
    resetMessages();

    if (!alertForm.product_id) {
      setError("Choose an item to set its low-stock alert.");
      return;
    }

    const thresholdValue = alertForm.low_stock_threshold === "" ? "0" : alertForm.low_stock_threshold;

    if (Number(thresholdValue) < 0) {
      setError("Low-stock alert must be zero or higher.");
      return;
    }

    try {
      setBusyAction("save-alert-threshold");
      const res = await api.patch(`/products/${alertForm.product_id}/`, {
        low_stock_threshold: thresholdValue,
      });

      setAlertForm({
        product_id: String(res.data.id),
        low_stock_threshold: String(res.data.low_stock_threshold ?? "0"),
      });
      await Promise.all([fetchProducts(), fetchInventory(), fetchLowStockItems()]);
      setSuccess(`${res.data.name} low-stock alert saved.`);
    } catch (err) {
      setError(extractError(err, "Failed to save the low-stock alert."));
    } finally {
      setBusyAction("");
    }
  };

  const handleManualAdjustment = async () => {
    resetMessages();

    if (!adjustmentForm.product_id || !adjustmentForm.quantity_change || !adjustmentForm.reason.trim()) {
      setError("Choose an item, enter the quantity change, and write a reason.");
      return;
    }

    if (Number(adjustmentForm.quantity_change) === 0) {
      setError("Adjustment quantity cannot be zero.");
      return;
    }

    try {
      setBusyAction("manual-adjustment");
      const res = await api.post("/stock-adjustments/", {
        product_id: adjustmentForm.product_id,
        quantity_change: adjustmentForm.quantity_change,
        unit_cost: adjustmentForm.unit_cost || null,
        reason: adjustmentForm.reason.trim(),
      });

      setAdjustmentForm(emptyAdjustmentForm());
      await Promise.all([fetchInventory(), fetchLowStockItems(), fetchHistory()]);
      setSuccess(
        `${res.data.adjustment.product.name} adjusted successfully. Current stock: ${res.data.current_quantity}`
      );
    } catch (err) {
      setError(extractError(err, "Manual adjustment failed."));
    } finally {
      setBusyAction("");
    }
  };

  if (loading) {
    return <div className="text-gray-300">Loading inventory dashboard...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
        <div>
          <h2 className="text-2xl font-semibold text-white">Inventory Management</h2>
          <p className="text-sm text-gray-400">
            Keep stock simple: create items, build draft bills, confirm stock in, and record stock out.
          </p>
        </div>
        <div className="text-sm text-gray-400">
          Open drafts: <span className="font-semibold text-white">{draftBills.length}</span>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <SummaryCard label="Tracked Items" value={products.length} accent="blue" />
        <SummaryCard label="Items In Stock" value={inStockCount} accent="emerald" />
        <SummaryCard label="Inventory Value" value={`Rs ${formatMoney(totalInventoryValue)}`} accent="amber" />
        <SummaryCard label="Low Stock Alerts" value={lowStockCount} accent="rose" />
        <SummaryCard label="Active Draft Items" value={activeBillItemCount} accent="slate" />
      </div>

      {error && <Alert tone="error">{error}</Alert>}
      {success && <Alert tone="success">{success}</Alert>}

      <div className="grid gap-6 xl:grid-cols-[1.1fr,1.4fr]">
        <Section
          title="Create New Item"
          description="Add a raw inventory item once. You can also set the low-stock warning level right away."
        >
          <div className="grid gap-4 md:grid-cols-3">
            <Field
              label="Item Name"
              value={productName}
              onChange={setProductName}
              placeholder="Example: Basmati Rice"
            />
            <Field
              label="Unit"
              value={productUnit}
              onChange={setProductUnit}
              placeholder="kg, pc, ltr"
            />
            <Field
              label="Low-Stock Alert At"
              value={productLowStockThreshold}
              onChange={setProductLowStockThreshold}
              type="number"
              placeholder="0.00"
            />
          </div>
          <InfoNote>
            Warning appears when live stock becomes equal to or lower than this alert quantity. Use
            `0` if you do not want alerts for this item.
          </InfoNote>
          <ActionButton
            onClick={handleCreateProduct}
            busy={busyAction === "create-product"}
          >
            Create Item
          </ActionButton>
        </Section>

        <Section
          title="Quick Stock Out"
          description="Log outgoing stock and reduce the live inventory at the same time."
        >
          <div className="grid gap-4 md:grid-cols-2">
            <SelectField
              label="Item"
              value={stockOutForm.product_id}
              onChange={(value) =>
                setStockOutForm((current) => ({ ...current, product_id: value }))
              }
              options={products.map((product) => ({
                value: String(product.id),
                label: `${product.name} (${product.unit})`,
              }))}
              placeholder="Select item"
            />
            <Field
              label="Quantity"
              value={stockOutForm.quantity}
              onChange={(value) =>
                setStockOutForm((current) => ({ ...current, quantity: value }))
              }
              type="number"
              placeholder="0.00"
            />
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <SelectField
              label="Reason"
              value={stockOutForm.reason}
              onChange={(value) =>
                setStockOutForm((current) => ({ ...current, reason: value }))
              }
              options={STOCK_OUT_REASONS.map((reason) => ({
                value: reason,
                label: reason,
              }))}
            />
            {stockOutForm.reason === "Other" ? (
              <Field
                label="Custom Reason"
                value={stockOutForm.custom_reason}
                onChange={(value) =>
                  setStockOutForm((current) => ({ ...current, custom_reason: value }))
                }
                placeholder="Write the reason"
              />
            ) : (
              <ReadOnlyHint label="Selected Reason" value={stockOutForm.reason} />
            )}
          </div>
          <ActionButton
            onClick={handleStockOut}
            tone="danger"
            busy={busyAction === "stock-out"}
          >
            Apply Stock Out
          </ActionButton>
        </Section>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.1fr,1fr]">
        <Section
          id="inventory-alerts"
          title="Low Stock Alerts"
          description="Warnings appear when current stock is less than or equal to the alert quantity set for that item."
        >
          <InfoNote>
            Example: if you set rice alert to `5 kg`, it will show here as soon as live stock reaches
            `5 kg` or below.
          </InfoNote>

          <div className="mt-4 grid gap-4 xl:grid-cols-[1.15fr,0.9fr]">
            <div>
              <h4 className="text-sm font-semibold uppercase tracking-[0.18em] text-gray-400">
                Active Warnings
              </h4>
              <div className="mt-3 space-y-3">
                {lowStockItems.length ? (
                  lowStockItems.map((item) => (
                    <div
                      key={item.product_id}
                      className="rounded-2xl border border-amber-500/20 bg-amber-500/10 p-4"
                    >
                      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                        <div>
                          <p className="font-medium text-white">{item.product_name}</p>
                          <p className="text-sm text-amber-100/80">
                            Current stock: {item.quantity} {item.unit}
                          </p>
                          <p className="mt-1 text-xs text-amber-100/70">
                            Alert at {item.low_stock_threshold} {item.unit}
                          </p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <SmallButton
                            onClick={() => focusAlertEditor(item.product_id)}
                            tone="secondary"
                          >
                            Edit Alert
                          </SmallButton>
                          <SmallButton
                            onClick={() => focusAdjustmentForm(item.product_id)}
                          >
                            Adjust Stock
                          </SmallButton>
                        </div>
                      </div>
                    </div>
                  ))
                ) : (
                  <EmptyState text="No low-stock warnings right now." />
                )}
              </div>
            </div>

            <div className="rounded-2xl border border-gray-800 bg-gray-950/60 p-4">
              <h4 className="text-sm font-semibold uppercase tracking-[0.18em] text-gray-400">
                Alert Settings
              </h4>
              <div className="mt-4 grid gap-4">
                <SelectField
                  label="Item"
                  value={alertForm.product_id}
                  onChange={handleAlertProductChange}
                  options={products.map((product) => ({
                    value: String(product.id),
                    label: `${product.name} (${product.unit})`,
                  }))}
                  placeholder="Choose item"
                />
                <Field
                  label="Warn At Quantity"
                  value={alertForm.low_stock_threshold}
                  onChange={(value) =>
                    setAlertForm((current) => ({
                      ...current,
                      low_stock_threshold: value,
                    }))
                  }
                  type="number"
                  placeholder="0.00"
                />
                <ActionButton
                  onClick={handleSaveAlertThreshold}
                  busy={busyAction === "save-alert-threshold"}
                >
                  Save Alert Level
                </ActionButton>
              </div>
            </div>
          </div>
        </Section>

        <Section
          id="inventory-adjustments"
          title="Manual Stock Adjustment"
          description="Use this only for correction cases like count mismatch, damaged stock not logged earlier, or opening balance fixes."
        >
          <div className="grid gap-4 md:grid-cols-2">
            <SelectField
              label="Item"
              value={adjustmentForm.product_id}
              onChange={(value) =>
                setAdjustmentForm((current) => ({ ...current, product_id: value }))
              }
              options={products.map((product) => ({
                value: String(product.id),
                label: `${product.name} (${product.unit})`,
              }))}
              placeholder="Choose item"
            />
            <Field
              label="Quantity Change"
              value={adjustmentForm.quantity_change}
              onChange={(value) =>
                setAdjustmentForm((current) => ({ ...current, quantity_change: value }))
              }
              type="number"
              placeholder="+2.00 or -1.00"
            />
          </div>

          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <Field
              label="Unit Cost (Optional)"
              value={adjustmentForm.unit_cost}
              onChange={(value) =>
                setAdjustmentForm((current) => ({ ...current, unit_cost: value }))
              }
              type="number"
              placeholder="Needed when adding stock without existing cost"
            />
            <Field
              label="Reason"
              value={adjustmentForm.reason}
              onChange={(value) =>
                setAdjustmentForm((current) => ({ ...current, reason: value }))
              }
              placeholder="Example: Physical count correction"
            />
          </div>

          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <ReadOnlyHint
              label="Current Stock"
              value={
                selectedAdjustmentInventory
                  ? `${selectedAdjustmentInventory.quantity} ${selectedAdjustmentInventory.unit}`
                  : "0.00"
              }
            />
            <ReadOnlyHint
              label="Current Avg Cost"
              value={
                selectedAdjustmentInventory
                  ? `Rs ${formatMoney(selectedAdjustmentInventory.average_unit_cost)}`
                  : "Rs 0.00"
              }
            />
          </div>

          <InfoNote>
            Use a positive number to add missing stock found during counting, and a negative number to
            remove excess stock from the record.
          </InfoNote>

          <div className="mt-4">
            <ActionButton
              onClick={handleManualAdjustment}
              busy={busyAction === "manual-adjustment"}
            >
              Apply Manual Adjustment
            </ActionButton>
          </div>
        </Section>
      </div>

      <Section
        id="inventory-workspace"
        title="Stock Entry Workspace"
        description="Purchase bills stay in the system for history, but day-to-day use stays simple for staff."
      >
        <div className="grid gap-6 xl:grid-cols-[1fr,1.45fr]">
          <div className="space-y-4">
            <div className="rounded-2xl border border-blue-500/20 bg-blue-950/20 p-4">
              <div className="mb-3 flex items-center justify-between">
                <div>
                  <h4 className="font-semibold text-white">
                    {activeBill ? `Draft Bill #${activeBill.id}` : "Start Draft Bill"}
                  </h4>
                  <p className="text-sm text-gray-400">
                    {activeBill
                      ? "Update bill details, add items, then confirm."
                      : "Create a draft once and keep adding items until the bill is complete."}
                  </p>
                </div>
                {activeBill && (
                  <span className="rounded-full bg-emerald-500/15 px-3 py-1 text-xs font-medium text-emerald-300">
                    {activeBill.status}
                  </span>
                )}
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <Field
                  label="Supplier Name"
                  value={billForm.supplier_name}
                  onChange={(value) =>
                    setBillForm((current) => ({ ...current, supplier_name: value }))
                  }
                  placeholder="Supplier"
                />
                <Field
                  label="Bill Number"
                  value={billForm.bill_number}
                  onChange={(value) =>
                    setBillForm((current) => ({ ...current, bill_number: value }))
                  }
                  placeholder="Optional"
                />
              </div>

              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <DateField
                  label="Bill Date"
                  value={billForm.bill_date}
                  onChange={(value) =>
                    setBillForm((current) => ({ ...current, bill_date: value }))
                  }
                  type="date"
                />
                <ReadOnlyHint
                  label="Draft Total"
                  value={activeBill ? `Rs ${formatMoney(activeBill.total_amount)}` : "Rs 0.00"}
                />
              </div>

              <div className="mt-4 flex flex-col gap-3 md:flex-row">
                {!activeBill ? (
                  <ActionButton
                    onClick={handleCreateDraftBill}
                    busy={busyAction === "create-draft"}
                  >
                    Create Draft Bill
                  </ActionButton>
                ) : (
                  <>
                    <ActionButton
                      onClick={handleSaveBillDetails}
                      busy={busyAction === "save-bill"}
                    >
                      Save Bill Details
                    </ActionButton>
                    <ActionButton
                      onClick={() => handleDeleteDraft(activeBill.id)}
                      tone="danger"
                      busy={busyAction === `delete-bill-${activeBill.id}`}
                    >
                      Delete Draft
                    </ActionButton>
                  </>
                )}
              </div>
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <MiniPanel title="Open Draft Bills">
                {draftBills.length ? (
                  <div className="space-y-3">
                    {draftBills.map((bill) => (
                      <div
                        key={bill.id}
                        className={`rounded-xl border p-3 ${
                          activeBill?.id === bill.id
                            ? "border-blue-500 bg-blue-500/10"
                            : "border-gray-800 bg-gray-950/60"
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="font-medium text-white">Bill #{bill.id}</p>
                            <p className="text-xs text-gray-400">
                              {bill.supplier_name || "No supplier"} • {formatDate(bill.bill_date)}
                            </p>
                          </div>
                          <span className="text-sm text-amber-300">
                            Rs {formatMoney(bill.total_amount)}
                          </span>
                        </div>
                        <p className="mt-2 text-xs text-gray-500">
                          {bill.item_count || 0} item(s)
                        </p>
                        <div className="mt-3 flex gap-2">
                          <SmallButton
                            onClick={() => handleResumeDraft(bill.id)}
                            busy={busyAction === `resume-${bill.id}`}
                          >
                            Resume
                          </SmallButton>
                          <SmallButton
                            onClick={() => handleDeleteDraft(bill.id)}
                            tone="danger"
                            busy={busyAction === `delete-bill-${bill.id}`}
                          >
                            Delete
                          </SmallButton>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <EmptyState text="No draft bills right now." />
                )}
              </MiniPanel>

              <MiniPanel title="Recent Confirmed Bills">
                {recentConfirmedBills.length ? (
                  <div className="space-y-3">
                    {recentConfirmedBills.map((bill) => (
                      <div
                        key={bill.id}
                        className="rounded-xl border border-gray-800 bg-gray-950/60 p-3"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <p className="font-medium text-white">Bill #{bill.id}</p>
                            <p className="text-xs text-gray-400">
                              {bill.supplier_name} • {formatDate(bill.bill_date)}
                            </p>
                          </div>
                          <span className="rounded-full bg-emerald-500/15 px-2 py-1 text-xs text-emerald-300">
                            Confirmed
                          </span>
                        </div>
                        <div className="mt-3 flex items-center justify-between text-xs text-gray-400">
                          <span>Total</span>
                          <span>Rs {formatMoney(bill.total_amount)}</span>
                        </div>
                        <div className="mt-1 flex items-center justify-between text-xs text-gray-500">
                          <span>Confirmed</span>
                          <span>{formatDateTime(bill.confirmed_at)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <EmptyState text="No confirmed bills yet." />
                )}
              </MiniPanel>
            </div>
          </div>

          <div className="rounded-2xl border border-gray-800 bg-gray-950/50 p-4">
            <div className="mb-4 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
              <div>
                <h4 className="font-semibold text-white">Draft Items</h4>
                <p className="text-sm text-gray-400">
                  Review, edit, or remove line items before confirming the bill.
                </p>
              </div>
              {activeBill && (
                <ActionButton
                  onClick={handleConfirmBill}
                  tone="success"
                  busy={busyAction === "confirm-bill"}
                >
                  Confirm Bill
                </ActionButton>
              )}
            </div>

            {activeBill ? (
              <>
                <div className="rounded-2xl border border-gray-800 bg-gray-900/60 p-4">
                  <div className="grid gap-4 md:grid-cols-3">
                    <SelectField
                      label="Item"
                      value={itemForm.product_id}
                      onChange={(value) =>
                        setItemForm((current) => ({ ...current, product_id: value }))
                      }
                      options={products.map((product) => ({
                        value: String(product.id),
                        label: `${product.name} (${product.unit})`,
                      }))}
                      placeholder="Choose item"
                    />
                    <Field
                      label="Quantity"
                      value={itemForm.quantity}
                      onChange={(value) =>
                        setItemForm((current) => ({ ...current, quantity: value }))
                      }
                      type="number"
                      placeholder="0.00"
                    />
                    <Field
                      label="Unit Price"
                      value={itemForm.unit_price}
                      onChange={(value) =>
                        setItemForm((current) => ({ ...current, unit_price: value }))
                      }
                      type="number"
                      placeholder="0.00"
                    />
                  </div>
                  <div className="mt-4 flex flex-col gap-3 md:flex-row">
                    <ActionButton
                      onClick={handleAddOrUpdateItem}
                      busy={busyAction === "add-item" || busyAction === "update-item"}
                    >
                      {editingItemId ? "Update Item" : "Add Item"}
                    </ActionButton>
                    {editingItemId && (
                      <ActionButton
                        onClick={() => {
                          setEditingItemId(null);
                          setItemForm(emptyItemForm());
                        }}
                        tone="secondary"
                      >
                        Cancel Edit
                      </ActionButton>
                    )}
                  </div>
                </div>

                {activeBill.items?.length ? (
                  <div className="mt-4 overflow-x-auto">
                    <table className="w-full min-w-[760px] text-left text-sm">
                      <thead>
                        <tr className="border-b border-gray-800 text-gray-400">
                          <th className="pb-3">Item</th>
                          <th className="pb-3">Unit</th>
                          <th className="pb-3">Quantity</th>
                          <th className="pb-3">Unit Price</th>
                          <th className="pb-3">Line Total</th>
                          <th className="pb-3 text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {activeBill.items.map((item) => (
                          <tr
                            key={item.id}
                            className="border-b border-gray-900 text-gray-200"
                          >
                            <td className="py-3">{item.product.name}</td>
                            <td className="py-3">{item.product.unit}</td>
                            <td className="py-3">{item.quantity}</td>
                            <td className="py-3">Rs {formatMoney(item.unit_price)}</td>
                            <td className="py-3">Rs {formatMoney(item.line_total)}</td>
                            <td className="py-3">
                              <div className="flex justify-end gap-2">
                                <SmallButton onClick={() => handleEditItem(item)}>
                                  Edit
                                </SmallButton>
                                <SmallButton
                                  onClick={() => handleDeleteItem(item.id)}
                                  tone="danger"
                                  busy={busyAction === `delete-item-${item.id}`}
                                >
                                  Remove
                                </SmallButton>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="mt-4 rounded-2xl border border-dashed border-gray-800 bg-gray-900/40 p-8 text-center text-gray-400">
                    No items added yet. Pick an item above and build the bill line by line.
                  </div>
                )}
              </>
            ) : (
              <div className="rounded-2xl border border-dashed border-gray-800 bg-gray-900/40 p-8 text-center text-gray-400">
                Create or resume a draft bill to start adding stock items.
              </div>
            )}
          </div>
        </div>
      </Section>

      <div className="grid gap-6 xl:grid-cols-[1.5fr,1fr]">
        <Section
          title="Current Inventory Snapshot"
          description="Search the live inventory anytime and jump straight into add-stock or stock-out actions."
        >
          <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <Field
              label="Search"
              value={inventorySearch}
              onChange={setInventorySearch}
              placeholder="Search item name"
            />
            <div className="rounded-xl border border-gray-800 bg-gray-950/60 px-4 py-3 text-sm text-gray-300">
              Total value: <span className="font-semibold text-white">Rs {formatMoney(totalInventoryValue)}</span>
            </div>
          </div>

          {filteredInventory.length ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1040px] text-left text-sm">
                <thead>
                  <tr className="border-b border-gray-800 text-gray-400">
                    <th className="pb-3">Item</th>
                    <th className="pb-3">Unit</th>
                    <th className="pb-3">In Stock</th>
                    <th className="pb-3">Alert At</th>
                    <th className="pb-3">Status</th>
                    <th className="pb-3">Avg Cost</th>
                    <th className="pb-3">Total Value</th>
                    <th className="pb-3">Updated</th>
                    <th className="pb-3 text-right">Quick Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredInventory.map((item) => (
                    <tr
                      key={item.id}
                      className={`border-b border-gray-900 text-gray-200 ${
                        item.is_low_stock ? "bg-amber-500/5" : ""
                      }`}
                    >
                      <td className="py-3">{item.product_name}</td>
                      <td className="py-3">{item.unit}</td>
                      <td className="py-3">{item.quantity}</td>
                      <td className="py-3">{item.low_stock_threshold}</td>
                      <td className="py-3">
                        {item.is_low_stock ? (
                          <ToneBadge tone="warning">Low Stock</ToneBadge>
                        ) : (
                          <ToneBadge tone="neutral">Healthy</ToneBadge>
                        )}
                      </td>
                      <td className="py-3">Rs {formatMoney(item.average_unit_cost)}</td>
                      <td className="py-3">Rs {formatMoney(item.total_value)}</td>
                      <td className="py-3 text-gray-400">{formatDateTime(item.updated_at)}</td>
                      <td className="py-3">
                        <div className="flex flex-wrap justify-end gap-2">
                          <SmallButton onClick={() => openQuickAddStockModal(item)}>
                            Add Stock
                          </SmallButton>
                          <SmallButton
                            onClick={() => focusAdjustmentForm(item.product)}
                            tone="secondary"
                          >
                            Adjust
                          </SmallButton>
                          <SmallButton
                            onClick={() => focusAlertEditor(item.product)}
                            tone="secondary"
                          >
                            Set Alert
                          </SmallButton>
                          <SmallButton
                            onClick={() => openQuickStockOutModal(item)}
                            tone="danger"
                          >
                            Stock Out
                          </SmallButton>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState text="No inventory items match this search." />
          )}
        </Section>

        <Section
          title="Recent Stock Out Log"
          description="See the latest outgoing stock movements in one place."
        >
          {stockOutLogs.length ? (
            <div className="space-y-3">
              {stockOutLogs.slice(0, 8).map((log) => (
                <div
                  key={log.id}
                  className="rounded-2xl border border-gray-800 bg-gray-950/60 p-4"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="font-medium text-white">{log.product.name}</p>
                      <p className="text-sm text-gray-400">{log.reason}</p>
                    </div>
                    <span className="rounded-full bg-rose-500/15 px-2 py-1 text-xs text-rose-300">
                      -{log.quantity} {log.product.unit}
                    </span>
                  </div>
                  <p className="mt-3 text-xs text-gray-500">{formatDateTime(log.used_at)}</p>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState text="No stock out logs yet." />
          )}
        </Section>
      </div>

      <Section
        title="Inventory History"
        description="One place to review every stock-in, stock-out, and manual adjustment in date order."
      >
        <div className="mb-4 grid gap-4 md:grid-cols-4">
          <ReadOnlyHint label="Total Entries" value={historySummary.total_entries} />
          <ReadOnlyHint label="Stock In" value={historySummary.stock_in_count} />
          <ReadOnlyHint label="Stock Out" value={historySummary.stock_out_count} />
          <ReadOnlyHint label="Adjustments" value={historySummary.adjustment_count} />
        </div>

        {historyEntries.length ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1080px] text-left text-sm">
              <thead>
                <tr className="border-b border-gray-800 text-gray-400">
                  <th className="pb-3">When</th>
                  <th className="pb-3">Type</th>
                  <th className="pb-3">Item</th>
                  <th className="pb-3">Qty Change</th>
                  <th className="pb-3">Unit Cost</th>
                  <th className="pb-3">Value Change</th>
                  <th className="pb-3">Reference</th>
                  <th className="pb-3">Notes</th>
                </tr>
              </thead>
              <tbody>
                {historyEntries.map((entry) => (
                  <tr key={entry.id} className="border-b border-gray-900 text-gray-200">
                    <td className="py-3 text-gray-400">{formatDateTime(entry.occurred_at)}</td>
                    <td className="py-3">
                      <ToneBadge
                        tone={
                          entry.entry_type === "STOCK_IN"
                            ? "success"
                            : entry.entry_type === "STOCK_OUT"
                              ? "danger"
                              : "warning"
                        }
                      >
                        {entry.entry_type_display}
                      </ToneBadge>
                    </td>
                    <td className="py-3">
                      <div className="font-medium text-white">{entry.product_name}</div>
                      <div className="text-xs text-gray-500">{entry.unit}</div>
                    </td>
                    <td
                      className={`py-3 font-medium ${
                        Number(entry.quantity_change) >= 0 ? "text-emerald-300" : "text-rose-300"
                      }`}
                    >
                      {Number(entry.quantity_change) > 0 ? "+" : ""}
                      {entry.quantity_change} {entry.unit}
                    </td>
                    <td className="py-3">
                      {entry.unit_cost !== null && entry.unit_cost !== undefined
                        ? `Rs ${formatMoney(entry.unit_cost)}`
                        : "-"}
                    </td>
                    <td
                      className={`py-3 font-medium ${
                        Number(entry.value_change || 0) >= 0 ? "text-emerald-300" : "text-rose-300"
                      }`}
                    >
                      {entry.value_change !== null && entry.value_change !== undefined ? (
                        <>
                          {Number(entry.value_change) > 0 ? "+" : ""}
                          Rs {formatMoney(entry.value_change)}
                        </>
                      ) : (
                        "-"
                      )}
                    </td>
                    <td className="py-3 text-gray-300">{entry.reference}</td>
                    <td className="py-3 text-gray-400">{entry.notes || "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState text="No inventory movement history yet." />
        )}
      </Section>

      {quickAddStockForm.open && (
        <ModalShell title={`Add Stock: ${quickAddStockForm.product_name}`}>
          <p className="text-sm text-gray-400">
            This creates a fresh draft bill and automatically places this item in that bill.
          </p>

          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <Field
              label="Supplier Name"
              value={quickAddStockForm.supplier_name}
              onChange={(value) =>
                setQuickAddStockForm((current) => ({ ...current, supplier_name: value }))
              }
              placeholder="Supplier"
            />
            <Field
              label="Bill Number"
              value={quickAddStockForm.bill_number}
              onChange={(value) =>
                setQuickAddStockForm((current) => ({ ...current, bill_number: value }))
              }
              placeholder="Optional"
            />
          </div>

          <div className="mt-4 grid gap-4 md:grid-cols-3">
            <DateField
              label="Bill Date"
              value={quickAddStockForm.bill_date}
              onChange={(value) =>
                setQuickAddStockForm((current) => ({ ...current, bill_date: value }))
              }
            />
            <Field
              label={`Quantity (${quickAddStockForm.unit})`}
              value={quickAddStockForm.quantity}
              onChange={(value) =>
                setQuickAddStockForm((current) => ({ ...current, quantity: value }))
              }
              type="number"
              placeholder="0.00"
            />
            <Field
              label="Unit Price"
              value={quickAddStockForm.unit_price}
              onChange={(value) =>
                setQuickAddStockForm((current) => ({ ...current, unit_price: value }))
              }
              type="number"
              placeholder="0.00"
            />
          </div>

          <div className="mt-5 flex flex-col gap-3 md:flex-row">
            <ActionButton
              onClick={handleQuickAddStock}
              busy={busyAction === "quick-add-stock"}
            >
              Create Bill And Add Item
            </ActionButton>
            <ActionButton onClick={closeQuickAddStockModal} tone="secondary">
              Cancel
            </ActionButton>
          </div>
        </ModalShell>
      )}

      {quickStockOutForm.open && (
        <ModalShell title={`Stock Out: ${quickStockOutForm.product_name}`}>
          <p className="text-sm text-gray-400">
            This removes stock immediately and records the movement in the log.
          </p>

          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <Field
              label={`Quantity (${quickStockOutForm.unit})`}
              value={quickStockOutForm.quantity}
              onChange={(value) =>
                setQuickStockOutForm((current) => ({ ...current, quantity: value }))
              }
              type="number"
              placeholder="0.00"
            />
            <SelectField
              label="Reason"
              value={quickStockOutForm.reason}
              onChange={(value) =>
                setQuickStockOutForm((current) => ({ ...current, reason: value }))
              }
              options={STOCK_OUT_REASONS.map((reason) => ({
                value: reason,
                label: reason,
              }))}
            />
          </div>

          {quickStockOutForm.reason === "Other" && (
            <div className="mt-4">
              <Field
                label="Custom Reason"
                value={quickStockOutForm.custom_reason}
                onChange={(value) =>
                  setQuickStockOutForm((current) => ({ ...current, custom_reason: value }))
                }
                placeholder="Write the reason"
              />
            </div>
          )}

          <div className="mt-5 flex flex-col gap-3 md:flex-row">
            <ActionButton
              onClick={handleQuickStockOut}
              tone="danger"
              busy={busyAction === "quick-stock-out"}
            >
              Apply Stock Out
            </ActionButton>
            <ActionButton onClick={closeQuickStockOutModal} tone="secondary">
              Cancel
            </ActionButton>
          </div>
        </ModalShell>
      )}
    </div>
  );
}

function Section({ id, title, description, children }) {
  return (
    <div
      id={id}
      className="rounded-3xl border border-gray-800 bg-gradient-to-br from-gray-900 via-gray-900 to-gray-950 p-5 shadow-[0_20px_80px_rgba(0,0,0,0.18)]"
    >
      <div className="mb-4">
        <h3 className="text-lg font-semibold text-white">{title}</h3>
        {description && <p className="mt-1 text-sm text-gray-400">{description}</p>}
      </div>
      {children}
    </div>
  );
}

function MiniPanel({ title, children }) {
  return (
    <div className="rounded-2xl border border-gray-800 bg-gray-900/60 p-4">
      <h4 className="mb-3 text-sm font-semibold uppercase tracking-[0.18em] text-gray-400">
        {title}
      </h4>
      {children}
    </div>
  );
}

function SummaryCard({ label, value, accent }) {
  const accents = {
    blue: "from-blue-500/15 to-blue-950/30 border-blue-500/20",
    emerald: "from-emerald-500/15 to-emerald-950/30 border-emerald-500/20",
    amber: "from-amber-500/15 to-amber-950/30 border-amber-500/20",
    rose: "from-rose-500/15 to-rose-950/30 border-rose-500/20",
    slate: "from-slate-500/15 to-slate-950/30 border-slate-500/20",
  };

  return (
    <div
      className={`rounded-2xl border bg-gradient-to-br p-4 ${accents[accent]}`}
    >
      <p className="text-sm text-gray-400">{label}</p>
      <p className="mt-3 text-2xl font-semibold text-white">{value}</p>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm text-gray-400">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-xl border border-gray-700 bg-gray-950/70 px-4 py-3 text-white outline-none transition focus:border-blue-500"
      />
    </label>
  );
}

function DateField({ label, value, onChange }) {
  const inputRef = useRef(null);

  const openPicker = () => {
    inputRef.current?.showPicker?.();
  };

  return (
    <label className="block">
      <span className="mb-2 block text-sm text-gray-400">{label}</span>
      <div className="relative">
        <input
          ref={inputRef}
          type="date"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onClick={openPicker}
          onFocus={openPicker}
          className="w-full rounded-xl border border-gray-700 bg-gray-950/70 px-4 py-3 pr-14 text-white outline-none transition focus:border-blue-500"
        />
        <button
          type="button"
          onClick={openPicker}
          className="absolute right-3 top-1/2 -translate-y-1/2 rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-gray-300 transition hover:border-blue-500 hover:text-white"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            className="h-4 w-4"
          >
            <path d="M8 2v4" />
            <path d="M16 2v4" />
            <rect x="3" y="4" width="18" height="18" rx="2" />
            <path d="M3 10h18" />
          </svg>
        </button>
      </div>
    </label>
  );
}

function SelectField({
  label,
  value,
  onChange,
  options,
  placeholder = "Select",
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm text-gray-400">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-xl border border-gray-700 bg-gray-950/70 px-4 py-3 text-white outline-none transition focus:border-blue-500"
      >
        <option value="">{placeholder}</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function ReadOnlyHint({ label, value }) {
  return (
    <div className="rounded-xl border border-gray-800 bg-gray-950/60 px-4 py-3">
      <p className="text-sm text-gray-400">{label}</p>
      <p className="mt-2 font-medium text-white">{value}</p>
    </div>
  );
}

function ActionButton({ onClick, children, tone = "primary", busy = false }) {
  const tones = {
    primary: "bg-blue-600 hover:bg-blue-500 text-white",
    success: "bg-emerald-600 hover:bg-emerald-500 text-white",
    danger: "bg-rose-600 hover:bg-rose-500 text-white",
    secondary: "bg-gray-800 hover:bg-gray-700 text-white",
  };

  return (
    <button
      onClick={onClick}
      disabled={busy}
      className={`w-full rounded-xl px-4 py-3 font-medium transition ${tones[tone]} ${
        busy ? "cursor-not-allowed opacity-70" : ""
      }`}
    >
      {busy ? "Please wait..." : children}
    </button>
  );
}

function SmallButton({ onClick, children, tone = "primary", busy = false }) {
  const tones = {
    primary: "bg-blue-600 hover:bg-blue-500 text-white",
    secondary: "bg-gray-800 hover:bg-gray-700 text-white",
    danger: "bg-rose-600 hover:bg-rose-500 text-white",
  };

  return (
    <button
      onClick={onClick}
      disabled={busy}
      className={`rounded-lg px-3 py-2 text-xs font-medium transition ${tones[tone]} ${
        busy ? "cursor-not-allowed opacity-70" : ""
      }`}
    >
      {busy ? "..." : children}
    </button>
  );
}

function Alert({ tone, children }) {
  const tones = {
    error: "border-rose-500/20 bg-rose-500/10 text-rose-200",
    success: "border-emerald-500/20 bg-emerald-500/10 text-emerald-200",
  };

  return (
    <div className={`rounded-2xl border px-4 py-3 text-sm ${tones[tone]}`}>
      {children}
    </div>
  );
}

function InfoNote({ children }) {
  return (
    <div className="mt-4 rounded-2xl border border-gray-800 bg-gray-950/60 px-4 py-3 text-sm text-gray-300">
      {children}
    </div>
  );
}

function EmptyState({ text }) {
  return (
    <div className="rounded-2xl border border-dashed border-gray-800 bg-gray-950/40 p-6 text-center text-sm text-gray-400">
      {text}
    </div>
  );
}

function ToneBadge({ tone, children }) {
  const tones = {
    success: "bg-emerald-500/15 text-emerald-300",
    danger: "bg-rose-500/15 text-rose-300",
    warning: "bg-amber-500/15 text-amber-300",
    neutral: "bg-gray-800 text-gray-300",
  };

  return (
    <span className={`rounded-full px-2 py-1 text-xs font-medium ${tones[tone]}`}>
      {children}
    </span>
  );
}

function ModalShell({ title, children }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4">
      <div className="w-full max-w-3xl rounded-3xl border border-gray-800 bg-gradient-to-br from-gray-900 via-gray-900 to-gray-950 p-6 shadow-2xl">
        <h3 className="text-xl font-semibold text-white">{title}</h3>
        <div className="mt-4">{children}</div>
      </div>
    </div>
  );
}
