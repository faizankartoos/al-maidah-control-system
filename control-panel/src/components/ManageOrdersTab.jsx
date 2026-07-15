import { useEffect, useMemo, useState } from "react";
import api, { buildApiUrl } from "../services/api";
import { PanelLoader } from "./SystemLoader";
import AreaAutocomplete from "./AreaAutocomplete";
import CustomerPhoneAutocomplete from "./CustomerPhoneAutocomplete";
import { printOrderBill } from "../utils/orderPrinting";

const today = new Date().toISOString().split("T")[0];

function formatMoney(value) {
  return Number(value || 0).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatDateTime(value) {
  if (!value) return "-";
  return new Date(value).toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
}

function statusBadge(status) {
  if (status === "READY") return "border-emerald-500/30 bg-emerald-500/10 text-emerald-300";
  if (status === "PROCESSING") return "border-sky-500/30 bg-sky-500/10 text-sky-300";
  if (status === "SCHEDULED") return "border-amber-500/30 bg-amber-500/10 text-amber-300";
  if (status === "COMPLETED") return "border-violet-500/30 bg-violet-500/10 text-violet-300";
  if (status === "CANCELLED") return "border-rose-500/30 bg-rose-500/10 text-rose-300";
  return "border-slate-700 bg-slate-800 text-slate-200";
}

function paymentBadge(status) {
  if (status === "PAID") return "border-emerald-500/30 bg-emerald-500/10 text-emerald-300";
  if (status === "UNPAID") return "border-rose-500/30 bg-rose-500/10 text-rose-300";
  return "border-amber-500/30 bg-amber-500/10 text-amber-300";
}

function acceptanceBadge(status) {
  if (status === "ACCEPTED") return "border-emerald-500/30 bg-emerald-500/10 text-emerald-300";
  if (status === "PENDING") return "border-amber-500/30 bg-amber-500/10 text-amber-300";
  if (status === "DECLINED") return "border-rose-500/30 bg-rose-500/10 text-rose-300";
  return "border-slate-700 bg-slate-800 text-slate-200";
}

function orderTypeLabel(orderType) {
  if (orderType === "DINE_IN") return "Dine-In";
  if (orderType === "TAKEAWAY") return "Takeaway";
  if (orderType === "DELIVERY") return "Delivery";
  return orderType || "-";
}

function orderQuickLocator(order) {
  if (order.order_type === "DELIVERY") {
    return order.area_name || order.delivery_address || order.customer_phone || "No delivery address";
  }

  if (order.order_type === "TAKEAWAY") {
    return order.customer_phone || "No phone number";
  }

  if (order.order_type === "DINE_IN") {
    const items = (order.items || []).map((item) => item.item_name).filter(Boolean);

    if (!items.length) {
      return "No items added";
    }

    const preview = items.slice(0, 3).join(", ");
    const extraCount = items.length - 3;

    return extraCount > 0 ? `${preview} +${extraCount} more` : preview;
  }

  return order.customer_name || order.customer_phone || "-";
}

function orderPrimaryHighlight(order) {
  if (order.order_type === "DINE_IN") {
    return order.table_number ? `Table ${order.table_number}` : "Table not assigned";
  }

  if (order.order_type === "TAKEAWAY") {
    return order.customer_phone ? `Phone ${order.customer_phone}` : "Phone not entered";
  }

  if (order.order_type === "DELIVERY") {
    return order.customer_phone ? `Phone ${order.customer_phone}` : "Phone not entered";
  }

  return order.customer_name || "-";
}

function orderSecondaryHighlight(order) {
  if (order.order_type === "DELIVERY") {
    if (order.area_name && order.delivery_address) {
      return `${order.area_name} • ${order.delivery_address}`;
    }

    return order.area_name || order.delivery_address || "Address not entered";
  }

  if (order.order_type === "DINE_IN") {
    return order.guest_count ? `${order.guest_count} guests` : "Dine-in order";
  }

  return order.customer_name || "Customer not entered";
}

function orderItemsPreview(order) {
  const items = (order.items || []).filter((item) => item?.item_name);

  if (!items.length) {
    return "No items added";
  }

  const preview = items
    .slice(0, 3)
    .map((item) => `${item.item_name} x${item.quantity}`)
    .join(" • ");

  const extraCount = items.length - 3;

  return extraCount > 0 ? `${preview} • +${extraCount} more` : preview;
}

function getSortedCategories(products) {
  return [...new Set(products.map((product) => product.category))]
    .filter(Boolean)
    .sort((left, right) => left.localeCompare(right, undefined, { sensitivity: "base" }));
}

function formatFullDateTime(value) {
  if (!value) return "-";
  return new Date(value).toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
}

function SectionCard({ title, subtitle, icon, children, className = "" }) {
  return (
    <section className={`overflow-hidden rounded-3xl border border-slate-800 bg-slate-900/75 shadow-lg shadow-black/20 ${className}`}>
      <div className="flex items-start gap-3 border-b border-slate-800/90 bg-slate-950/50 px-5 py-4">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-sky-500/20 bg-sky-500/10 text-sky-200">
          {icon}
        </div>
        <div className="min-w-0">
          <div className="text-sm font-semibold uppercase tracking-[0.22em] text-slate-100">
            {title}
          </div>
          {subtitle && (
            <div className="mt-1 text-xs text-slate-400">
              {subtitle}
            </div>
          )}
        </div>
      </div>

      <div className="px-5 py-4">
        {children}
      </div>
    </section>
  );
}

function DetailField({ label, value, valueClassName = "", className = "" }) {
  const displayValue = value === null || value === undefined || value === "" ? "-" : value;

  return (
    <div className={`rounded-2xl border border-slate-800 bg-slate-950/70 px-4 py-3 ${className}`}>
      <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">
        {label}
      </div>
      <div className={`mt-2 text-sm font-medium text-slate-100 ${valueClassName}`}>
        {displayValue}
      </div>
    </div>
  );
}
export default function ManageOrdersTab({
  currentUser,
  externalRefreshKey = 0,
  compactMode = false,
  showExternalQueue = true,
  allowExternalDecisions = true,
}) {
  const inputStyle = `
    w-full bg-slate-800 p-2 rounded text-white
    outline-none border border-slate-700
    focus:border-green-500 focus:ring-2 focus:ring-green-500
    transition-all duration-200
    `
  const [orders, setOrders] = useState([]);
  const [manageView, setManageView] = useState("OPERATIONS");
  const [externalOrders, setExternalOrders] = useState([]);
  const [externalDecisionFilter, setExternalDecisionFilter] = useState("ALL");
  const [externalLoading, setExternalLoading] = useState(false);
  const [externalActionId, setExternalActionId] = useState(null);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("ALL");
  const [deliveryBoys, setDeliveryBoys] = useState([]);
  const [deliveryBoyFilter, setDeliveryBoyFilter] = useState("");
  const [excludeAddressText, setExcludeAddressText] = useState("");
  const [fromDate, setFromDate] = useState(today);
  const [toDate, setToDate] = useState(today);
  const [showCancelModal, setShowCancelModal] = useState(false)
  const [cancelOrderTarget, setCancelOrderTarget] = useState(null)
  const [cancelRefunded, setCancelRefunded] = useState(false)
  const [cancelRefundAmount, setCancelRefundAmount] = useState("")
  const [cancelError, setCancelError] = useState("")
  const [showLedgerWarning, setShowLedgerWarning] = useState(false)

  const [selectedOrder, setSelectedOrder] = useState(null);

  const [showModal, setShowModal] = useState(false);
  const [showUpdateModal, setShowUpdateModal] = useState(false);
  const [showMenuModal, setShowMenuModal] = useState(false);
  const [showCollectModal, setShowCollectModal] = useState(false);
  const [collectAmount, setCollectAmount] = useState("");
  const [collectMethod, setCollectMethod] = useState("CASH");
  const [collectCashAmount, setCollectCashAmount] = useState("");
  const [collectOnlineAmount, setCollectOnlineAmount] = useState("");
  const [showCollectDeniedToast, setShowCollectDeniedToast] = useState(false);
  const [showCompleteModal, setShowCompleteModal] = useState(false);
  const [completeName, setCompleteName] = useState("");
  const [completePhone, setCompletePhone] = useState("");
  const [completeAddress, setCompleteAddress] = useState("");

  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [categorySearch, setCategorySearch] = useState("");

  const [updateOrderType, setUpdateOrderType] = useState("");
  const [updateName, setUpdateName] = useState("");
  const [updatePhone, setUpdatePhone] = useState("");
  const [updateAddress, setUpdateAddress] = useState("");
  const [updateAreaId, setUpdateAreaId] = useState("");
  const [updateAreaName, setUpdateAreaName] = useState("");
  const [updateDeliveryBoyId, setUpdateDeliveryBoyId] = useState("");
  const [updateTable, setUpdateTable] = useState("");
  const [updateOrderNote, setUpdateOrderNote] = useState("");
  const [updateDiscount, setUpdateDiscount] = useState(0);
  const [updateDeliveryCharge, setUpdateDeliveryCharge] = useState(0);
  const [updateItems, setUpdateItems] = useState([]);
  const [updateErrors, setUpdateErrors] = useState({});
  const [updateFormError, setUpdateFormError] = useState("");

  const canCollectPayments =
    currentUser?.role === "ADMIN" ||
    (currentUser?.special_access || []).includes("COLLECT_PAYMENTS");

  function showCollectDeniedMessage() {
    setShowCollectDeniedToast(true);
    window.setTimeout(() => {
      setShowCollectDeniedToast(false);
    }, 2200);
  }

  async function fetchOrders() {

    const params = new URLSearchParams({
      filter,
    });

    if (fromDate) {
      params.set("from_date", fromDate);
    }

    if (toDate) {
      params.set("to_date", toDate);
    }

    if (filter === "DELIVERY" && deliveryBoyFilter) {
      params.set("delivery_boy", deliveryBoyFilter);
    }

    if (filter === "DELIVERY" && deliveryBoyFilter && excludeAddressText.trim()) {
      params.set("exclude_address_text", excludeAddressText.trim());
    }

    const res = await fetch(buildApiUrl(`orders/filter/?${params.toString()}`));
    const data = await res.json();

    if (!res.ok) {
      alert(data.error || "Failed to load orders");
      return;
    }

    setOrders(data);
  }

  async function fetchExternalOrders(decision = externalDecisionFilter) {
    if (!showExternalQueue) {
      return;
    }

    try {
      setExternalLoading(true);

      const params = new URLSearchParams();
      if (decision && decision !== "ALL") {
        params.set("decision", decision);
      }

      const res = await fetch(buildApiUrl(`orders/external-requests/?${params.toString()}`));
      const data = await res.json();

      if (!res.ok) {
        alert(data.error || "Failed to load external orders");
        return;
      }

      setExternalOrders(data);
    } finally {
      setExternalLoading(false);
    }
  }

  async function handleExternalDecision(orderId, action) {
    setExternalActionId(orderId);

    try {
      const res = await fetch(buildApiUrl(`orders/${orderId}/external-decision/`), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });

      const data = await res.json();

      if (!res.ok) {
        alert(data.error || "Failed to update external order");
        return;
      }

      await fetchExternalOrders();
      await fetchOrders();
    } finally {
      setExternalActionId(null);
    }
  }

  useEffect(() => {
    fetchOrders();
  }, [filter, deliveryBoyFilter, excludeAddressText, fromDate, toDate]);

  useEffect(() => {
    if (!showExternalQueue) {
      setManageView("OPERATIONS");
      setExternalOrders([]);
      return;
    }

    if (manageView === "EXTERNAL" && !showExternalQueue) {
      setManageView("OPERATIONS");
    }
  }, [showExternalQueue, manageView]);

  useEffect(() => {
    if (!showExternalQueue) {
      return;
    }

    fetchExternalOrders();
  }, [externalDecisionFilter, externalRefreshKey, showExternalQueue]);



  useEffect(() => {
    api.get("/menu/?available_only=true")
      .then(res => {
        const data = res.data;
        setProducts(data);
        const cats = getSortedCategories(data);
        setCategories(cats);
        if (cats.length) setSelectedCategory(cats[0]);
        else setSelectedCategory(null);
      })
      .catch(() => {
        setProducts([]);
        setCategories([]);
        setSelectedCategory(null);
      });

    fetch(buildApiUrl("ledger/delivery-boys/"))
      .then(res => res.json())
      .then(data => setDeliveryBoys(data));
  }, []);

  useEffect(() => {
    if (filter !== "DELIVERY") {
      setDeliveryBoyFilter("");
      setExcludeAddressText("");
    }
  }, [filter]);

  useEffect(() => {
    if (!deliveryBoyFilter) {
      setExcludeAddressText("");
    }
  }, [deliveryBoyFilter]);


  const filteredOrders = orders.filter(order => {

    return (
      order.id.toString().includes(search) ||
      (order.customer_name || "").toLowerCase().includes(search.toLowerCase())
    );
  });

  const filteredExternalOrders = externalOrders.filter((order) => {
    const term = search.trim().toLowerCase();

    if (!term) {
      return true;
    }

    return (
      order.id.toString().includes(term) ||
      (order.customer_name || "").toLowerCase().includes(term) ||
      (order.submitted_by_name || "").toLowerCase().includes(term) ||
      (order.submitted_by_username || "").toLowerCase().includes(term)
    );
  });
  const filteredCategories = categories.filter((category) => {
    const searchTerm = categorySearch.trim().toLowerCase();
    if (!searchTerm) {
      return true;
    }

    return category.toLowerCase().includes(searchTerm);
  });

  const dashboardStats = useMemo(() => {
    const totalValue = filteredOrders.reduce((sum, order) => sum + Number(order.total_amount || 0), 0);
    const remainingValue = filteredOrders.reduce(
      (sum, order) => sum + Number(order.remaining_amount || 0),
      0
    );

    return {
      totalOrders: filteredOrders.length,
      scheduled: filteredOrders.filter((order) => order.order_status === "SCHEDULED").length,
      ready: filteredOrders.filter((order) => order.order_status === "READY").length,
      unpaid: filteredOrders.filter((order) => order.payment_status !== "PAID").length,
      totalValue,
      remainingValue,
    };
  }, [filteredOrders]);

  const externalStats = useMemo(() => {
    return {
      total: filteredExternalOrders.length,
      pending: filteredExternalOrders.filter((order) => order.acceptance_status === "PENDING").length,
      accepted: filteredExternalOrders.filter((order) => order.acceptance_status === "ACCEPTED").length,
      declined: filteredExternalOrders.filter((order) => order.acceptance_status === "DECLINED").length,
    };
  }, [filteredExternalOrders]);

  function clearUpdateError(field) {
    setUpdateErrors((prev) => {
      if (!prev[field]) {
        return prev;
      }

      const next = { ...prev };
      delete next[field];
      return next;
    });
  }

  function handleUpdateOrderTypeChange(nextOrderType) {
    setUpdateOrderType(nextOrderType);
    setUpdateFormError("");
    setUpdateErrors({});

    if (nextOrderType === "DINE_IN") {
      setUpdateAddress("");
      setUpdateAreaId("");
      setUpdateAreaName("");
      setUpdateDeliveryBoyId("");
      setUpdateDeliveryCharge(0);
      return;
    }

    setUpdateTable("");

    if (nextOrderType === "TAKEAWAY") {
      setUpdateAddress("");
      setUpdateAreaId("");
      setUpdateAreaName("");
      setUpdateDeliveryBoyId("");
      setUpdateDeliveryCharge(0);
    }
  }

  function handleUpdateCustomerSelect(customer) {
    if (!updateName.trim() && customer?.name) {
      setUpdateName(customer.name);
    }

    if (updateOrderType === "DELIVERY") {
      if (!updateAddress.trim() && customer?.address) {
        setUpdateAddress(customer.address);
      }

      if (!updateAreaId && customer?.area_id) {
        setUpdateAreaId(String(customer.area_id));
        setUpdateAreaName(customer.area_name || "");
      }
    }

    clearUpdateError("customer_phone");
    setUpdateFormError("");
  }

  function validateUpdatedOrder() {
    const errors = {};

    if (!updateItems.length) {
      errors.items = "Add at least one item";
    }

    if (updateOrderType === "TAKEAWAY" && !updatePhone.trim()) {
      errors.customer_phone = "Enter phone number";
    }

    if (updateOrderType === "DELIVERY") {
      if (!updatePhone.trim()) {
        errors.customer_phone = "Enter phone number";
      }

      if (!updateAreaId) {
        errors.area_id = "Select area";
      }
    }

    if (Number.isNaN(Number(updateDiscount)) || Number(updateDiscount) < 0) {
      errors.discount = "Enter a valid discount";
    }

    if (
      updateOrderType === "DELIVERY" &&
      (Number.isNaN(Number(updateDeliveryCharge)) || Number(updateDeliveryCharge) < 0)
    ) {
      errors.delivery_charge = "Enter a valid delivery charge";
    }

    return errors;
  }


  async function startScheduledOrder(order){

  const res = await fetch(
    buildApiUrl(`orders/${order.id}/start/`),
    { method:"POST" }
  )

  const data = await res.json()

  if(data.success){

    fetchOrders()

  }else{

    alert(data.error || "Failed to start order")

  }

  }


  // function printOrder(id){

  // fetch(buildApiUrl(`orders/${id}/`))
  //   .then(res => res.json())
  //   .then(order => {

  //     const win = window.open("", "", "width=400,height=600")

  //     const createdAt = new Date(order.created_at).toLocaleString("en-GB", {
  //       day: "2-digit",
  //       month: "short",
  //       year: "numeric",
  //       hour: "2-digit",
  //       minute: "2-digit",
  //       hour12: true
  //     })

  //     win.document.write(`
  //       <html>
  //       <head>
  //         <title>Bill</title>
  //         <style>
  //           body {
  //             font-family: monospace;
  //             width: 260px;
  //             margin: auto;
  //             font-size: 12px;
  //           }

  //           .center {
  //             text-align: center;
  //           }

  //           .bold {
  //             font-weight: bold;
  //           }

  //           .row {
  //             display: flex;
  //             justify-content: space-between;
  //           }

  //           .line {
  //             border-top: 1px dashed #000;
  //             margin: 6px 0;
  //           }

  //           .big {
  //             font-size: 14px;
  //             font-weight: bold;
  //           }
  //         </style>
          

            

  //         <div class="center bold big">
  //           YOUR RESTAURANT
  //         </div>

  //         <div class="center">
  //           Srinagar
  //         </div>

  //         <div class="line"></div>

  //         <div class="big">Order: #${order.id}</div>
  //         <div>${createdAt}</div>

  //         <div>Type: ${order.order_type}</div>
  //         ${order.order_type === "DINE_IN" && order.table_number ? `
  //           <div>Table: ${order.table_number}</div>
  //         ` : ""}
  //         ${order.order_type === "TAKEAWAY" && order.customer_phone ? `
  //           <div>Phone: ${order.customer_phone}</div>
  //         ` : ""}
  //         ${order.order_type === "DELIVERY" && order.customer_phone ? `
  //           <div>Phone: ${order.customer_phone}</div>
  //         ` : ""}
  //         ${order.order_type === "DELIVERY" && order.delivery_address ? `
  //           <div>Address: ${order.delivery_address}</div>
  //         ` : ""}

  //         ${order.order_note ? `
  //           <div class="line"></div>
  //           <div class="bold">Order Note</div>
  //           <div>${order.order_note}</div>
  //         ` : ""}

  //         <div class="line"></div>

  //         ${order.items.map(i => `
  //           <div class="row">
  //             <span>${i.item_name} x${i.quantity}</span>
  //             <span>${i.total_price}</span>
  //           </div>
  //         `).join("")}

  //         <div class="line"></div>

  //         <div class="row">
  //           <span>Subtotal</span>
  //           <span>₹${order.subtotal}</span>
  //         </div>

  //         <div class="row">
  //           <span>Discount</span>
  //           <span>₹${order.discount}</span>
  //         </div>

  //         <div class="row">
  //           <span>Delivery</span>
  //           <span>₹${order.delivery_charge}</span>
  //         </div>

  //         <div class="line"></div>

  //         <div class="row big">
  //           <span>Total</span>
  //           <span>₹${order.total_amount}</span>
  //         </div>

  //         <div class="line"></div>

  //         <div>
  //           Payment: ${order.payment_status}
  //         </div>

  //         <div>
  //           Mode: ${order.payment_mode || "-"}
  //         </div>

  //         <div class="line"></div>

  //         <div class="center">
  //           Thank you!
  //         </div>

  //       </body>
  //       </html>
  //     `)

  //     win.document.close()
  //     win.focus()

  //     setTimeout(()=>{
  //       win.print()
  //       win.close()
  //     }, 300)

  //   })

  // }

  function printOrder(id){
    printOrderBill(id).catch(() => {
      alert("Unable to open the bill right now. Please try again.");
    });
  }

  function viewOrder(id) {

    fetch(buildApiUrl(`orders/${id}/`))
      .then(res => res.json())
      .then(data => {
        setSelectedOrder(data);
        setShowModal(true);
      });

  }



  function updateOrder(id) {

    fetch(buildApiUrl(`orders/${id}/`))
      .then(res => res.json())
      .then(data => {

        setSelectedOrder(data);

        setUpdateOrderType(data.order_type);
        setUpdateName(data.customer_name || "");
        setUpdatePhone(data.customer_phone || "");
        setUpdateAddress(data.delivery_address || "");
        setUpdateAreaId(data.area ? String(data.area) : "");
        setUpdateAreaName(data.area_name || "");
        setUpdateDeliveryBoyId(data.delivery_boy || "");
        setUpdateOrderNote(data.order_note || "");
        setUpdateTable(data.table_number || "");

        setUpdateDiscount(data.discount);
        setUpdateDeliveryCharge(data.delivery_charge);

        setUpdateItems(data.items || []);
        setUpdateErrors({});
        setUpdateFormError("");

        setShowUpdateModal(true);

      });

  }



  function addMenuItem(product) {

    const existing = updateItems.find(i => i.item_name === product.name);

    if (existing) {

      const items = updateItems.map(i =>
        i.item_name === product.name
          ? { ...i, quantity: i.quantity + 1, total_price: (i.quantity + 1) * i.price }
          : i
      );

      setUpdateItems(items);
      clearUpdateError("items");

    } else {

      setUpdateItems([
        ...updateItems,
        {
          item_name: product.name,
          quantity: 1,
          price: Number(product.price),
          total_price: Number(product.price)
        }
      ]);
      clearUpdateError("items");

    }

  }



  function increaseQty(index) {

    const items = [...updateItems];
    items[index].quantity += 1;
    items[index].total_price = items[index].quantity * items[index].price;

    setUpdateItems(items);
    clearUpdateError("items");

  }



  function decreaseQty(index) {

    const items = [...updateItems];

    if (items[index].quantity === 1) {
      items.splice(index, 1);
    } else {
      items[index].quantity -= 1;
      items[index].total_price = items[index].quantity * items[index].price;
    }

    setUpdateItems(items);
    clearUpdateError("items");

  }



  async function saveUpdatedOrder() {

    setUpdateFormError("");

    const validationErrors = validateUpdatedOrder();

    if (Object.keys(validationErrors).length) {
      setUpdateErrors(validationErrors);
      return;
    }

    setUpdateErrors({});

    const payload = {

      order_type: updateOrderType,
      customer_name: updateName.trim() || null,
      customer_phone: updatePhone.trim() || null,
      delivery_address: updateOrderType === "DELIVERY" ? updateAddress.trim() || null : null,
      area_id: updateOrderType === "DELIVERY" ? updateAreaId || null : null,
      delivery_boy_id: updateOrderType === "DELIVERY" ? updateDeliveryBoyId || null : null,
      order_note: updateOrderNote.trim() || null,
      table_number: updateOrderType === "DINE_IN" ? updateTable.trim() || null : null,
      discount: Number(updateDiscount),
      delivery_charge: updateOrderType === "DELIVERY" ? Number(updateDeliveryCharge) : 0,

      items: updateItems.map(i => ({
        name: i.item_name,
        qty: i.quantity,
        price: i.price
      }))

    };

    const res = await fetch(buildApiUrl(`orders/${selectedOrder.id}/update/`), {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    const data = await res.json();

    if (res.ok && data.success) {

      setShowUpdateModal(false);
      setUpdateErrors({});
      setUpdateFormError("");

      fetchOrders()

    } else {
      setUpdateErrors(data.errors || {});
      setUpdateFormError(data.error || "Failed to update order");

    }

  }
async function submitCollectPayment(){
  if(!canCollectPayments){
    setShowCollectModal(false)
    showCollectDeniedMessage()
    return
  }

  const amount = Number(collectAmount)

  if(amount <= 0){
    alert("Enter valid amount")
    return
  }

  const remainingAmount = Number(selectedOrder.remaining_amount ?? selectedOrder.total_amount)
  const cashAmount = Number(collectCashAmount || 0)
  const onlineAmount = Number(collectOnlineAmount || 0)

  if(collectMethod === "MIXED"){
    if(cashAmount < 0 || onlineAmount < 0){
      alert("Enter valid mixed amounts")
      return
    }

    const mixedTotal = cashAmount + onlineAmount

    if(mixedTotal <= 0){
      alert("Enter cash and/or online amount")
      return
    }

    if(Math.abs(mixedTotal - amount) > 0.009){
      alert("Cash + Online must match the amount")
      return
    }
  }

  if(amount < remainingAmount){
    alert("Full remaining amount is required. Partial collection is disabled.")
    return
  }

  if(collectMethod === "ONLINE" && amount > remainingAmount){
    alert("Online payment cannot exceed the remaining amount")
    return
  }

  const changeAmount = amount - remainingAmount

  if(collectMethod === "MIXED" && changeAmount > cashAmount){
    alert("Change can only be returned from the cash portion")
    return
  }

  if(changeAmount > 0){
    const confirmed = window.confirm(
      `Deduct remaining ₹${changeAmount.toFixed(2)} you're giving back to the customer from cash drawer?`
    )

    if(!confirmed){
      return
    }
  }

  const res = await fetch(buildApiUrl(`orders/${selectedOrder.id}/collect-payment/`), {
    method:"POST",
    headers:{ "Content-Type":"application/json" },
    body:JSON.stringify({
      amount:amount,
      payment_type:collectMethod,
      cash_amount: collectMethod === "MIXED" ? cashAmount : 0,
      online_amount: collectMethod === "MIXED" ? onlineAmount : 0,
      deduct_change: changeAmount > 0
    })
  })

  const data = await res.json()

  if(res.status === 403){
    setShowCollectModal(false)
    showCollectDeniedMessage()
    return
  }

  if(data.success){

    alert("Payment recorded")

    setShowCollectModal(false)
    setCollectCashAmount("")
    setCollectOnlineAmount("")

    fetchOrders()

  }else{

    alert(data.error || "Payment failed")

  }

}

 async function markOrderReady(order){

  const res = await fetch(buildApiUrl(`orders/${order.id}/ready/`), { method:"POST" })

  const data = await res.json()

  if(data.success){

    fetchOrders()

  }else{
    alert(data.error || "Failed")
  }

}


 async function completeOrder(order){

  // already paid → simple complete
  if(order.payment_status === "PAID"){

    const res = await fetch(buildApiUrl(`orders/${order.id}/complete/`), { method:"POST" })

    const data = await res.json()

    if(data.success){

      fetchOrders()

    }else{
      alert(data.error || "Failed")
    }

    return
  }

  // unpaid order → open modal
  setSelectedOrder(order)
  setShowLedgerWarning(true)

}

 function confirmLedgerAssign(){

  setShowLedgerWarning(false)

  setCompleteName(selectedOrder.customer_name || "")
  setCompletePhone(selectedOrder.customer_phone || "")
  setCompleteAddress(selectedOrder.delivery_address || "")

  setShowCompleteModal(true)

 }


 function cancelOrder(order){

  setCancelOrderTarget(order)
  setCancelRefunded(false)
  setCancelRefundAmount(order.payment_status === "PAID" ? order.total_amount : "")
  setCancelError("")
  setShowCancelModal(true)

  }
  
  async function confirmCancel(cooked=false){

  if(cancelOrderTarget.payment_status === "PAID" && cancelRefunded){
    const refundAmount = Number(cancelRefundAmount)

    if(!Number.isFinite(refundAmount) || refundAmount <= 0){
      setCancelError("Enter a valid refund amount")
      return
    }
  }

  const res = await fetch(buildApiUrl(`orders/${cancelOrderTarget.id}/cancel/`), {
    method:"POST",
    headers:{ "Content-Type":"application/json" },
    body:JSON.stringify({
      cooked: cooked,
      refunded: cancelOrderTarget.payment_status === "PAID" ? cancelRefunded : false,
      refund_amount:
        cancelOrderTarget.payment_status === "PAID" && cancelRefunded
          ? Number(cancelRefundAmount || 0)
          : 0
    })
  })

  const data = await res.json()

  if(data.success){

    fetchOrders()
    setCancelRefunded(false)
    setCancelRefundAmount("")
    setCancelError("")

  }else{

    setCancelError(data.error || "Cancel failed")

  }

  if(data.success){
    setShowCancelModal(false)
  }

  }


  return (

	<div className="space-y-6 text-white">

	  <div className="rounded-[28px] border border-slate-800 bg-[radial-gradient(circle_at_top_left,_rgba(59,130,246,0.16),_transparent_32%),linear-gradient(135deg,_rgba(15,23,42,0.98),_rgba(15,23,42,0.88))] p-6 shadow-[0_24px_60px_rgba(15,23,42,0.35)]">
	    <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
	      <div>
	        <div className="text-xs uppercase tracking-[0.35em] text-sky-300">Orders Control</div>
	        <h2 className="mt-2 text-3xl font-semibold">Manage Orders</h2>
	        <p className="mt-2 text-sm text-slate-400">
	          Review live, scheduled, ready, and completed orders from one place with stronger visibility into totals and pending cash.
	        </p>
	      </div>
	      <div className="text-sm text-slate-400">
	        Showing <span className="font-semibold text-white">{manageView === "OPERATIONS" ? filteredOrders.length : filteredExternalOrders.length}</span> {manageView === "OPERATIONS" ? `order${(manageView === "OPERATIONS" ? filteredOrders.length : filteredExternalOrders.length) === 1 ? "" : "s"}` : `external request${filteredExternalOrders.length === 1 ? "" : "s"}`}
	      </div>
	    </div>
	  </div>

	  <div className="flex flex-wrap gap-3">
	    <button
	      onClick={() => setManageView("OPERATIONS")}
	      className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
	        manageView === "OPERATIONS"
	          ? "bg-sky-500 text-slate-950"
	          : "border border-slate-700 bg-slate-900/70 text-slate-200 hover:border-slate-500"
	      }`}
	    >
	      Operations
	    </button>
	    {showExternalQueue && (
	    <button
	      onClick={() => setManageView("EXTERNAL")}
	      className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
	        manageView === "EXTERNAL"
	          ? "bg-amber-400 text-slate-950"
	          : "border border-slate-700 bg-slate-900/70 text-slate-200 hover:border-slate-500"
	      }`}
	    >
	      External Orders
	    </button>
	    )}
	  </div>

	  {manageView === "OPERATIONS" ? (
	  <>
	  <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
	    <div className="rounded-3xl border border-slate-800 bg-slate-950/70 p-4">
	      <div className="text-xs uppercase tracking-[0.28em] text-slate-500">Loaded Orders</div>
	      <div className="mt-2 text-2xl font-semibold">{dashboardStats.totalOrders}</div>
	    </div>
	    <div className="rounded-3xl border border-slate-800 bg-slate-950/70 p-4">
	      <div className="text-xs uppercase tracking-[0.28em] text-slate-500">Scheduled</div>
	      <div className="mt-2 text-2xl font-semibold">{dashboardStats.scheduled}</div>
	    </div>
	    <div className="rounded-3xl border border-slate-800 bg-slate-950/70 p-4">
	      <div className="text-xs uppercase tracking-[0.28em] text-slate-500">Ready</div>
	      <div className="mt-2 text-2xl font-semibold">{dashboardStats.ready}</div>
	    </div>
	    <div className="rounded-3xl border border-slate-800 bg-slate-950/70 p-4">
	      <div className="text-xs uppercase tracking-[0.28em] text-slate-500">Not Fully Paid</div>
	      <div className="mt-2 text-2xl font-semibold">{dashboardStats.unpaid}</div>
	    </div>
	    <div className="rounded-3xl border border-slate-800 bg-slate-950/70 p-4">
	      <div className="text-xs uppercase tracking-[0.28em] text-slate-500">Order Value</div>
	      <div className="mt-2 text-2xl font-semibold">Rs {formatMoney(dashboardStats.totalValue)}</div>
	    </div>
	    <div className="rounded-3xl border border-slate-800 bg-slate-950/70 p-4">
	      <div className="text-xs uppercase tracking-[0.28em] text-slate-500">Remaining To Collect</div>
	      <div className="mt-2 text-2xl font-semibold">Rs {formatMoney(dashboardStats.remainingValue)}</div>
	    </div>
	  </div>

	  <div className="rounded-3xl border border-slate-800 bg-slate-950/70 p-5">
	    <div className="flex flex-col gap-2 border-b border-slate-800 pb-4 md:flex-row md:items-end md:justify-between">
	      <div>
	        <div className="text-lg font-semibold">Filters & Search</div>
	        <div className="mt-1 text-sm text-slate-400">
	          Narrow the queue by status, type, date range, or delivery coverage.
	        </div>
	      </div>
	      <div className="text-xs uppercase tracking-[0.28em] text-slate-500">Quick operations</div>
	    </div>

	    <div className="mt-4 flex flex-wrap items-end gap-3">
	      <div className="min-w-[260px] flex-1">
	        <div className="mb-1 text-xs text-slate-400">Search</div>
	        <input
	          placeholder="Search Order ID or Customer..."
	          value={search}
	          onChange={(e)=>setSearch(e.target.value)}
	          className="w-full rounded-2xl border border-slate-700 bg-slate-900 px-4 py-3 text-white outline-none transition focus:border-emerald-500"
	        />
	      </div>

	      <div>
	        <div className="mb-1 text-xs text-slate-400">Filter</div>
	        <select
	          value={filter}
	          onChange={(e)=>setFilter(e.target.value)}
	          className="rounded-2xl border border-slate-700 bg-slate-900 px-4 py-3 text-white"
	        >
	          <option value="ALL">All Orders</option>
	          <option value="PROCESSING">Processing</option>
	          <option value="READY">Ready</option>
	          <option value="COMPLETED">Completed</option>
	          <option value="CANCELLED">Cancelled</option>
	          <option value="PAID">Paid</option>
	          <option value="UNPAID">Unpaid</option>
	          <option value="SCHEDULED">Scheduled</option>
	          <option value="DINE_IN">Dine-In</option>
	          <option value="TAKEAWAY">Takeaway</option>
	          <option value="DELIVERY">Delivery</option>
	        </select>
	      </div>

	      <div>
	        <div className="mb-1 text-xs text-slate-400">From</div>
	        <input
	          type="date"
	          value={fromDate}
	          onChange={(e)=>setFromDate(e.target.value)}
	          className="rounded-2xl border border-slate-700 bg-slate-900 px-4 py-3 text-white"
	        />
	      </div>

	      <div>
	        <div className="mb-1 text-xs text-slate-400">To</div>
	        <input
	          type="date"
	          value={toDate}
	          onChange={(e)=>setToDate(e.target.value)}
	          className="rounded-2xl border border-slate-700 bg-slate-900 px-4 py-3 text-white"
	        />
	      </div>

	      {filter === "DELIVERY" && (
	        <div>
	          <div className="mb-1 text-xs text-slate-400">Delivery Boy</div>
	          <select
	            value={deliveryBoyFilter}
	            onChange={(e)=>setDeliveryBoyFilter(e.target.value)}
	            className="rounded-2xl border border-slate-700 bg-slate-900 px-4 py-3 text-white"
	          >
	            <option value="">All Delivery Boys</option>
	            {deliveryBoys.map((boy) => (
	              <option key={boy.id} value={boy.id}>
	                {boy.name}
	              </option>
	            ))}
	          </select>
	        </div>
	      )}

	      {filter === "DELIVERY" && deliveryBoyFilter && (
	        <div className="min-w-[240px]">
	          <div className="mb-1 text-xs text-slate-400">Exclude Address Text</div>
	          <input
	            value={excludeAddressText}
	            onChange={(e)=>setExcludeAddressText(e.target.value)}
	            placeholder="e.g. Chadoora"
	            className="w-full rounded-2xl border border-slate-700 bg-slate-900 px-4 py-3 text-white outline-none transition focus:border-emerald-500"
	          />
	        </div>
	      )}
	    </div>
	  </div>

	  {compactMode ? (
	  <div className="space-y-4">
	    {filteredOrders.length === 0 ? (
	      <div className="rounded-3xl border border-dashed border-slate-800 bg-slate-950/50 px-5 py-10 text-center text-sm text-slate-400">
	        No orders match the current filter yet.
	      </div>
	    ) : (
	      filteredOrders.map(order => (
	        <div key={order.id} className="rounded-3xl border border-slate-800 bg-slate-950/70 p-5">
	          <div className="flex flex-col gap-4">
	            <div className="flex flex-wrap items-center gap-2">
	              <div className="text-xl font-semibold text-white">#{order.id}</div>
	              <span className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${statusBadge(order.order_status)}`}>
	                {order.order_status}
	              </span>
	              <span className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${paymentBadge(order.payment_status)}`}>
	                {order.payment_status}
	              </span>
	              <span className="inline-flex rounded-full border border-slate-700 bg-slate-800 px-3 py-1 text-xs font-semibold text-slate-200">
	                {orderTypeLabel(order.order_type)}
	              </span>
	            </div>

	            <div className="rounded-[28px] border border-sky-500/20 bg-[linear-gradient(135deg,_rgba(14,165,233,0.14),_rgba(15,23,42,0.92))] px-5 py-4 shadow-[0_18px_40px_rgba(14,165,233,0.08)]">
	              <div className="text-[11px] font-semibold uppercase tracking-[0.3em] text-sky-200">
	                Order Focus
	              </div>
	              <div className="mt-3 flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
	                <div className="min-w-0">
	                  <div className="text-2xl font-semibold leading-tight text-white sm:text-3xl">
	                    {orderTypeLabel(order.order_type)}
	                  </div>
	                  <div className="mt-2 text-xl font-semibold leading-tight text-amber-100 sm:text-2xl">
	                    {orderPrimaryHighlight(order)}
	                  </div>
	                  <div className="mt-2 text-sm text-slate-300 sm:text-base">
	                    {orderSecondaryHighlight(order)}
	                  </div>
	                </div>
	                <div className="max-w-3xl rounded-2xl border border-slate-800/90 bg-slate-950/45 px-4 py-3 xl:max-w-xl">
	                  <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-400">
	                    Item Preview
	                  </div>
	                  <div className="mt-2 text-base font-semibold leading-7 text-white sm:text-lg">
	                    {orderItemsPreview(order)}
	                  </div>
	                </div>
	              </div>
	            </div>

	            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
	              <div className="rounded-2xl border border-slate-800 bg-slate-900/60 px-4 py-3">
	                <div className="text-xs uppercase tracking-[0.24em] text-slate-500">Locator</div>
	                <div className="mt-2 text-sm text-slate-200">{orderQuickLocator(order)}</div>
	              </div>
	              <div className="rounded-2xl border border-slate-800 bg-slate-900/60 px-4 py-3">
	                <div className="text-xs uppercase tracking-[0.24em] text-slate-500">Created</div>
	                <div className="mt-2 text-sm text-slate-200">
	                  {order.order_status === "SCHEDULED" && order.scheduled_time
	                    ? `For ${formatDateTime(order.scheduled_time)}`
	                    : formatDateTime(order.created_at)}
	                </div>
	              </div>
	              <div className="rounded-2xl border border-slate-800 bg-slate-900/60 px-4 py-3">
	                <div className="text-xs uppercase tracking-[0.24em] text-slate-500">Payment Mode</div>
	                <div className="mt-2 text-sm text-slate-200">{order.payment_mode || "-"}</div>
	              </div>
	              <div className="rounded-2xl border border-slate-800 bg-slate-900/60 px-4 py-3">
	                <div className="text-xs uppercase tracking-[0.24em] text-slate-500">Amounts</div>
	                <div className="mt-2 text-sm text-slate-200">Total: Rs {formatMoney(order.total_amount)}</div>
	                <div className="mt-1 text-sm font-semibold text-amber-200">Remaining: Rs {formatMoney(order.remaining_amount)}</div>
	              </div>
	            </div>

	            <div className="flex flex-wrap gap-2">
	              <button
	                onClick={()=>viewOrder(order.id)}
	                className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white"
	              >
	                View
	              </button>

	              {order.order_status === "SCHEDULED" && (
	                <button
	                  onClick={()=>startScheduledOrder(order)}
	                  className="rounded-xl bg-green-600 px-4 py-2 text-sm font-semibold text-white"
	                >
	                  Start Scheduled Order
	                </button>
	              )}

	              {["PROCESSING", "READY"].includes(order.order_status) && (
	                <button
	                  onClick={()=>updateOrder(order.id)}
	                  className="rounded-xl bg-yellow-600 px-4 py-2 text-sm font-semibold text-white"
	                >
	                  Update
	                </button>
	              )}

	              {["PROCESSING", "SCHEDULED"].includes(order.order_status) && (
	                <button
	                  onClick={()=>cancelOrder(order)}
	                  className="rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold text-white"
	                >
	                  Cancel
	                </button>
	              )}

	              {order.order_status === "PROCESSING" && (
	                <button
	                  onClick={()=>markOrderReady(order)}
	                  className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white"
	                >
	                  Ready
	                </button>
	              )}

	              {order.order_status === "READY" && (
	                <button
	                  onClick={()=>completeOrder(order)}
	                  className="rounded-xl bg-green-600 px-4 py-2 text-sm font-semibold text-white"
	                >
	                  Complete
	                </button>
	              )}

	              {order.payment_status !== "PAID"
	                && order.order_status !== "CANCELLED"
	                && !(order.order_status === "COMPLETED")
	                && (
	                <button
	                  onClick={()=>{
	                    if(!canCollectPayments){
	                      showCollectDeniedMessage()
	                      return
	                    }
	                    setSelectedOrder(order)
	                    setCollectAmount(order.remaining_amount || order.total_amount)
	                    setCollectMethod("CASH")
	                    setCollectCashAmount("")
	                    setCollectOnlineAmount("")
	                    setShowCollectModal(true)
	                  }}
	                  className={`rounded-xl px-4 py-2 text-sm font-semibold ${canCollectPayments ? "bg-purple-600 text-white" : "border border-slate-600 bg-slate-700 text-slate-200"}`}
	                >
	                  {canCollectPayments ? "Collect" : "Collect (Locked)"}
	                </button>
	              )}

	              <button
	                onClick={()=>printOrder(order.id)}
	                className="rounded-xl bg-white px-4 py-2 text-sm font-semibold text-black"
	              >
	                Print
	              </button>
	            </div>
	          </div>
	        </div>
	      ))
	    )}
	  </div>
	  ) : (
	  <div className="rounded-3xl border border-slate-800 bg-slate-950/70 overflow-x-auto">
	    <div className="min-w-[1180px]">
	    <div className="grid grid-cols-[1.2fr_0.9fr_0.9fr_0.9fr_0.9fr_1.1fr_1.4fr] gap-4 border-b border-slate-800 bg-slate-900/80 px-4 py-4 text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">
	      <div>Order</div>
	      <div>Status</div>
	      <div>Payment</div>
	      <div>Mode</div>
	      <div>Remaining</div>
	      <div>Total</div>
	      <div>Actions</div>
		    </div>

		    {filteredOrders.map(order => (

	      <div key={order.id} className="grid grid-cols-[1.2fr_0.9fr_0.9fr_0.9fr_0.9fr_1.1fr_1.4fr] gap-4 border-b border-slate-800 px-4 py-4">

	        <div>
	          <div className="text-base font-semibold text-white">#{order.id}</div>
	          <div className="mt-2 text-lg font-semibold leading-tight text-sky-100">{orderTypeLabel(order.order_type)}</div>
	          <div className="mt-1 text-base font-semibold leading-tight text-amber-100">
	            {orderPrimaryHighlight(order)}
	          </div>
	          <div className="mt-1 text-sm text-slate-300">
	            {orderSecondaryHighlight(order)}
	          </div>
	          <div className="mt-2 text-sm font-medium leading-6 text-white" title={orderItemsPreview(order)}>
	            {orderItemsPreview(order)}
	          </div>
	          <div className="mt-1 text-xs text-slate-500">
	            {order.order_status === "SCHEDULED" && order.scheduled_time
	              ? `For ${formatDateTime(order.scheduled_time)}`
	              : formatDateTime(order.created_at)}
	          </div>
	        </div>

	        <div>
	          <span className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${statusBadge(order.order_status)}`}>
	            {order.order_status}
	          </span>
	        </div>

	        <div>
	          <span className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${paymentBadge(order.payment_status)}`}>
	            {order.payment_status}
	          </span>
	        </div>

	        <div className="text-sm text-slate-300">{order.payment_mode || "-"}</div>
	        <div className="text-sm font-semibold text-amber-200">Rs {formatMoney(order.remaining_amount)}</div>
	        <div className="text-sm font-semibold text-white">Rs {formatMoney(order.total_amount)}</div>

	        <div className="flex gap-2 flex-wrap">

          <button
          onClick={()=>viewOrder(order.id)}
          className="bg-blue-600 px-3 py-1 rounded"
          >
          View
          </button>

          {order.order_status === "SCHEDULED" && (
          <button
            onClick={()=>startScheduledOrder(order)}
            className="bg-green-600 px-3 py-1 rounded"
          >
            Start Scheduled Order
          </button>
          )}

          {["PROCESSING", "READY"].includes(order.order_status) && (
          <button
          onClick={()=>updateOrder(order.id)}
          className="bg-yellow-600 px-3 py-1 rounded"
          >
          Update
          </button>
          )}

          {["PROCESSING", "SCHEDULED"].includes(order.order_status) && (
          <button
          onClick={()=>cancelOrder(order)}
          className="bg-red-600 px-3 py-1 rounded"
          >
          Cancel
          </button>
          )}

          {order.order_status === "PROCESSING" && (
          <button
          onClick={()=>markOrderReady(order)}
          className="bg-emerald-600 px-3 py-1 rounded"
          >
          Ready
          </button>
          )}

          {order.order_status === "READY" && (
          <button
          onClick={()=>completeOrder(order)}
          className="bg-green-600 px-3 py-1 rounded"
          >
          Complete
          </button>
          )}

          {order.payment_status !== "PAID"
            && order.order_status !== "CANCELLED"
            && !(order.order_status === "COMPLETED")
            && (
          <button
          onClick={()=>{
          if(!canCollectPayments){
          showCollectDeniedMessage()
          return
          }
          setSelectedOrder(order)
          setCollectAmount(order.remaining_amount || order.total_amount)
          setCollectMethod("CASH")
          setCollectCashAmount("")
          setCollectOnlineAmount("")
          setShowCollectModal(true)
          }}
          className={`px-3 py-1 rounded ${canCollectPayments ? "bg-purple-600" : "bg-slate-700 border border-slate-600 text-slate-200"}`}
          >
          {canCollectPayments ? "Collect" : "Collect (Locked)"}
          </button>
          )}

          <button
            onClick={()=>printOrder(order.id)}
            className="bg-white text-black px-3 py-1 rounded"
          >
            Print
          </button>

          </div>

      </div>

	    ))}

	    </div>
	  </div>
	  )}
	  </>
	  ) : (
	  <>
	  <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
	    <div className="rounded-3xl border border-slate-800 bg-slate-950/70 p-4">
	      <div className="text-xs uppercase tracking-[0.28em] text-slate-500">External Requests</div>
	      <div className="mt-2 text-2xl font-semibold">{externalStats.total}</div>
	    </div>
	    <div className="rounded-3xl border border-amber-500/20 bg-amber-500/10 p-4">
	      <div className="text-xs uppercase tracking-[0.28em] text-amber-100/70">Pending</div>
	      <div className="mt-2 text-2xl font-semibold text-amber-100">{externalStats.pending}</div>
	    </div>
	    <div className="rounded-3xl border border-emerald-500/20 bg-emerald-500/10 p-4">
	      <div className="text-xs uppercase tracking-[0.28em] text-emerald-100/70">Accepted</div>
	      <div className="mt-2 text-2xl font-semibold text-emerald-100">{externalStats.accepted}</div>
	    </div>
	    <div className="rounded-3xl border border-rose-500/20 bg-rose-500/10 p-4">
	      <div className="text-xs uppercase tracking-[0.28em] text-rose-100/70">Declined</div>
	      <div className="mt-2 text-2xl font-semibold text-rose-100">{externalStats.declined}</div>
	    </div>
	  </div>

	  <div className="rounded-3xl border border-slate-800 bg-slate-950/70 p-5">
	    <div className="flex flex-col gap-2 border-b border-slate-800 pb-4 md:flex-row md:items-end md:justify-between">
	      <div>
	        <div className="text-lg font-semibold">External Orders Queue</div>
	        <div className="mt-1 text-sm text-slate-400">
	          Review accepted, declined, and still-pending external requests without mixing them into the live kitchen flow.
	        </div>
	      </div>
	      <div className="text-xs uppercase tracking-[0.28em] text-slate-500">Decision control</div>
	    </div>

	    <div className="mt-4 flex flex-wrap items-end gap-3">
	      <div className="min-w-[260px] flex-1">
	        <div className="mb-1 text-xs text-slate-400">Search</div>
	        <input
	          placeholder="Search order ID, customer, or submitter..."
	          value={search}
	          onChange={(e)=>setSearch(e.target.value)}
	          className="w-full rounded-2xl border border-slate-700 bg-slate-900 px-4 py-3 text-white outline-none transition focus:border-emerald-500"
	        />
	      </div>

	      <div>
	        <div className="mb-1 text-xs text-slate-400">Decision Status</div>
	        <select
	          value={externalDecisionFilter}
	          onChange={(e)=>setExternalDecisionFilter(e.target.value)}
	          className="rounded-2xl border border-slate-700 bg-slate-900 px-4 py-3 text-white"
	        >
	          <option value="ALL">All External Orders</option>
	          <option value="PENDING">Pending</option>
	          <option value="ACCEPTED">Accepted</option>
	          <option value="DECLINED">Declined</option>
	        </select>
	      </div>
	    </div>
	  </div>

	  <div className="space-y-4">
	    {externalLoading ? (
	      <PanelLoader
	        eyebrow="External Queue"
	        label="Loading external orders..."
	        description="Checking the latest remote requests waiting for acceptance or review."
	      />
	    ) : filteredExternalOrders.length === 0 ? (
	      <div className="rounded-3xl border border-dashed border-slate-800 bg-slate-950/50 px-5 py-10 text-center text-sm text-slate-400">
	        No external orders match the current filter yet.
	      </div>
	    ) : (
	      filteredExternalOrders.map((order) => (
	        <div key={order.id} className="rounded-3xl border border-slate-800 bg-slate-950/70 p-5">
	          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
	            <div className="min-w-0">
	              <div className="flex flex-wrap items-center gap-2">
	                <div className="text-xl font-semibold text-white">Order #{order.id}</div>
	                <span className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${acceptanceBadge(order.acceptance_status)}`}>
	                  {order.acceptance_status_display || order.acceptance_status}
	                </span>
	                <span className="inline-flex rounded-full border border-slate-700 bg-slate-800 px-3 py-1 text-xs font-semibold text-slate-200">
	                  {orderTypeLabel(order.order_type)}
	                </span>
	              </div>
	              <div className="mt-3 grid gap-3 text-sm text-slate-300 md:grid-cols-2 xl:grid-cols-4">
	                <div>
	                  <div className="text-xs uppercase tracking-[0.24em] text-slate-500">Submitted By</div>
	                  <div className="mt-1 font-medium text-white">{order.submitted_by_name || order.submitted_by_username || "Unknown user"}</div>
	                </div>
	                <div>
	                  <div className="text-xs uppercase tracking-[0.24em] text-slate-500">Customer</div>
	                  <div className="mt-1 font-medium text-white">{order.customer_name || "Unnamed customer"}</div>
	                </div>
	                <div>
	                  <div className="text-xs uppercase tracking-[0.24em] text-slate-500">Created</div>
	                  <div className="mt-1">{formatDateTime(order.created_at)}</div>
	                </div>
	                <div>
	                  <div className="text-xs uppercase tracking-[0.24em] text-slate-500">Amount</div>
	                  <div className="mt-1 font-semibold text-amber-200">Rs {formatMoney(order.total_amount)}</div>
	                </div>
	              </div>
	              <div className="mt-4 grid gap-3 md:grid-cols-2">
	                <div className="rounded-2xl border border-slate-800 bg-slate-900/60 px-4 py-3">
	                  <div className="text-xs uppercase tracking-[0.24em] text-slate-500">Locator</div>
	                  <div className="mt-2 text-sm text-slate-200">{orderQuickLocator(order)}</div>
	                </div>
	                <div className="rounded-2xl border border-slate-800 bg-slate-900/60 px-4 py-3">
	                  <div className="text-xs uppercase tracking-[0.24em] text-slate-500">Items</div>
	                  <div className="mt-2 text-sm text-slate-200">
	                    {(order.items || []).map((item) => `${item.item_name} x${item.quantity}`).join(", ") || "No items"}
	                  </div>
	                </div>
	              </div>
	              {order.order_note ? (
	                <div className="mt-4 rounded-2xl border border-slate-800 bg-slate-900/60 px-4 py-3 text-sm text-slate-300">
	                  <div className="text-xs uppercase tracking-[0.24em] text-slate-500">ORDER NOTE:</div>
	                  <div className="mt-2">{order.order_note}</div>
	                </div>
	              ) : null}
	              {order.acceptance_decided_by_name ? (
	                <div className="mt-3 text-xs uppercase tracking-[0.22em] text-slate-500">
	                  Last decision by {order.acceptance_decided_by_name} on {formatDateTime(order.acceptance_decided_at)}
	                </div>
	              ) : null}
	            </div>

	            <div className="flex flex-wrap gap-2 lg:justify-end">
	              <button
	                onClick={() => viewOrder(order.id)}
	                className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white"
	              >
	                View
	              </button>
	              {allowExternalDecisions && (order.acceptance_status === "PENDING" || order.acceptance_status === "DECLINED") && (
	                <button
	                  onClick={() => handleExternalDecision(order.id, "ACCEPT")}
	                  disabled={externalActionId === order.id}
	                  className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
	                >
	                  {order.acceptance_status === "DECLINED" ? "Accept Again" : "Accept"}
	                </button>
	              )}
	              {allowExternalDecisions && order.acceptance_status === "PENDING" && (
	                <button
	                  onClick={() => handleExternalDecision(order.id, "DECLINE")}
	                  disabled={externalActionId === order.id}
	                  className="rounded-xl bg-rose-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
	                >
	                  Decline
	                </button>
	              )}
	            </div>
	          </div>
	        </div>
	      ))
	    )}
	  </div>
	  </>
	  )}


{/* VIEW ORDER MODAL */}

{showModal && selectedOrder && (

<div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 px-4 py-6 backdrop-blur-sm">

<div className="max-h-[88vh] w-full max-w-5xl overflow-y-auto rounded-[28px] border border-slate-800 bg-gradient-to-b from-slate-900 via-slate-900 to-slate-950 shadow-2xl shadow-black/40">

<div className="sticky top-0 z-10 border-b border-slate-800 bg-slate-950/95 px-6 py-5 backdrop-blur">
<div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
<div className="min-w-0">
<div className="text-xs font-semibold uppercase tracking-[0.3em] text-sky-300/80">
Order Details
</div>
<h2 className="mt-2 text-2xl font-semibold text-white">
Order #{selectedOrder.id}
</h2>
<div className="mt-3 flex flex-wrap gap-2">
<span className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${statusBadge(selectedOrder.order_status)}`}>
{selectedOrder.order_status}
</span>
<span className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${paymentBadge(selectedOrder.payment_status)}`}>
{selectedOrder.payment_status}
</span>
<span className="inline-flex rounded-full border border-slate-700 bg-slate-800 px-3 py-1 text-xs font-semibold text-slate-200">
{orderTypeLabel(selectedOrder.order_type)}
</span>
</div>
</div>

<button
onClick={() => setShowModal(false)}
className="inline-flex items-center justify-center self-start rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-2 text-sm font-semibold text-rose-200 transition hover:bg-rose-500/20"
>
Close
</button>

</div>
</div>

<div className="space-y-5 px-6 py-6">
<div className="grid gap-4 lg:grid-cols-2">
<SectionCard
title="Overview"
subtitle="Fast scan of the order state and timing."
icon={(
<svg viewBox="0 0 24 24" fill="none" className="h-5 w-5" stroke="currentColor" strokeWidth="1.8">
<path d="M12 8v4l2.5 2.5" strokeLinecap="round" strokeLinejoin="round" />
<path d="M21 12a9 9 0 1 1-18 0a9 9 0 0 1 18 0Z" strokeLinecap="round" strokeLinejoin="round" />
</svg>
)}
>
<div className="grid gap-3 sm:grid-cols-2">
<DetailField label="Order Type" value={orderTypeLabel(selectedOrder.order_type)} />
<DetailField label="Payment Mode" value={selectedOrder.payment_mode || "-"} />
<DetailField label="Order Status" value={selectedOrder.order_status} />
<DetailField label="Payment Status" value={selectedOrder.payment_status} />
<DetailField label="Submission Source" value={selectedOrder.submission_source_display || selectedOrder.submission_source || "-"} />
<DetailField label="Acceptance" value={selectedOrder.acceptance_status_display || selectedOrder.acceptance_status || "-"} />
<DetailField label="Created At" value={formatFullDateTime(selectedOrder.created_at)} />
<DetailField label="Scheduled For" value={formatFullDateTime(selectedOrder.scheduled_time)} />
{selectedOrder.order_status === "CANCELLED" && (
<>
<DetailField label="Cooked" value={selectedOrder.cooked ? "Yes" : "No"} />
<DetailField label="Refunded" value={selectedOrder.refunded ? "Yes" : "No"} />
<DetailField
label="Refund Amount"
value={`₹${formatMoney(selectedOrder.refund_amount || 0)}`}
valueClassName="text-amber-200"
/>
</>
)}
</div>
</SectionCard>

<SectionCard
title="Customer"
subtitle="Contact details without hunting through the modal."
icon={(
<svg viewBox="0 0 24 24" fill="none" className="h-5 w-5" stroke="currentColor" strokeWidth="1.8">
<path d="M12 12a4 4 0 1 0-4-4a4 4 0 0 0 4 4Z" strokeLinecap="round" strokeLinejoin="round" />
<path d="M4 20a8 8 0 0 1 16 0" strokeLinecap="round" strokeLinejoin="round" />
</svg>
)}
>
<div className="grid gap-3 sm:grid-cols-2">
<DetailField label="Name" value={selectedOrder.customer_name || "-"} />
<DetailField label="Phone" value={selectedOrder.customer_phone || "-"} />
<DetailField label="Area" value={selectedOrder.area_name || "-"} />
<DetailField label="Submitted By" value={selectedOrder.submitted_by_name || selectedOrder.submitted_by_username || "-"} />
<DetailField label="Decision By" value={selectedOrder.acceptance_decided_by_name || "-"} />
<DetailField label="Account" value={selectedOrder.customer_account_name || "-"} className="sm:col-span-2" />
</div>
</SectionCard>

<SectionCard
title="Location"
subtitle="Pickup, table, and delivery context in one place."
icon={(
<svg viewBox="0 0 24 24" fill="none" className="h-5 w-5" stroke="currentColor" strokeWidth="1.8">
<path d="M12 21s6-5.2 6-11a6 6 0 1 0-12 0c0 5.8 6 11 6 11Z" strokeLinecap="round" strokeLinejoin="round" />
<circle cx="12" cy="10" r="2.5" />
</svg>
)}
>
<div className="grid gap-3 sm:grid-cols-2">
<DetailField label="Table" value={selectedOrder.table_number || "-"} />
<DetailField label="Delivery Boy" value={selectedOrder.delivery_boy_name || "-"} />
<DetailField
label="Delivery Address"
value={selectedOrder.delivery_address || "-"}
valueClassName="leading-6"
className="sm:col-span-2"
/>
</div>
</SectionCard>

<SectionCard
title="Totals"
subtitle="Charges and final order value."
icon={(
<svg viewBox="0 0 24 24" fill="none" className="h-5 w-5" stroke="currentColor" strokeWidth="1.8">
<path d="M4 7h16" strokeLinecap="round" />
<path d="M7 4v6" strokeLinecap="round" />
<path d="M17 4v6" strokeLinecap="round" />
<path d="M6 11h12a2 2 0 0 1 2 2v3a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4v-3a2 2 0 0 1 2-2Z" strokeLinecap="round" strokeLinejoin="round" />
</svg>
)}
>
<div className="space-y-3">
<div className="grid gap-3 sm:grid-cols-3">
<DetailField label="Subtotal" value={`₹${formatMoney(selectedOrder.subtotal)}`} />
<DetailField label="Discount" value={`₹${formatMoney(selectedOrder.discount)}`} />
<DetailField label="Delivery Charge" value={`₹${formatMoney(selectedOrder.delivery_charge)}`} />
</div>
<div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-4">
<div className="text-xs font-semibold uppercase tracking-[0.24em] text-emerald-200/80">
Total Amount
</div>
<div className="mt-2 text-3xl font-semibold text-white">
₹{formatMoney(selectedOrder.total_amount)}
</div>
</div>
</div>
</SectionCard>
</div>

{selectedOrder.order_note && (
<SectionCard
title="Order Note"
subtitle="Extra instructions captured with the order."
icon={(
<svg viewBox="0 0 24 24" fill="none" className="h-5 w-5" stroke="currentColor" strokeWidth="1.8">
<path d="M8 7h8M8 11h8M8 15h5" strokeLinecap="round" />
<path d="M6 3h12a2 2 0 0 1 2 2v14l-4-3H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z" strokeLinecap="round" strokeLinejoin="round" />
</svg>
)}
>
<div className="rounded-2xl border border-slate-800 bg-slate-950/70 px-4 py-4 text-sm leading-7 text-slate-200">
{selectedOrder.order_note}
</div>
</SectionCard>
)}

<SectionCard
title="Items"
subtitle={`${selectedOrder.items?.length || 0} line item${selectedOrder.items?.length === 1 ? "" : "s"} in this order.`}
icon={(
<svg viewBox="0 0 24 24" fill="none" className="h-5 w-5" stroke="currentColor" strokeWidth="1.8">
<path d="M5 5h14v14H5z" strokeLinecap="round" strokeLinejoin="round" />
<path d="M9 9h6M9 13h6M9 17h3" strokeLinecap="round" />
</svg>
)}
>
<div className="space-y-3">
{selectedOrder.items?.length === 0 && (
<div className="rounded-2xl border border-dashed border-slate-700 px-4 py-5 text-sm text-slate-400">
No items recorded
</div>
)}

{selectedOrder.items?.map(item => (
<div key={item.id} className="grid gap-3 rounded-2xl border border-slate-800 bg-slate-950/70 px-4 py-4 sm:grid-cols-[minmax(0,1fr)_100px_120px] sm:items-center">
<div className="min-w-0">
<div className="text-base font-semibold text-white">
{item.item_name}
</div>
</div>
<div className="text-sm font-medium text-slate-300">
Qty {item.quantity}
</div>
<div className="text-sm font-semibold text-amber-200 sm:text-right">
₹{formatMoney(item.total_price)}
</div>
</div>
))}
</div>
</SectionCard>

<SectionCard
title="Payments"
subtitle="Payment method breakdown with mixed payment detail preserved."
icon={(
<svg viewBox="0 0 24 24" fill="none" className="h-5 w-5" stroke="currentColor" strokeWidth="1.8">
<path d="M3 7.5A2.5 2.5 0 0 1 5.5 5h13A2.5 2.5 0 0 1 21 7.5v9A2.5 2.5 0 0 1 18.5 19h-13A2.5 2.5 0 0 1 3 16.5z" strokeLinecap="round" strokeLinejoin="round" />
<path d="M3 9h18" strokeLinecap="round" />
<path d="M16 14h2" strokeLinecap="round" />
</svg>
)}
>
<div className="space-y-3">
{selectedOrder.payments?.length === 0 && (
<div className="rounded-2xl border border-dashed border-slate-700 px-4 py-5 text-sm text-slate-400">
No payments recorded
</div>
)}

{selectedOrder.payments?.map(p => (
<div key={p.id} className="grid gap-3 rounded-2xl border border-slate-800 bg-slate-950/70 px-4 py-4 sm:grid-cols-[minmax(0,1fr)_120px] sm:items-center">
<div className="min-w-0">
<div className="text-base font-semibold text-white">
{p.payment_type}
</div>
{p.payment_type === "MIXED" && (
<div className="mt-1 text-sm text-slate-400">
Cash ₹{formatMoney(p.cash_amount)} + Online ₹{formatMoney(p.online_amount)}
</div>
)}
</div>
<div className="text-sm font-semibold text-emerald-200 sm:text-right">
₹{formatMoney(p.amount)}
</div>
</div>
))}
</div>
</SectionCard>
</div>

</div>

</div>

)}

{/* UPDATE MODAL */}

{showUpdateModal && selectedOrder && (

<div className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-60 px-4 py-6">

<div className="max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-xl bg-gray-900 p-6">

<div className="flex justify-between mb-4">

<h2 className="text-xl font-bold">
Update Order #{selectedOrder.id}
</h2>

<button onClick={()=>setShowUpdateModal(false)} className="text-red-400">✕</button>

</div>

<div className="space-y-3 text-sm">

{updateFormError && (
<div className="rounded border border-red-500/50 bg-red-500/10 px-3 py-2 text-red-300">
{updateFormError}
</div>
)}

<div>
<label className="block mb-1">Order Type</label>
<select
value={updateOrderType}
onChange={(e)=>handleUpdateOrderTypeChange(e.target.value)}
className={inputStyle}
>
<option value="DINE_IN">Dine In</option>
<option value="TAKEAWAY">Takeaway</option>
<option value="DELIVERY">Delivery</option>
</select>
{updateErrors.order_type && (
<div className="mt-1 text-xs text-red-400">{updateErrors.order_type}</div>
)}
</div>

<div>
<label className="block mb-1">Customer Name</label>
<input
value={updateName}
onChange={(e)=>{
setUpdateName(e.target.value)
clearUpdateError("customer_name")
setUpdateFormError("")
}}
className={inputStyle}
/>
</div>

<div>
<CustomerPhoneAutocomplete
value={updatePhone}
onChange={(value)=>{
setUpdatePhone(value)
clearUpdateError("customer_phone")
setUpdateFormError("")
}}
onSelectCustomer={handleUpdateCustomerSelect}
label="Phone"
error={updateErrors.customer_phone}
helperText={
  updateOrderType === "DELIVERY"
    ? "Search existing customer phone numbers. Area and address can be filled from the matched record."
    : "Search existing customer phone numbers if this customer already exists."
}
/>
</div>

{updateOrderType==="DINE_IN" && (
<div className="rounded-xl border border-slate-800 bg-slate-900/50 px-3 py-3 text-xs leading-6 text-slate-400">
Phone is optional for Dine-In, but adding it helps reuse customer history and future advance automatically.
</div>
)}

{updateOrderType==="DINE_IN" && (
<div>
<label className="block mb-1">Table Number</label>
<input
value={updateTable}
onChange={(e)=>{
setUpdateTable(e.target.value)
clearUpdateError("table_number")
setUpdateFormError("")
}}
className={inputStyle}
/>
</div>

)}

{updateOrderType==="DELIVERY" && (

<>
<div>
<label className="block mb-1">Delivery Boy</label>
<select
value={updateDeliveryBoyId}
onChange={(e)=>{
setUpdateDeliveryBoyId(e.target.value)
clearUpdateError("delivery_boy_id")
setUpdateFormError("")
}}
className={inputStyle}
>
<option value="">Unassigned</option>
{deliveryBoys.map((boy) => (
<option key={boy.id} value={boy.id}>
{boy.name}
</option>
))}
</select>
{updateErrors.delivery_boy_id && (
<div className="mt-1 text-xs text-red-400">{updateErrors.delivery_boy_id}</div>
)}
</div>

<div>
<AreaAutocomplete
label="Area"
selectedAreaId={updateAreaId}
selectedAreaName={updateAreaName}
onSelectArea={(area)=>{
setUpdateAreaId(String(area.id))
setUpdateAreaName(area.name)
clearUpdateError("area_id")
setUpdateFormError("")
}}
onClearArea={()=>{
setUpdateAreaId("")
setUpdateAreaName("")
clearUpdateError("area_id")
setUpdateFormError("")
}}
error={updateErrors.area_id}
helperText="Pick the saved delivery area. The detailed address below is optional."
/>
</div>

<div>
<label className="block mb-1">Delivery Address <span className="text-slate-400">(Optional)</span></label>
<textarea
value={updateAddress}
onChange={(e)=>{
setUpdateAddress(e.target.value)
clearUpdateError("delivery_address")
setUpdateFormError("")
}}
className={`${inputStyle} resize-none`}
/>
</div>

<div>
<label className="block mb-1">Delivery Charge</label>
<input
type="number"
value={updateDeliveryCharge}
onChange={(e)=>{
setUpdateDeliveryCharge(e.target.value)
clearUpdateError("delivery_charge")
setUpdateFormError("")
}}
className={inputStyle}
/>
{updateErrors.delivery_charge && (
<div className="mt-1 text-xs text-red-400">{updateErrors.delivery_charge}</div>
)}
</div>
</>

)}

<div>
<label className="block mb-1">Discount</label>
<input
type="number"
value={updateDiscount}
onChange={(e)=>{
setUpdateDiscount(e.target.value)
clearUpdateError("discount")
setUpdateFormError("")
}}
className={inputStyle}
/>
{updateErrors.discount && (
<div className="mt-1 text-xs text-red-400">{updateErrors.discount}</div>
)}
</div>

<div>
<label className="block mb-1">Order Note</label>
<textarea
value={updateOrderNote}
onChange={(e)=>{
setUpdateOrderNote(e.target.value)
setUpdateFormError("")
}}
rows={3}
placeholder="Optional note for kitchen or billing"
className={`${inputStyle} resize-none`}
/>
</div>

<div className="border-t border-gray-700 pt-4">

<div className="font-semibold mb-2">Items</div>

{updateErrors.items && (
<div className="mb-2 text-xs text-red-400">{updateErrors.items}</div>
)}

{updateItems.length === 0 && (
<div className="mb-2 rounded border border-dashed border-gray-700 px-3 py-3 text-sm text-gray-400">
No items left. Add at least one item before updating the order.
</div>
)}

{updateItems.map((item,index)=>(

<div key={index} className="flex justify-between mb-2 bg-gray-800 p-2 rounded">

<span>{item.item_name}</span>

<div className="flex gap-2">

<button onClick={()=>decreaseQty(index)} className="px-2 bg-red-600 rounded">-</button>

<span>{item.quantity}</span>

<button onClick={()=>increaseQty(index)} className="px-2 bg-green-600 rounded">+</button>

</div>

</div>

))}

</div>

<button
type="button"
onClick={(e)=>{
  e.stopPropagation()
  setShowMenuModal(true)
}}
className="w-full bg-blue-600 py-2 rounded"
>
Add Items From Menu
</button>

<div className="flex justify-end mt-4">

<button
onClick={saveUpdatedOrder}
className="px-5 py-2 rounded bg-green-600"
>
Update Order
</button>

</div>

</div>

</div>

</div>

)}

{/* COLLECT MODAL */}

{showCollectModal && selectedOrder && (

<div className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-70 px-4">

<div className="w-full max-w-md rounded-xl bg-gray-900 p-6">

<div className="flex justify-between mb-4">

<h2 className="text-lg font-bold">
Collect Payment (Order #{selectedOrder.id})
</h2>

<button
onClick={()=>setShowCollectModal(false)}
className="text-red-400"
>
✕
</button>

</div>

	<div className="space-y-4">

	<div className="text-sm text-gray-300">
	Remaining Amount: ₹{selectedOrder.remaining_amount || selectedOrder.total_amount}
	</div>

	<input
	type="number"
value={collectAmount}
onChange={(e)=>setCollectAmount(e.target.value)}
className="w-full p-2 rounded bg-gray-800"
/>

<select
value={collectMethod}
onChange={(e)=>setCollectMethod(e.target.value)}
className="w-full p-2 rounded bg-gray-800"
>
<option value="CASH">Cash</option>
<option value="ONLINE">Online</option>
<option value="MIXED">Mixed</option>
</select>

	{collectMethod === "MIXED" && (
	<div className="grid grid-cols-1 gap-3 sm:grid-cols-2">

<input
type="number"
placeholder="Cash Amount"
value={collectCashAmount}
onChange={(e)=>setCollectCashAmount(e.target.value)}
className="w-full p-2 rounded bg-gray-800"
/>

<input
type="number"
placeholder="Online Amount"
value={collectOnlineAmount}
onChange={(e)=>setCollectOnlineAmount(e.target.value)}
className="w-full p-2 rounded bg-gray-800"
/>

	</div>
	)}

	<div className="text-xs text-gray-400">
	Less than the remaining amount is not allowed.
	</div>

	<button
onClick={submitCollectPayment}
className="w-full bg-green-600 py-3 rounded"
>
Confirm Payment
</button>

</div>

</div>

</div>

)}

{showCollectDeniedToast && (
<div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/45 px-4 backdrop-blur-[2px]">
<div className="w-full max-w-md rounded-[28px] border border-rose-500/35 bg-slate-950/95 px-8 py-8 text-center shadow-[0_30px_90px_rgba(15,23,42,0.6)]">
<div className="mx-auto flex h-24 w-24 items-center justify-center rounded-full border border-amber-400/30 bg-amber-500/10 text-amber-200">
<svg
viewBox="0 0 24 24"
fill="none"
stroke="currentColor"
strokeWidth="1.8"
className="h-12 w-12"
aria-hidden="true"
>
<path
strokeLinecap="round"
strokeLinejoin="round"
d="M7.5 10V7a4.5 4.5 0 1 1 9 0v3m-10.5 0h12a1.5 1.5 0 0 1 1.5 1.5v7A1.5 1.5 0 0 1 18 20h-12a1.5 1.5 0 0 1-1.5-1.5v-7A1.5 1.5 0 0 1 6 10Z"
/>
</svg>
</div>
<div className="mt-5 text-[11px] font-semibold uppercase tracking-[0.34em] text-rose-300">
Payment Access Locked
</div>
<div className="mt-3 text-xl font-semibold text-white">
You don&apos;t have the right to collect payments
</div>
</div>
</div>
)}


{/* COMPLETE MODAL */}

{showCompleteModal && selectedOrder && (

<div className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-70 px-4">

<div className="w-full max-w-md rounded-xl bg-gray-900 p-6">

<div className="flex justify-between mb-4">

<h2 className="text-lg font-bold">
Complete Order #{selectedOrder.id}
</h2>

<button
onClick={()=>setShowCompleteModal(false)}
className="text-red-400"
>
✕
</button>

</div>

<div className="space-y-3">

<div className="text-sm text-gray-300">
Order is unpaid. Assign this balance to customer ledger.
</div>

<input
placeholder="Customer Name"
value={completeName}
onChange={(e)=>setCompleteName(e.target.value)}
className="w-full p-2 rounded bg-gray-800"
/>

<input
placeholder="Phone"
value={completePhone}
onChange={(e)=>setCompletePhone(e.target.value)}
className="w-full p-2 rounded bg-gray-800"
/>

<textarea
placeholder="Address"
value={completeAddress}
onChange={(e)=>setCompleteAddress(e.target.value)}
className="w-full p-2 rounded bg-gray-800"
/>

<button
onClick={async ()=>{

if(!completePhone){
alert("Phone required")
return
}

const res = await fetch(
buildApiUrl(`orders/${selectedOrder.id}/complete/`),
{
method:"POST",
headers:{ "Content-Type":"application/json" },
body:JSON.stringify({
name:completeName,
phone:completePhone,
address:completeAddress
})
}
)

const data = await res.json()

if(data.success){

setShowCompleteModal(false)

fetchOrders()

}else{
alert(data.error || "Failed")
}

}}
className="w-full bg-green-600 py-3 rounded"
>
Complete Order
</button>

</div>

</div>

</div>

)}


{/* CANCEL MODAL */}

{showCancelModal && cancelOrderTarget && (

<div className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-70 px-4">

<div className="w-full max-w-md rounded-xl bg-gray-900 p-6 text-white">

<div className="flex justify-between mb-4">

<h2 className="text-lg font-bold">
Cancel Order #{cancelOrderTarget.id}
</h2>

<button
onClick={()=>setShowCancelModal(false)}
className="text-red-400"
>
✕
</button>

</div>

<div className="space-y-4">

<div className="text-gray-300">
Was the order cooked?
</div>

{cancelError && (
<div className="rounded border border-red-500/50 bg-red-500/10 px-3 py-2 text-sm text-red-300">
{cancelError}
</div>
)}

{cancelOrderTarget.payment_status === "PAID" && (
<div className="space-y-3 rounded-xl border border-slate-700 bg-slate-800/60 p-4">
<div className="text-sm text-slate-300">
Was the customer refunded?
</div>

<div className="flex gap-3">
<button
onClick={()=>{
setCancelRefunded(true)
setCancelError("")
if(!cancelRefundAmount){
setCancelRefundAmount(cancelOrderTarget.total_amount)
}
}}
className={`flex-1 py-2 rounded ${cancelRefunded ? "bg-emerald-600" : "bg-slate-700"}`}
>
Refunded
</button>

<button
onClick={()=>{
setCancelRefunded(false)
setCancelError("")
setCancelRefundAmount(cancelOrderTarget.total_amount)
}}
className={`flex-1 py-2 rounded ${!cancelRefunded ? "bg-amber-600" : "bg-slate-700"}`}
>
Not Refunded
</button>
</div>

{cancelRefunded && (
<div>
<div className="mb-2 text-xs uppercase tracking-[0.24em] text-slate-500">Refund Amount</div>
<input
type="number"
value={cancelRefundAmount}
onChange={(e)=>{
setCancelRefundAmount(e.target.value)
setCancelError("")
}}
className="w-full rounded bg-slate-900 p-2"
/>
</div>
)}
</div>
)}

<div className="flex gap-3">

<button
onClick={()=>confirmCancel(true)}
className="flex-1 bg-red-600 py-2 rounded"
>
Cooked
</button>

<button
onClick={()=>confirmCancel(false)}
className="flex-1 bg-yellow-600 py-2 rounded"
>
Not Cooked
</button>

</div>

</div>

</div>

</div>

)}



{showLedgerWarning && selectedOrder && (

<div className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-70 px-4">

  <div className="w-full max-w-md rounded-xl bg-gray-900 p-6 text-white">

    <h2 className="text-lg font-bold mb-3">
      Unpaid Order
    </h2>

    <p className="text-gray-300 mb-6">
      This order has not been paid.
      The balance will be assigned to the customer's ledger.
    </p>

    <div className="flex gap-3">

      <button
        onClick={()=>setShowLedgerWarning(false)}
        className="flex-1 bg-gray-700 py-2 rounded"
      >
        Cancel
      </button>

      <button
        onClick={confirmLedgerAssign}
        className="flex-1 bg-green-600 py-2 rounded"
      >
        Confirm
      </button>

    </div>

  </div>

</div>

)}


{/* MENU MODAL */}

{showMenuModal && (

<div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-70 px-4 py-6">

  <div className="flex h-[min(520px,calc(100vh-3rem))] w-full max-w-5xl flex-col rounded-xl bg-gray-900 md:flex-row">

    {/* CATEGORIES */}

    <div className="w-full overflow-y-auto border-b border-gray-800 p-4 md:w-[200px] md:border-b-0 md:border-r">

      <div className="relative mb-3">
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-3.5-3.5" />
        </svg>
        <input
          placeholder="Search categories..."
          value={categorySearch}
          onChange={(e) => setCategorySearch(e.target.value)}
          className="w-full rounded-lg border border-gray-700 bg-gray-800 py-2 pl-10 pr-3 text-sm text-white outline-none transition"
        />
      </div>

      {filteredCategories.length === 0 && (
        <div className="rounded-lg border border-dashed border-gray-700 px-3 py-6 text-center text-sm text-gray-400">
          No categories match this search.
        </div>
      )}

      {filteredCategories.map(cat => (

        <button
          key={cat}
          onClick={()=>setSelectedCategory(cat)}
          className={`block w-full text-left px-3 py-2 mb-2 rounded ${
            selectedCategory===cat ? "bg-blue-600" : "bg-gray-700"
          }`}
        >
          {cat}
        </button>

      ))}

    </div>


    {/* MENU ITEMS */}

    <div className="min-h-0 flex-1 overflow-y-auto p-4">

      {products
        .filter(p => p.category === selectedCategory)
        .map(product => (

          <div
            key={product.id}
            className="flex justify-between items-center border border-gray-800 rounded p-3 mb-3"
          >

            <div>
              <div>{product.name}</div>
              <div className="text-sm text-gray-400">₹{product.price}</div>
            </div>

            <button
              onClick={()=>addMenuItem(product)}
              className="bg-green-600 px-4 py-2 rounded"
            >
              +
            </button>

          </div>

      ))}

    </div>


    {/* RIGHT PANEL */}

    <div className="flex w-full flex-col border-t border-gray-800 p-4 md:w-[220px] md:border-l md:border-t-0">

      <div className="font-semibold mb-3">
        Items Added
      </div>

      <div className="flex-1 overflow-y-auto text-sm">

        {updateItems.map((i,index)=>(
          <div key={index} className="flex justify-between mb-2">
            <span>{i.item_name}</span>
            <span>x{i.quantity}</span>
          </div>
        ))}

      </div>

      <button
        onClick={()=>setShowMenuModal(false)}
        className="mt-4 bg-blue-600 py-2 rounded"
      >
        Done
      </button>

    </div>

  </div>

</div>

)}
</div>

)
}
