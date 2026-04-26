import { useEffect, useMemo, useRef, useState } from "react";
import api from "../services/api";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { PanelLoader } from "./SystemLoader";

const ACTIVE_BILL_KEY = "inventory_active_bill_id";
const STOCK_OUT_REASONS = [
  "Used in kitchen",
  "Damaged",
  "Expired",
  "Wastage",
  "Sample",
  "Other",
];
const INVENTORY_DETAIL_TABS = [
  { id: "snapshot", label: "Current Inventory Snapshot" },
  { id: "alerts", label: "Low Stock Alerts" },
  { id: "usage", label: "Item Usage Intelligence" },
  { id: "adjustments", label: "Manual Stock Adjustment" },
  { id: "stock-out-log", label: "Recent Stock Out Log" },
  { id: "history", label: "Inventory History" },
];
const LOW_STOCK_EXPORT_COLUMNS = [
  { id: "quantity", label: "Present Quantity" },
  { id: "demandQuantity", label: "Demanded Quantity" },
  { id: "unit", label: "Unit" },
  { id: "lowStockThreshold", label: "Alert At" },
  { id: "shortage", label: "Shortage" },
  { id: "status", label: "Status" },
  { id: "averageUnitCost", label: "Avg Unit Cost" },
  { id: "totalValue", label: "Stock Value" },
  { id: "lastUpdated", label: "Last Updated" },
];

function defaultLowStockExportColumns() {
  return {
    quantity: true,
    demandQuantity: false,
    unit: true,
    lowStockThreshold: true,
    shortage: true,
    status: true,
    averageUnitCost: false,
    totalValue: false,
    lastUpdated: true,
  };
}

function getToday() {
  return new Date().toISOString().split("T")[0];
}

function getDateDaysAgo(days) {
  const value = new Date();
  value.setDate(value.getDate() - days);
  return value.toISOString().split("T")[0];
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

function formatNumber(value) {
  return Number(value || 0).toLocaleString("en-IN", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
}

function formatDays(value) {
  if (value === null || value === undefined || value === "") return "Not enough usage yet";
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return "Not enough usage yet";
  return `${formatNumber(numeric)} day${numeric >= 1.5 ? "s" : ""}`;
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
  const [lowStockAlertQuantityFilter, setLowStockAlertQuantityFilter] = useState("");
  const [lowStockExportQuantityFilter, setLowStockExportQuantityFilter] = useState("");
  const [lowStockExportSearch, setLowStockExportSearch] = useState("");
  const [selectedLowStockExportItems, setSelectedLowStockExportItems] = useState([]);
  const [lowStockExportDemandByProductId, setLowStockExportDemandByProductId] = useState({});
  const [lowStockExportColumns, setLowStockExportColumns] = useState(
    defaultLowStockExportColumns
  );
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
  const [inventoryDetailTab, setInventoryDetailTab] = useState("snapshot");
  const [usageProductId, setUsageProductId] = useState("");
  const [usageFromDate, setUsageFromDate] = useState(getDateDaysAgo(29));
  const [usageToDate, setUsageToDate] = useState(getToday());
  const [usageLoading, setUsageLoading] = useState(false);
  const [usageError, setUsageError] = useState("");
  const [usageReport, setUsageReport] = useState(null);
  const [productMode, setProductMode] = useState("create");
  const [selectedProductId, setSelectedProductId] = useState("");

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

  const filteredLowStockItems = useMemo(() => {
    if (lowStockAlertQuantityFilter === "") {
      return lowStockItems;
    }

    const maxQuantity = Number(lowStockAlertQuantityFilter);

    if (Number.isNaN(maxQuantity)) {
      return lowStockItems;
    }

    return lowStockItems.filter((item) => Number(item.quantity) <= maxQuantity);
  }, [lowStockItems, lowStockAlertQuantityFilter]);

  const lowStockByProductId = useMemo(
    () => new Map(lowStockItems.map((item) => [String(item.product_id), item])),
    [lowStockItems]
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

  const exportCandidateInventoryItems = useMemo(() => {
    const search = lowStockExportSearch.trim().toLowerCase();
    const maxQuantity =
      lowStockExportQuantityFilter === "" ? null : Number(lowStockExportQuantityFilter);

    return [...inventory]
      .filter((item) => {
        if (maxQuantity !== null && !Number.isNaN(maxQuantity)) {
          return Number(item.quantity) <= maxQuantity;
        }
        return true;
      })
      .filter((item) => {
        if (!search) return true;
        return item.product_name.toLowerCase().includes(search);
      })
      .sort((a, b) => {
        const quantityDiff = Number(a.quantity) - Number(b.quantity);
        if (quantityDiff !== 0) return quantityDiff;
        return a.product_name.localeCompare(b.product_name);
      });
  }, [inventory, lowStockExportSearch, lowStockExportQuantityFilter]);

  const selectedLowStockExportInventoryItems = useMemo(
    () =>
      selectedLowStockExportItems
        .map((productId) => inventoryByProductId.get(String(productId)))
        .filter(Boolean),
    [selectedLowStockExportItems, inventoryByProductId]
  );

  const activeLowStockExportColumns = useMemo(
    () =>
      LOW_STOCK_EXPORT_COLUMNS.filter(
        (column) => lowStockExportColumns[column.id]
      ),
    [lowStockExportColumns]
  );

  const selectedAdjustmentInventory = adjustmentForm.product_id
    ? inventoryByProductId.get(adjustmentForm.product_id)
    : null;

  const usageSummary = usageReport?.summary || {};
  const usageProduct = usageReport?.product || {};
  const usageDailyMovements = usageReport?.charts?.daily_movements || [];
  const usageTimeline = usageReport?.details?.timeline || [];

  const getProductById = (productId) =>
    products.find((product) => String(product.id) === String(productId));

  const getLastKnownUnitPrice = (productId) => {
    const product = getProductById(productId);
    return product?.last_unit_price ? String(product.last_unit_price) : "";
  };

  const resetProductEditor = (mode = "create") => {
    setProductMode(mode);
    setSelectedProductId("");
    setProductName("");
    setProductUnit("");
    setProductLowStockThreshold("");
  };

  const loadProductIntoEditor = (productId) => {
    const product = getProductById(productId);

    setSelectedProductId(productId);
    setProductName(product?.name || "");
    setProductUnit(product?.unit || "");
    setProductLowStockThreshold(String(product?.low_stock_threshold ?? ""));
  };

  useEffect(() => {
    loadDashboard();
  }, []);

  useEffect(() => {
    const validProductIds = new Set(
      inventory.map((item) => String(item.product))
    );
    setSelectedLowStockExportItems((current) =>
      current.filter((productId) => validProductIds.has(String(productId)))
    );
  }, [inventory]);

  useEffect(() => {
    const validProductIds = new Set(inventory.map((item) => String(item.product)));
    setLowStockExportDemandByProductId((current) =>
      Object.fromEntries(
        Object.entries(current).filter(([productId]) => validProductIds.has(String(productId)))
      )
    );
  }, [inventory]);

  useEffect(() => {
    if (!products.length) {
      return;
    }

    if (!usageProductId) {
      setUsageProductId(String(products[0].id));
    }
  }, [products, usageProductId]);

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

  const handleLoadUsageReport = async () => {
    resetMessages();
    setUsageError("");

    if (!usageProductId) {
      setUsageError("Choose an item first.");
      setUsageReport(null);
      return;
    }

    if (!usageFromDate || !usageToDate) {
      setUsageError("Select the usage date range first.");
      setUsageReport(null);
      return;
    }

    if (usageFromDate > usageToDate) {
      setUsageError("From date cannot be after To date.");
      setUsageReport(null);
      return;
    }

    try {
      setUsageLoading(true);
      const response = await api.get("reports/inventory-consumption/", {
        params: {
          from_date: usageFromDate,
          to_date: usageToDate,
          product_id: usageProductId,
        },
      });
      setUsageReport(response.data);
    } catch (err) {
      setUsageReport(null);
      setUsageError(extractError(err, "Unable to build the item-usage view right now."));
    } finally {
      setUsageLoading(false);
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

      let res;

      if (productMode === "edit") {
        if (!selectedProductId) {
          setError("Choose an existing item to edit.");
          return;
        }

        res = await api.patch(`/products/${selectedProductId}/`, {
          name: productName.trim(),
          unit: productUnit.trim(),
          low_stock_threshold: productLowStockThreshold || "0",
        });
      } else {
        res = await api.post("/products/", {
          name: productName.trim(),
          unit: productUnit.trim(),
          low_stock_threshold: productLowStockThreshold || "0",
        });
      }

      await Promise.all([
        fetchProducts(),
        fetchInventory(),
        fetchBills(),
        fetchStockOutLogs(),
        fetchLowStockItems(),
        fetchHistory(),
        activeBill?.id ? loadBillDetail(activeBill.id) : Promise.resolve(),
      ]);

      if (productMode === "edit") {
        setSelectedProductId(String(res.data.id));
        setProductName(res.data.name);
        setProductUnit(res.data.unit);
        setProductLowStockThreshold(String(res.data.low_stock_threshold ?? "0"));
        setSuccess(`${res.data.name} updated successfully.`);
      } else {
        resetProductEditor("create");
        setSuccess(`${res.data.name} created successfully.`);
      }
    } catch (err) {
      setError(
        extractError(
          err,
          productMode === "edit" ? "Failed to update item." : "Failed to create item."
        )
      );
    } finally {
      setBusyAction("");
    }
  };

  const handleDeleteProduct = async () => {
    resetMessages();

    if (!selectedProductId) {
      setError("Choose an existing item first.");
      return;
    }

    const product = getProductById(selectedProductId);
    if (!product) {
      setError("The selected item could not be found.");
      return;
    }

    if (!window.confirm(`Delete ${product.name}? This only works if the item has no stock and no history.`)) {
      return;
    }

    try {
      setBusyAction("delete-product");
      const response = await api.delete(`/products/${selectedProductId}/`);

      await Promise.all([
        fetchProducts(),
        fetchInventory(),
        fetchBills(),
        fetchStockOutLogs(),
        fetchLowStockItems(),
        fetchHistory(),
      ]);

      resetProductEditor("create");
      setSuccess(response.data?.message || `${product.name} deleted safely.`);
    } catch (err) {
      setError(extractError(err, "Failed to delete item safely."));
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

    if (!itemForm.product_id || !itemForm.quantity) {
      setError("Choose item and quantity.");
      return;
    }

    const payload = {
      bill_id: activeBill.id,
      product_id: itemForm.product_id,
      quantity: itemForm.quantity,
      unit_price: itemForm.unit_price || null,
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
      unit_price: getLastKnownUnitPrice(inventoryItem.product),
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
      !quickAddStockForm.quantity
    ) {
      setError("Enter supplier, bill date, and quantity.");
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
          unit_price: quickAddStockForm.unit_price || null,
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
    setInventoryDetailTab("alerts");
    handleAlertProductChange(String(productId));
    scrollToSection("inventory-detail-tabs");
  };

  const focusAdjustmentForm = (productId) => {
    setInventoryDetailTab("adjustments");
    setAdjustmentForm((current) => ({
      ...current,
      product_id: String(productId),
    }));
    scrollToSection("inventory-detail-tabs");
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

  const handleProductModeChange = (mode) => {
    resetMessages();
    resetProductEditor(mode);
  };

  const handleProductEditorSelection = (productId) => {
    if (!productId) {
      resetProductEditor("edit");
      return;
    }

    loadProductIntoEditor(productId);
  };

  const handleExportLowStockPdf = () => {
    resetMessages();

    if (!selectedLowStockExportInventoryItems.length) {
      setError("Select at least one item from the list before exporting the PDF.");
      return;
    }

    if (!activeLowStockExportColumns.length) {
      setError("Choose at least one column to include in the PDF.");
      return;
    }

    const doc = new jsPDF({
      orientation: "portrait",
      unit: "pt",
      format: "a4",
    });

    const generatedAt = new Date().toLocaleString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    });

    doc.setFillColor(18, 24, 38);
    doc.rect(0, 0, 595.28, 110, "F");

    doc.setTextColor(245, 247, 250);
    doc.setFont("times", "bold");
    doc.setFontSize(23);
    doc.text("Al- Maidah Cafe & Restaurant", 40, 48);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(11);
    doc.text("Established 2022", 40, 68);
    doc.text("Low Stock Alert Register", 40, 88);

    doc.setTextColor(60, 72, 88);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.text(`Generated: ${generatedAt}`, 40, 136);
    doc.text(
      `Quantity range: ${
        lowStockExportQuantityFilter === ""
          ? "All inventory quantities"
          : `Current stock up to ${lowStockExportQuantityFilter}`
      }`,
      40,
      152
    );
    doc.text(
      `Selected items: ${selectedLowStockExportInventoryItems.length} of ${inventory.length}`,
      40,
      168
    );

    if (lowStockExportSearch.trim()) {
      doc.text(`Item search: ${lowStockExportSearch.trim()}`, 40, 184);
    }

    const tableStartY = lowStockExportSearch.trim() ? 206 : 190;

    autoTable(doc, {
      startY: tableStartY,
      head: [[
        "Item",
        ...activeLowStockExportColumns.map((column) => column.label),
      ]],
      body: selectedLowStockExportInventoryItems.map((item) => {
        const shortageQuantity = Math.max(
          0,
          Number(item.low_stock_threshold || 0) - Number(item.quantity || 0)
        );
        const itemStatus =
          Number(item.quantity) === 0
            ? "Out of Stock"
            : item.is_low_stock
              ? "Low Stock"
              : "Healthy";

        return [
          item.product_name,
          ...activeLowStockExportColumns.map((column) => {
            switch (column.id) {
              case "quantity":
                return String(item.quantity);
              case "demandQuantity":
                return lowStockExportDemandByProductId[String(item.product)] || "-";
              case "unit":
                return item.unit;
              case "lowStockThreshold":
                return String(item.low_stock_threshold);
              case "shortage":
                return String(shortageQuantity);
              case "status":
                return itemStatus;
              case "averageUnitCost":
                return `Rs ${formatMoney(item.average_unit_cost)}`;
              case "totalValue":
                return `Rs ${formatMoney(item.total_value)}`;
              case "lastUpdated":
                return item.updated_at ? formatDateTime(item.updated_at) : "-";
              default:
                return "-";
            }
          }),
        ];
      }),
      theme: "grid",
      headStyles: {
        fillColor: [27, 38, 59],
        textColor: [255, 255, 255],
        fontStyle: "bold",
      },
      styles: {
        font: "helvetica",
        fontSize: 9,
        cellPadding: 8,
        textColor: [33, 37, 41],
        lineColor: [222, 226, 230],
      },
      bodyStyles: {
        fillColor: [255, 255, 255],
      },
      alternateRowStyles: {
        fillColor: [248, 250, 252],
      },
      didParseCell: (data) => {
        const row = selectedLowStockExportInventoryItems[data.row.index];

        if (!row || data.section !== "body") return;

        if (Number(row.quantity) === 0) {
          data.cell.styles.fillColor = [255, 235, 238];
          data.cell.styles.textColor = [183, 28, 28];
          if (activeLowStockExportColumns[data.column.index - 1]?.id === "status") {
            data.cell.styles.fontStyle = "bold";
          }
        } else if (row.is_low_stock) {
          data.cell.styles.fillColor = [255, 248, 225];
          data.cell.styles.textColor = [146, 64, 14];
        }
      },
      margin: { left: 40, right: 40, bottom: 48 },
    });

    const pageCount = doc.getNumberOfPages();
    for (let page = 1; page <= pageCount; page += 1) {
      doc.setPage(page);
      doc.setTextColor(110, 118, 129);
      doc.setFontSize(9);
      doc.text(
        `Al- Maidah Cafe & Restaurant • Low Stock Alert Register • Page ${page} of ${pageCount}`,
        40,
        820
      );
    }

    doc.save(`al-maidah-low-stock-alerts-${new Date().toISOString().split("T")[0]}.pdf`);
    setSuccess("Low stock PDF exported successfully.");
  };

  const toggleLowStockExportItem = (productId) => {
    setSelectedLowStockExportItems((current) =>
      current.includes(productId)
        ? current.filter((itemId) => itemId !== productId)
        : [...current, productId]
    );
  };

  const handleSelectVisibleLowStockExportItems = () => {
    const visibleIds = exportCandidateInventoryItems.map((item) =>
      String(item.product)
    );
    setSelectedLowStockExportItems((current) => {
      const merged = new Set([...current, ...visibleIds]);
      return [...merged];
    });
  };

  const handleClearLowStockExportItems = () => {
    setSelectedLowStockExportItems([]);
  };

  const toggleLowStockExportColumn = (columnId) => {
    setLowStockExportColumns((current) => ({
      ...current,
      [columnId]: !current[columnId],
    }));
  };

  const handleLowStockExportDemandChange = (productId, value) => {
    setLowStockExportDemandByProductId((current) => ({
      ...current,
      [productId]: value,
    }));

    if (value !== "") {
      setLowStockExportColumns((current) => ({
        ...current,
        demandQuantity: true,
      }));
    }
  };

  if (loading) {
    return (
      <PanelLoader
        eyebrow="Inventory"
        label="Loading inventory dashboard..."
        description="Preparing live stock, low-stock alerts, adjustments, and draft bill activity."
      />
    );
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
          description="Add a raw inventory item once, or switch to edit mode to rename and update an existing one."
        >
          <div className="mb-4 flex flex-wrap gap-2">
            <SubTabButton
              active={productMode === "create"}
              onClick={() => handleProductModeChange("create")}
            >
              Create New
            </SubTabButton>
            <SubTabButton
              active={productMode === "edit"}
              onClick={() => handleProductModeChange("edit")}
            >
              Edit Existing
            </SubTabButton>
          </div>

          {productMode === "edit" && (
            <div className="mb-4">
              <SelectField
                label="Choose Existing Item"
                value={selectedProductId}
                onChange={handleProductEditorSelection}
                options={products.map((product) => ({
                  value: String(product.id),
                  label: `${product.name} (${product.unit})`,
                }))}
                placeholder="Select item to edit"
              />
            </div>
          )}

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
            {productMode === "edit"
              ? "Renaming an item updates it everywhere inventory already uses that same product record."
              : "Warning appears when live stock becomes equal to or lower than this alert quantity. Use `0` if you do not want alerts for this item."}
          </InfoNote>
          <div className="mt-4 flex flex-col gap-3 md:flex-row">
            <ActionButton
              onClick={handleCreateProduct}
              busy={busyAction === "create-product"}
            >
              {productMode === "edit" ? "Save Item Changes" : "Create Item"}
            </ActionButton>
            {productMode === "edit" && (
              <>
                <ActionButton
                  onClick={handleDeleteProduct}
                  tone="danger"
                  busy={busyAction === "delete-product"}
                >
                  Delete Item Safely
                </ActionButton>
                <ActionButton onClick={() => resetProductEditor("create")} tone="secondary">
                  Back To Create
                </ActionButton>
              </>
            )}
          </div>
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
                        setItemForm((current) => ({
                          ...current,
                          product_id: value,
                          unit_price: getLastKnownUnitPrice(value),
                        }))
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
                      label="Unit Price (Optional)"
                      value={itemForm.unit_price}
                      onChange={(value) =>
                        setItemForm((current) => ({ ...current, unit_price: value }))
                      }
                      type="number"
                      placeholder={
                        itemForm.product_id && !getLastKnownUnitPrice(itemForm.product_id)
                          ? "Required if no last price exists"
                          : "Leave blank to reuse last price"
                      }
                    />
                  </div>
                  <InfoNote>
                    {itemForm.product_id && getLastKnownUnitPrice(itemForm.product_id)
                      ? `Last unit price found: Rs ${formatMoney(getLastKnownUnitPrice(itemForm.product_id))}. You can keep it or enter a new one.`
                      : "If you leave unit price blank, the system will try to use the last price used for that same item."}
                  </InfoNote>
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

      <Section
        id="inventory-detail-tabs"
        title="Inventory Views"
        description="Open one focused view at a time so the long inventory sections stay manageable."
      >
        <div className="mb-5 flex flex-wrap gap-2">
          {INVENTORY_DETAIL_TABS.map((tab) => (
            <SubTabButton
              key={tab.id}
              active={inventoryDetailTab === tab.id}
              onClick={() => setInventoryDetailTab(tab.id)}
            >
              {tab.label}
            </SubTabButton>
          ))}
        </div>

        {inventoryDetailTab === "snapshot" && (
          <DetailView
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
          </DetailView>
        )}

        {inventoryDetailTab === "alerts" && (
          <DetailView
            id="inventory-alerts"
            title="Low Stock Alerts"
            description="Warnings appear when current stock is less than or equal to the alert quantity set for that item."
          >
            <InfoNote>
              Example: if you set rice alert to `5 kg`, it will show here as soon as live stock reaches
              `5 kg` or below.
            </InfoNote>

            <div className="mt-4 grid gap-4 lg:grid-cols-[0.9fr,1.1fr]">
              <Field
                label="Max Current Quantity"
                value={lowStockAlertQuantityFilter}
                onChange={setLowStockAlertQuantityFilter}
                type="number"
                placeholder="Leave blank for all, enter 1 to include 0 and 1"
              />
              <div className="rounded-2xl border border-gray-800 bg-gray-950/60 p-4">
                <p className="text-sm text-gray-400">How The Range Works</p>
                <p className="mt-2 text-sm text-gray-300">
                  Enter `1` to include quantity `0` and `1`. Enter `2` to include quantity `0`, `1`,
                  and `2`. Leave it blank to show every alert item here.
                </p>
              </div>
            </div>

            <div className="mt-4 grid gap-4 xl:grid-cols-[1.15fr,0.9fr]">
              <div>
                <h4 className="text-sm font-semibold uppercase tracking-[0.18em] text-gray-400">
                  Active Warnings
                </h4>
                <p className="mt-2 text-sm text-gray-500">
                  Showing {filteredLowStockItems.length} of {lowStockItems.length} alert item(s)
                </p>
                <div className="mt-3 space-y-3">
                  {filteredLowStockItems.length ? (
                    filteredLowStockItems.map((item) => (
                      <div
                        key={item.product_id}
                        className={`rounded-2xl border p-4 ${
                          Number(item.quantity) === 0
                            ? "border-rose-500/30 bg-rose-500/10"
                            : "border-amber-500/20 bg-amber-500/10"
                        }`}
                      >
                        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                          <div>
                            <p className="font-medium text-white">{item.product_name}</p>
                            <p
                              className={`text-sm ${
                                Number(item.quantity) === 0
                                  ? "font-semibold text-rose-200"
                                  : "text-amber-100/80"
                              }`}
                            >
                              Current stock: {item.quantity} {item.unit}
                            </p>
                            <p
                              className={`mt-1 text-xs ${
                                Number(item.quantity) === 0
                                  ? "text-rose-100/80"
                                  : "text-amber-100/70"
                              }`}
                            >
                              Alert at {item.low_stock_threshold} {item.unit}
                            </p>
                            <div className="mt-2">
                              <ToneBadge tone={Number(item.quantity) === 0 ? "danger" : "warning"}>
                                {Number(item.quantity) === 0 ? "Out of Stock" : "Low Stock"}
                              </ToneBadge>
                            </div>
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
                    <EmptyState text="No low-stock warnings match this quantity range." />
                  )}
                </div>
              </div>

              <div className="space-y-4">
                <div className="rounded-2xl border border-gray-800 bg-gray-950/60 p-4">
                  <h4 className="text-sm font-semibold uppercase tracking-[0.18em] text-gray-400">
                    Low Stock PDF Builder
                  </h4>
                  <p className="mt-2 text-sm text-gray-300">
                    This section is separate from the live warning box. Search the full inventory, filter by
                    current quantity if you want, choose the rows, choose the columns, and export a cleaner PDF.
                  </p>

                  <div className="mt-4 grid gap-4 md:grid-cols-2">
                    <Field
                      label="Search Items For PDF"
                      value={lowStockExportSearch}
                      onChange={setLowStockExportSearch}
                      placeholder="Search by item name"
                    />
                    <Field
                      label="PDF Max Current Quantity"
                      value={lowStockExportQuantityFilter}
                      onChange={setLowStockExportQuantityFilter}
                      type="number"
                      placeholder="Optional separate range for PDF"
                    />
                  </div>

                  <div className="mt-4 flex flex-wrap gap-2">
                    <SmallButton onClick={handleSelectVisibleLowStockExportItems} tone="secondary">
                      Select Matching Items
                    </SmallButton>
                    <SmallButton onClick={handleClearLowStockExportItems} tone="secondary">
                      Clear Selection
                    </SmallButton>
                  </div>

                  <div className="mt-4">
                    <p className="text-sm text-gray-400">Choose Columns</p>
                    <div className="mt-3 grid gap-2 sm:grid-cols-2">
                      {LOW_STOCK_EXPORT_COLUMNS.map((column) => (
                        <label
                          key={column.id}
                          className="flex items-center gap-3 rounded-xl border border-gray-800 bg-gray-900/60 px-3 py-3 text-sm text-gray-200"
                        >
                          <input
                            type="checkbox"
                            checked={Boolean(lowStockExportColumns[column.id])}
                            onChange={() => toggleLowStockExportColumn(column.id)}
                            className="h-4 w-4 rounded border-gray-600 bg-gray-950 text-blue-500 focus:ring-blue-500"
                          />
                          <span>{column.label}</span>
                        </label>
                      ))}
                    </div>
                  </div>

                  <div className="mt-4">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm text-gray-400">Choose Items For PDF</p>
                      <p className="text-xs text-gray-500">
                        Selected {selectedLowStockExportInventoryItems.length}
                      </p>
                    </div>

                    <div className="mt-3 max-h-72 space-y-2 overflow-y-auto rounded-2xl border border-gray-800 bg-gray-950/50 p-3">
                      {exportCandidateInventoryItems.length ? (
                        exportCandidateInventoryItems.map((item) => {
                          const isSelected = selectedLowStockExportItems.includes(
                            String(item.product)
                          );
                          const matchingLowStockItem = lowStockByProductId.get(
                            String(item.product)
                          );
                          const itemStatus =
                            Number(item.quantity) === 0
                              ? "Out of Stock"
                              : item.is_low_stock
                                ? "Low Stock"
                                : "Healthy";

                          return (
                            <div
                              key={item.product}
                              className={`flex items-start gap-3 rounded-2xl border px-3 py-3 transition ${
                                isSelected
                                  ? "border-blue-500/40 bg-blue-500/10"
                                  : "border-gray-800 bg-gray-900/50 hover:border-gray-700"
                              }`}
                            >
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={() => toggleLowStockExportItem(String(item.product))}
                                className="mt-1 h-4 w-4 rounded border-gray-600 bg-gray-950 text-blue-500 focus:ring-blue-500"
                              />
                              <div className="min-w-0 flex-1">
                                <div className="flex flex-wrap items-center gap-2">
                                  <p className="font-medium text-white">{item.product_name}</p>
                                  <ToneBadge
                                    tone={
                                      Number(item.quantity) === 0
                                        ? "danger"
                                        : item.is_low_stock
                                          ? "warning"
                                          : "neutral"
                                    }
                                  >
                                    {itemStatus}
                                  </ToneBadge>
                                </div>
                                <p className="mt-1 text-sm text-gray-300">
                                  {item.quantity} {item.unit} in stock
                                  {matchingLowStockItem
                                    ? ` • Alert at ${matchingLowStockItem.low_stock_threshold} ${item.unit}`
                                    : ` • Alert at ${item.low_stock_threshold} ${item.unit}`}
                                </p>
                                <div className="mt-3 max-w-[220px]">
                                  <Field
                                    label="Demanded Quantity (Optional)"
                                    value={
                                      lowStockExportDemandByProductId[String(item.product)] || ""
                                    }
                                    onChange={(value) =>
                                      handleLowStockExportDemandChange(String(item.product), value)
                                    }
                                    type="number"
                                    placeholder="Example: 5"
                                  />
                                </div>
                              </div>
                            </div>
                          );
                        })
                      ) : (
                        <EmptyState text="No inventory items match this PDF search and quantity range." />
                      )}
                    </div>
                  </div>

                  <div className="mt-4 flex flex-col gap-3 md:flex-row">
                    <ActionButton onClick={handleExportLowStockPdf} tone="secondary">
                      Export Selected PDF
                    </ActionButton>
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
            </div>
          </DetailView>
        )}

        {inventoryDetailTab === "usage" && (
          <DetailView
            title="Item Usage Intelligence"
            description="Answer stock questions inside Inventory itself: what moved in, what moved out, how fast one item is being consumed, and how long current stock can last."
          >
            <div className="grid gap-4 xl:grid-cols-[1.2fr,0.8fr]">
              <div className="grid gap-4 md:grid-cols-3">
                <SelectField
                  label="Item"
                  value={usageProductId}
                  onChange={(value) => {
                    setUsageProductId(value);
                    setUsageReport(null);
                    setUsageError("");
                  }}
                  options={products.map((product) => ({
                    value: String(product.id),
                    label: `${product.name} (${product.unit})`,
                  }))}
                  placeholder="Select item"
                />
                <DateField
                  label="From"
                  value={usageFromDate}
                  onChange={(value) => {
                    setUsageFromDate(value);
                    setUsageReport(null);
                    setUsageError("");
                  }}
                />
                <DateField
                  label="To"
                  value={usageToDate}
                  onChange={(value) => {
                    setUsageToDate(value);
                    setUsageReport(null);
                    setUsageError("");
                  }}
                />
              </div>

              <div className="flex items-end">
                <ActionButton
                  onClick={handleLoadUsageReport}
                  busy={usageLoading}
                >
                  Build Usage View
                </ActionButton>
              </div>
            </div>

            <InfoNote>
              This section uses your real stock-in bills and stock-out logs, so the quality of the intelligence depends on how consistently staff records stock movement.
            </InfoNote>

            {usageError ? (
              <Alert tone="error">{usageError}</Alert>
            ) : null}

            {usageLoading ? (
              <div className="mt-4">
                <PanelLoader
                  eyebrow="Inventory Usage"
                  label="Building usage intelligence..."
                  description="Checking stock-in, stock-out, daily rhythm, and stock cover for the selected item."
                />
              </div>
            ) : usageReport ? (
              <div className="mt-6 space-y-6">
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
                  <SummaryCard
                    label="Stocked In"
                    value={`${formatNumber(usageSummary.total_stocked_in_qty)} ${usageProduct.unit || ""}`}
                    accent="emerald"
                  />
                  <SummaryCard
                    label="Used / Stocked Out"
                    value={`${formatNumber(usageSummary.total_stocked_out_qty)} ${usageProduct.unit || ""}`}
                    accent="rose"
                  />
                  <SummaryCard
                    label="Avg Daily Usage"
                    value={`${formatNumber(usageSummary.average_daily_usage)} ${usageProduct.unit || ""}`}
                    accent="amber"
                  />
                  <SummaryCard
                    label="1 Unit Lasts"
                    value={formatDays(usageSummary.days_per_unit_used)}
                    accent="blue"
                  />
                  <SummaryCard
                    label="Current Stock Cover"
                    value={formatDays(usageSummary.current_stock_cover_days)}
                    accent="slate"
                  />
                </div>

                <div className="grid gap-6 xl:grid-cols-[0.95fr,1.05fr]">
                  <div className="rounded-2xl border border-gray-800 bg-gray-950/60 p-4">
                    <h4 className="text-sm font-semibold uppercase tracking-[0.18em] text-gray-400">
                      Owner Reading
                    </h4>
                    <div className="mt-4 space-y-4">
                      <ReadOnlyHint
                        label="Current Stock"
                        value={`${formatNumber(usageProduct.current_stock)} ${usageProduct.unit || ""}`}
                      />
                      <ReadOnlyHint
                        label="Current Stock Value"
                        value={`Rs ${formatMoney(usageProduct.current_value)}`}
                      />
                      <ReadOnlyHint
                        label="Average Unit Cost"
                        value={`Rs ${formatMoney(usageProduct.average_unit_cost)}`}
                      />
                      <div className="rounded-2xl border border-gray-800 bg-gray-900/60 p-4 text-sm leading-7 text-gray-300">
                        {Number(usageSummary.total_stocked_out_qty || 0) > 0 ? (
                          <>
                            <div>
                              <span className="font-semibold text-white">{usageProduct.name}</span> moved out by{" "}
                              <span className="font-semibold text-white">
                                {formatNumber(usageSummary.total_stocked_out_qty)} {usageProduct.unit}
                              </span>{" "}
                              in this range.
                            </div>
                            <div className="mt-2">
                              That works out to roughly{" "}
                              <span className="font-semibold text-white">
                                {formatNumber(usageSummary.average_daily_usage)} {usageProduct.unit}
                              </span>{" "}
                              per day, and current stock can cover about{" "}
                              <span className="font-semibold text-white">
                                {formatDays(usageSummary.current_stock_cover_days)}
                              </span>{" "}
                              if usage stays similar.
                            </div>
                          </>
                        ) : (
                          "This item has no stock-out activity in the selected range yet, so usage and stock-cover estimates are still weak."
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="rounded-2xl border border-gray-800 bg-gray-950/60 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <h4 className="text-sm font-semibold uppercase tracking-[0.18em] text-gray-400">
                        Daily Movement Graph
                      </h4>
                      <div className="text-xs text-gray-500">
                        Green = in, Red = out
                      </div>
                    </div>

                    <div className="mt-4 space-y-3">
                      {usageDailyMovements.length ? (
                        usageDailyMovements.map((row) => {
                          const maxMovement = Math.max(
                            ...usageDailyMovements.map((entry) =>
                              Math.max(
                                Number(entry.stocked_in_qty || 0),
                                Number(entry.stocked_out_qty || 0),
                                1
                              )
                            )
                          );
                          const stockInWidth = `${(Number(row.stocked_in_qty || 0) / maxMovement) * 100}%`;
                          const stockOutWidth = `${(Number(row.stocked_out_qty || 0) / maxMovement) * 100}%`;

                          return (
                            <div key={row.date} className="rounded-xl border border-gray-800 bg-gray-900/50 p-3">
                              <div className="flex items-center justify-between gap-3 text-xs text-gray-400">
                                <span>{formatDate(row.date)}</span>
                                <span>
                                  In {formatNumber(row.stocked_in_qty)} / Out {formatNumber(row.stocked_out_qty)}
                                </span>
                              </div>
                              <div className="mt-3 space-y-2">
                                <div>
                                  <div className="mb-1 text-[11px] uppercase tracking-[0.18em] text-emerald-300">
                                    Stock In
                                  </div>
                                  <div className="h-2 overflow-hidden rounded-full bg-gray-800">
                                    <div
                                      className="h-full rounded-full bg-emerald-400"
                                      style={{ width: stockInWidth }}
                                    />
                                  </div>
                                </div>
                                <div>
                                  <div className="mb-1 text-[11px] uppercase tracking-[0.18em] text-rose-300">
                                    Stock Out
                                  </div>
                                  <div className="h-2 overflow-hidden rounded-full bg-gray-800">
                                    <div
                                      className="h-full rounded-full bg-rose-400"
                                      style={{ width: stockOutWidth }}
                                    />
                                  </div>
                                </div>
                              </div>
                            </div>
                          );
                        })
                      ) : (
                        <EmptyState text="No daily movement data available in this range." />
                      )}
                    </div>
                  </div>
                </div>

                <div className="rounded-2xl border border-gray-800 bg-gray-950/60 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <h4 className="text-sm font-semibold uppercase tracking-[0.18em] text-gray-400">
                      Movement Timeline
                    </h4>
                    <div className="text-xs text-gray-500">
                      Latest {usageTimeline.length} event(s)
                    </div>
                  </div>

                  {usageTimeline.length ? (
                    <div className="mt-4 overflow-x-auto">
                      <table className="w-full min-w-[980px] text-left text-sm">
                        <thead>
                          <tr className="border-b border-gray-800 text-gray-400">
                            <th className="pb-3">When</th>
                            <th className="pb-3">Type</th>
                            <th className="pb-3">Qty</th>
                            <th className="pb-3">Value</th>
                            <th className="pb-3">Reference</th>
                            <th className="pb-3">Notes</th>
                          </tr>
                        </thead>
                        <tbody>
                          {usageTimeline.map((entry) => (
                            <tr key={entry.id} className="border-b border-gray-900 text-gray-200">
                              <td className="py-3 text-gray-400">{formatDateTime(entry.occurred_at)}</td>
                              <td className="py-3">
                                <ToneBadge tone={entry.event_type === "STOCK_IN" ? "success" : "danger"}>
                                  {entry.label}
                                </ToneBadge>
                              </td>
                              <td className="py-3">
                                {formatNumber(entry.quantity)} {usageProduct.unit || ""}
                              </td>
                              <td className="py-3">Rs {formatMoney(entry.value)}</td>
                              <td className="py-3 text-gray-300">{entry.reference || "-"}</td>
                              <td className="py-3 text-gray-400">{entry.notes || "-"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div className="mt-4">
                      <EmptyState text="No movement events found for this item in the selected range." />
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="mt-4">
                <EmptyState text="Choose an item and build the usage view to open stock analytics here." />
              </div>
            )}
          </DetailView>
        )}

        {inventoryDetailTab === "adjustments" && (
          <DetailView
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
          </DetailView>
        )}

        {inventoryDetailTab === "stock-out-log" && (
          <DetailView
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
          </DetailView>
        )}

        {inventoryDetailTab === "history" && (
          <DetailView
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
          </DetailView>
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
              label="Unit Price (Optional)"
              value={quickAddStockForm.unit_price}
              onChange={(value) =>
                setQuickAddStockForm((current) => ({ ...current, unit_price: value }))
              }
              type="number"
              placeholder={
                getLastKnownUnitPrice(quickAddStockForm.product_id)
                  ? "Leave blank to reuse last price"
                  : "Required if no last price exists"
              }
            />
          </div>

          <InfoNote>
            {getLastKnownUnitPrice(quickAddStockForm.product_id)
              ? `Last unit price found: Rs ${formatMoney(getLastKnownUnitPrice(quickAddStockForm.product_id))}.`
              : "If you leave unit price blank here, the system will look for the last price used for this same item."}
          </InfoNote>

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

function DetailView({ id, title, description, children }) {
  return (
    <div
      id={id}
      className="rounded-2xl border border-gray-800 bg-gray-950/40 p-5"
    >
      <div className="mb-4">
        <h4 className="text-lg font-semibold text-white">{title}</h4>
        {description && <p className="mt-1 text-sm text-gray-400">{description}</p>}
      </div>
      {children}
    </div>
  );
}

function SubTabButton({ active, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full px-4 py-2 text-sm font-medium transition ${
        active
          ? "bg-blue-600 text-white shadow-[0_10px_30px_rgba(37,99,235,0.25)]"
          : "bg-gray-900 text-gray-300 hover:bg-gray-800 hover:text-white"
      }`}
    >
      {children}
    </button>
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
