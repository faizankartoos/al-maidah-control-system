import { useEffect, useMemo, useState } from "react";
import api from "../services/api";
import { InlineButtonContent, InlineLoaderLabel, PanelLoader } from "./SystemLoader";

const today = new Date().toISOString().split("T")[0];
const ACCOUNT_MANAGEMENT_PASSWORD = "admin@almaidah";

const ACCOUNT_TYPE_OPTIONS = [
  { value: "CUSTOMER", label: "Customer" },
  { value: "DELIVERY", label: "Delivery Boy" },
  { value: "VENDOR", label: "Vendor" },
];

const ENTRY_TYPE_OPTIONS = [
  { value: "", label: "All Entry Types" },
  { value: "CREDIT", label: "Credit" },
  { value: "DEBIT", label: "Debit" },
];

const PAYMENT_TYPE_OPTIONS = [
  { value: "", label: "All Payment Types" },
  { value: "CASH", label: "Cash" },
  { value: "ONLINE", label: "Online" },
  { value: "SYSTEM", label: "System" },
];

function createEmptyAccountForm() {
  return {
    name: "",
    account_type: "CUSTOMER",
    contact_number: "",
    address: "",
    opening_balance: "0.00",
    is_active: true,
  };
}

function createEmptyVendorEntryForm() {
  return {
    account_id: "",
    mode: "OWE",
    amount: "",
    payment_type: "CASH",
    entry_date: today,
    document_number: "",
    note: "",
  };
}

function formatCurrency(value) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(Number(value || 0));
}

function formatDateTime(value) {
  if (!value) {
    return "-";
  }

  return new Date(value).toLocaleString("en-IN", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatDate(value) {
  if (!value) {
    return "-";
  }

  const normalized = typeof value === "string" && value.length <= 10
    ? `${value}T00:00:00`
    : value;

  return new Date(normalized).toLocaleDateString("en-IN", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function formatReceiptDateTime(value) {
  if (!value) {
    return "-";
  }

  return new Date(value)
    .toLocaleString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    })
    .replace(" am", " AM")
    .replace(" pm", " PM");
}

function orderTypeLabel(orderType) {
  if (orderType === "DINE_IN") return "Dine-In";
  if (orderType === "TAKEAWAY") return "Takeaway";
  if (orderType === "DELIVERY") return "Delivery";
  return orderType || "-";
}

function vendorActionLabel(entry) {
  if (entry?.action_label) {
    return entry.action_label;
  }

  if (entry?.reference === "VENDOR-DUE") return "Invoice Recorded";
  if (entry?.reference === "VENDOR-PAY") return "Payment Issued";
  if (entry?.reference === "VENDOR-ADJUST-UP") return "Balance Correction (Increase)";
  if (entry?.reference === "VENDOR-ADJUST-DOWN") return "Balance Correction (Decrease)";
  if ((entry?.reference || "").startsWith("UNDO-ENTRY-")) return "Reversal Entry";

  return entry?.entry_type || "-";
}

function deliverySettlementMeta(status) {
  if (status === "PENDING_WITH_RIDER") {
    return {
      label: "Pending With Rider",
      tone: "border-amber-500/30 bg-amber-500/10 text-amber-100",
      helper: "Collect from rider",
    };
  }

  if (status === "COLLECTED_FROM_RIDER") {
    return {
      label: "Collected",
      tone: "border-emerald-500/30 bg-emerald-500/10 text-emerald-100",
      helper: "Money returned",
    };
  }

  if (status === "MOVED_TO_CUSTOMER_LEDGER") {
    return {
      label: "Customer Ledger",
      tone: "border-sky-500/30 bg-sky-500/10 text-sky-100",
      helper: "Rider cleared, customer owes",
    };
  }

  if (status === "DIRECT_PAID") {
    return {
      label: "Paid Directly",
      tone: "border-violet-500/30 bg-violet-500/10 text-violet-100",
      helper: "No rider collection",
    };
  }

  return {
    label: "No Rider Balance",
    tone: "border-slate-700 bg-slate-900/80 text-slate-200",
    helper: "Nothing to collect",
  };
}

function formatStatementRange(filters) {
  const startDate = filters?.start_date;
  const endDate = filters?.end_date;

  if (startDate && endDate) {
    return `${formatDate(startDate)} to ${formatDate(endDate)}`;
  }

  if (startDate) {
    return `From ${formatDate(startDate)}`;
  }

  if (endDate) {
    return `Up to ${formatDate(endDate)}`;
  }

  return "Full history";
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function ledgerOrderHighlight(order) {
  if (order.order_type === "DINE_IN") {
    return order.table_number ? `Table ${order.table_number}` : "Dine-In";
  }

  if (order.order_type === "DELIVERY") {
    return order.delivery_address || order.customer_phone || "Delivery";
  }

  if (order.order_type === "TAKEAWAY") {
    return order.customer_phone || order.customer_name || "Takeaway";
  }

  return order.customer_name || order.customer_phone || "-";
}

function getErrorMessage(error, fallback) {
  const data = error?.response?.data;

  if (!data) {
    return fallback;
  }

  if (typeof data === "string") {
    return data;
  }

  if (data.detail) {
    return data.detail;
  }

  if (data.error) {
    return data.error;
  }

  const firstKey = Object.keys(data)[0];

  if (!firstKey) {
    return fallback;
  }

  const firstValue = data[firstKey];

  if (Array.isArray(firstValue) && firstValue.length) {
    return firstValue[0];
  }

  if (typeof firstValue === "string") {
    return firstValue;
  }

  return fallback;
}

function normalizeFieldErrors(payload) {
  const source = payload?.errors || payload;

  if (!source || Array.isArray(source) || typeof source !== "object") {
    return {};
  }

  const normalized = {};

  Object.entries(source).forEach(([key, value]) => {
    if (Array.isArray(value) && value.length) {
      normalized[key] = String(value[0]);
      return;
    }

    if (typeof value === "string" && value) {
      normalized[key] = value;
    }
  });

  return normalized;
}

function buildParams(filters) {
  const params = {};

  Object.entries(filters).forEach(([key, value]) => {
    if (value !== "" && value !== null && value !== undefined) {
      params[key] = value;
    }
  });

  return params;
}

function balanceTone(accountType, balance) {
  const amount = Number(balance || 0);

  if (accountType === "CASH") {
    return amount >= 0 ? "text-emerald-200" : "text-rose-200";
  }

  if (accountType === "CUSTOMER") {
    return amount > 0 ? "text-amber-200" : "text-slate-200";
  }

  if (accountType === "DELIVERY") {
    return amount < 0 ? "text-rose-200" : "text-emerald-200";
  }

  if (accountType === "VENDOR") {
    if (amount > 0) {
      return "text-amber-200";
    }

    if (amount < 0) {
      return "text-emerald-200";
    }
  }

  return "text-slate-200";
}

function OrderDetailModal({ order, onClose }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 px-4 backdrop-blur-sm">
      <div className="max-h-[88vh] w-full max-w-3xl overflow-y-auto rounded-[28px] border border-slate-800 bg-slate-950 p-6 shadow-[0_35px_90px_rgba(15,23,42,0.55)]">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-xs uppercase tracking-[0.28em] text-sky-300">Order Snapshot</div>
            <h3 className="mt-2 text-2xl font-semibold">Order #{order.id}</h3>
            <p className="mt-2 text-sm text-slate-400">
              Quick reference pulled from Orders without leaving Ledger.
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-2xl border border-slate-700 px-3 py-2 text-sm text-slate-200 transition hover:border-slate-500 hover:text-white"
          >
            Close
          </button>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
            <div className="text-xs uppercase tracking-[0.2em] text-slate-500">Order Type</div>
            <div className="mt-2 text-lg font-semibold text-white">{order.order_type}</div>
          </div>
          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
            <div className="text-xs uppercase tracking-[0.2em] text-slate-500">Order Status</div>
            <div className="mt-2 text-lg font-semibold text-white">{order.order_status}</div>
          </div>
          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
            <div className="text-xs uppercase tracking-[0.2em] text-slate-500">Payment Status</div>
            <div className="mt-2 text-lg font-semibold text-white">{order.payment_status}</div>
          </div>
          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
            <div className="text-xs uppercase tracking-[0.2em] text-slate-500">Created</div>
            <div className="mt-2 text-lg font-semibold text-white">{formatDateTime(order.created_at)}</div>
          </div>
        </div>

        <div className="mt-6 grid gap-6 md:grid-cols-2">
          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
            <div className="text-sm font-semibold text-white">Customer</div>
            <div className="mt-3 space-y-2 text-sm text-slate-300">
              <div><span className="text-slate-500">Name:</span> {order.customer_name || "-"}</div>
              <div><span className="text-slate-500">Phone:</span> {order.customer_phone || "-"}</div>
              <div><span className="text-slate-500">Address:</span> {order.delivery_address || "-"}</div>
              <div><span className="text-slate-500">Table:</span> {order.table_number || "-"}</div>
              <div><span className="text-slate-500">Note:</span> {order.order_note || "-"}</div>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
            <div className="text-sm font-semibold text-white">Payments</div>
            <div className="mt-3 space-y-2">
              {order.payments?.length ? (
                order.payments.map((payment) => (
                  <div
                    key={payment.id}
                    className="flex items-center justify-between rounded-2xl border border-slate-800 bg-slate-950/60 px-3 py-2 text-sm"
                  >
                    <span className="text-slate-300">{payment.payment_type}</span>
                    <span className="font-semibold text-white">{formatCurrency(payment.amount)}</span>
                  </div>
                ))
              ) : (
                <div className="text-sm text-slate-500">No payment records yet.</div>
              )}
            </div>
          </div>
        </div>

        <div className="mt-6 rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
          <div className="text-sm font-semibold text-white">Items</div>
          <div className="mt-3 space-y-2">
            {order.items?.length ? (
              order.items.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center justify-between rounded-2xl border border-slate-800 bg-slate-950/60 px-3 py-2 text-sm"
                >
                  <span className="text-slate-300">
                    {item.item_name} x{item.quantity}
                  </span>
                  <span className="font-semibold text-white">
                    {formatCurrency(item.total_price)}
                  </span>
                </div>
              ))
            ) : (
              <div className="text-sm text-slate-500">No items found.</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function CollectModal({
  account,
  amount,
  paymentType,
  onAmountChange,
  onPaymentTypeChange,
  onClose,
  onConfirm,
  loading,
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 px-4 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-[28px] border border-slate-800 bg-slate-950 p-6 shadow-[0_35px_90px_rgba(15,23,42,0.55)]">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-xs uppercase tracking-[0.28em] text-emerald-300">Manual Collection</div>
            <h3 className="mt-2 text-2xl font-semibold">Collect from {account.name}</h3>
            <p className="mt-2 text-sm text-slate-400">
              This is only for customer dues already sitting in ledger.
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-2xl border border-slate-700 px-3 py-2 text-sm text-slate-200 transition hover:border-slate-500 hover:text-white"
          >
            Close
          </button>
        </div>

        <div className="mt-6 space-y-4">
          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
            <div className="text-xs uppercase tracking-[0.2em] text-slate-500">Outstanding Balance</div>
            <div className="mt-2 text-2xl font-semibold text-amber-200">{formatCurrency(account.balance)}</div>
          </div>

          <div>
            <label className="mb-2 block text-sm text-slate-300">Amount</label>
            <input
              type="number"
              min="0"
              step="0.01"
              value={amount}
              onChange={(event) => onAmountChange(event.target.value)}
              className="w-full rounded-2xl border border-slate-700 bg-slate-900 px-4 py-3 text-white outline-none transition focus:border-emerald-500"
              placeholder="0.00"
            />
          </div>

          <div>
            <label className="mb-2 block text-sm text-slate-300">Payment Type</label>
            <div className="grid gap-3 grid-cols-2">
              {["CASH", "ONLINE"].map((option) => {
                const selected = paymentType === option;

                return (
                  <button
                    key={option}
                    type="button"
                    onClick={() => onPaymentTypeChange(option)}
                    className={`rounded-2xl border px-4 py-3 text-left transition ${
                      selected
                        ? "border-emerald-500 bg-emerald-500/10"
                        : "border-slate-800 bg-slate-900/60 hover:border-slate-600"
                    }`}
                  >
                    <div className="font-semibold text-white">{option}</div>
                    <div className="mt-1 text-xs text-slate-400">
                      {option === "CASH" ? "Customer paid in cash" : "Customer paid online"}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <div className="mt-6 flex gap-3">
          <button
            onClick={onConfirm}
            disabled={loading}
            className="flex-1 rounded-2xl bg-emerald-500 px-4 py-3 font-semibold text-slate-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:bg-emerald-500/60"
          >
            <InlineButtonContent busy={loading} busyLabel="Recording...">
              Confirm Collection
            </InlineButtonContent>
          </button>
          <button
            onClick={onClose}
            className="rounded-2xl border border-slate-700 px-4 py-3 font-semibold text-slate-200 transition hover:border-slate-500 hover:text-white"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

function AccountManagementUnlockModal({
  open,
  password,
  error,
  onClose,
  onChange,
  onSubmit,
}) {
  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 px-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-[30px] border border-slate-800 bg-slate-950 p-6 shadow-[0_25px_80px_rgba(0,0,0,0.55)]">
        <div className="text-[11px] uppercase tracking-[0.34em] text-amber-300">
          Protected Ledger Controls
        </div>
        <h3 className="mt-3 text-2xl font-semibold text-white">Unlock Account Management</h3>
        <p className="mt-3 text-sm leading-6 text-slate-400">
          Editing balances and deleting ledger accounts stays locked until the correct password is entered for this browser session.
        </p>

        <form onSubmit={onSubmit} className="mt-5 space-y-4">
          <div>
            <label className="mb-2 block text-sm text-slate-300">Password</label>
            <input
              type="password"
              value={password}
              onChange={(event) => onChange(event.target.value)}
              autoFocus
              className="w-full rounded-2xl border border-slate-700 bg-slate-900 px-4 py-3 text-white outline-none transition focus:border-amber-400"
              placeholder="Enter ledger management password"
            />
          </div>

          {error ? (
            <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
              {error}
            </div>
          ) : null}

          <div className="flex gap-3">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-2xl border border-slate-700 px-4 py-3 font-semibold text-slate-200 transition hover:border-slate-500"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="flex-1 rounded-2xl bg-amber-400 px-4 py-3 font-semibold text-slate-950 transition hover:bg-amber-300"
            >
              Unlock
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function QuickDeleteModal({
  account,
  password,
  error,
  loading,
  onClose,
  onChange,
  onSubmit,
}) {
  if (!account) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/85 px-4 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-[30px] border border-rose-500/20 bg-slate-950 p-6 shadow-[0_25px_80px_rgba(0,0,0,0.6)]">
        <div className="text-[11px] uppercase tracking-[0.34em] text-rose-300">
          Quick Delete
        </div>
        <h3 className="mt-3 text-2xl font-semibold text-white">Delete {account.name}</h3>
        <p className="mt-3 text-sm leading-6 text-slate-400">
          This removes the ledger account when it is clean. If transaction history exists, the account is archived safely instead, and linked orders are detached and kept untouched.
        </p>

        <div className="mt-4 rounded-2xl border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
          Enter the protected management password to continue.
        </div>

        <form onSubmit={onSubmit} className="mt-5 space-y-4">
          <div>
            <label className="mb-2 block text-sm text-slate-300">Password</label>
            <input
              type="password"
              value={password}
              onChange={(event) => onChange(event.target.value)}
              autoFocus
              className="w-full rounded-2xl border border-slate-700 bg-slate-900 px-4 py-3 text-white outline-none transition focus:border-rose-400"
              placeholder="Enter delete password"
            />
          </div>

          {error ? (
            <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
              {error}
            </div>
          ) : null}

          <div className="flex gap-3">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-2xl border border-slate-700 px-4 py-3 font-semibold text-slate-200 transition hover:border-slate-500"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 rounded-2xl bg-rose-500 px-4 py-3 font-semibold text-white transition hover:bg-rose-400 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <InlineButtonContent busy={loading} busyLabel="Deleting...">
                Quick Delete
              </InlineButtonContent>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function BulkQuickDeleteModal({
  count,
  password,
  error,
  loading,
  onClose,
  onChange,
  onSubmit,
}) {
  if (!count) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/85 px-4 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-[30px] border border-rose-500/20 bg-slate-950 p-6 shadow-[0_25px_80px_rgba(0,0,0,0.6)]">
        <div className="text-[11px] uppercase tracking-[0.34em] text-rose-300">
          Bulk Delete
        </div>
        <h3 className="mt-3 text-2xl font-semibold text-white">
          Delete {count} selected account{count === 1 ? "" : "s"}
        </h3>
        <p className="mt-3 text-sm leading-6 text-slate-400">
          Each selected account will use the same quick-delete rules: clean accounts get deleted, and accounts with transaction history get archived safely instead.
        </p>

        <div className="mt-4 rounded-2xl border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
          Enter the protected management password to continue.
        </div>

        <form onSubmit={onSubmit} className="mt-5 space-y-4">
          <div>
            <label className="mb-2 block text-sm text-slate-300">Password</label>
            <input
              type="password"
              value={password}
              onChange={(event) => onChange(event.target.value)}
              autoFocus
              className="w-full rounded-2xl border border-slate-700 bg-slate-900 px-4 py-3 text-white outline-none transition focus:border-rose-400"
              placeholder="Enter delete password"
            />
          </div>

          {error ? (
            <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
              {error}
            </div>
          ) : null}

          <div className="flex gap-3">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-2xl border border-slate-700 px-4 py-3 font-semibold text-slate-200 transition hover:border-slate-500"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 rounded-2xl bg-rose-500 px-4 py-3 font-semibold text-white transition hover:bg-rose-400 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <InlineButtonContent busy={loading} busyLabel="Deleting...">
                Bulk Delete
              </InlineButtonContent>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function AccountDetailModal({ report, onClose, onViewOrder }) {
  const account = report.account;

  const summaryCards = [
    {
      label: "Current Balance",
      value: formatCurrency(report.summary.current_balance),
    },
    {
      label: "Opening Balance",
      value: formatCurrency(report.summary.opening_balance),
    },
    {
      label: "Total Credits",
      value: formatCurrency(report.summary.total_credits),
    },
    {
      label: "Total Debits",
      value: formatCurrency(report.summary.total_debits),
    },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 px-4 backdrop-blur-sm">
      <div className="max-h-[90vh] w-full max-w-6xl overflow-y-auto rounded-[28px] border border-slate-800 bg-slate-950 p-6 shadow-[0_35px_90px_rgba(15,23,42,0.55)]">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-xs uppercase tracking-[0.28em] text-sky-300">Account Ledger</div>
            <h3 className="mt-2 text-2xl font-semibold">{account.name}</h3>
            <p className="mt-2 text-sm text-slate-400">
              Full account trail with running balance and linked orders.
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-2xl border border-slate-700 px-3 py-2 text-sm text-slate-200 transition hover:border-slate-500 hover:text-white"
          >
            Close
          </button>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {summaryCards.map((card) => (
            <div
              key={card.label}
              className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4"
            >
              <div className="text-xs uppercase tracking-[0.2em] text-slate-500">{card.label}</div>
              <div className="mt-2 text-2xl font-semibold text-white">{card.value}</div>
            </div>
          ))}
        </div>

        <div className="mt-6 grid gap-6 xl:grid-cols-[0.75fr_1.25fr]">
          <div className="space-y-6">
            <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
              <div className="text-sm font-semibold text-white">Account Details</div>
              <div className="mt-3 space-y-2 text-sm text-slate-300">
                <div><span className="text-slate-500">Type:</span> {account.account_type_display}</div>
                <div><span className="text-slate-500">Phone:</span> {account.contact_number || "-"}</div>
                <div><span className="text-slate-500">Address:</span> {account.address || "-"}</div>
                <div><span className="text-slate-500">Status:</span> {account.is_active ? "Active" : "Inactive"}</div>
                <div><span className="text-slate-500">Created:</span> {formatDateTime(account.created_at)}</div>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
              <div className="flex items-center justify-between gap-3">
                <div className="text-sm font-semibold text-white">Linked Orders</div>
                <div className="text-xs uppercase tracking-[0.2em] text-slate-500">
                  {report.summary.related_orders_count}
                </div>
              </div>
              <div className="mt-3 space-y-3">
                {report.related_orders.length ? (
                  report.related_orders.map((order) => (
                    <div
                      key={order.id}
                      className="rounded-2xl border border-slate-800 bg-slate-950/60 p-3"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <div className="font-semibold text-white">Order #{order.id}</div>
                          <div className="mt-1 text-xs text-slate-400">
                            {order.order_type} • {order.order_status} • {order.payment_status}
                          </div>
                        </div>
                        <button
                          onClick={() => onViewOrder(order.id)}
                          className="rounded-2xl border border-slate-700 px-3 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-200 transition hover:border-slate-500 hover:text-white"
                        >
                          View
                        </button>
                      </div>
                      <div className="mt-3 text-sm text-slate-300">
                        {formatCurrency(order.total_amount)}
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="rounded-2xl border border-dashed border-slate-800 px-4 py-6 text-center text-sm text-slate-500">
                    No linked orders.
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="text-sm font-semibold text-white">Transactions</div>
              <div className="text-xs uppercase tracking-[0.2em] text-slate-500">
                {report.summary.transaction_count}
              </div>
            </div>

            <div className="mt-4 overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="text-xs uppercase tracking-[0.18em] text-slate-500">
                  <tr>
                    <th className="pb-3 pr-4">Statement Date</th>
                    <th className="pb-3 pr-4">Logged</th>
                    <th className="pb-3 pr-4">Type</th>
                    <th className="pb-3 pr-4">Payment</th>
                    <th className="pb-3 pr-4">Amount</th>
                    <th className="pb-3 pr-4">Reference</th>
                    <th className="pb-3 pr-4">Document</th>
                    <th className="pb-3 pr-4">By</th>
                    <th className="pb-3 pr-4">Description</th>
                    <th className="pb-3">Running</th>
                  </tr>
                </thead>
                <tbody>
                  {report.transactions.length ? (
                    report.transactions.map((entry) => (
                      <tr key={entry.id} className="border-t border-slate-800 align-top">
                        <td className="py-3 pr-4 text-slate-300">{formatDate(entry.entry_date)}</td>
                        <td className="py-3 pr-4 text-slate-400">{formatDateTime(entry.date)}</td>
                        <td className="py-3 pr-4 text-slate-200">{vendorActionLabel(entry)}</td>
                        <td className="py-3 pr-4 text-slate-200">{entry.payment_type}</td>
                        <td className="py-3 pr-4 font-semibold text-white">{formatCurrency(entry.amount)}</td>
                        <td className="py-3 pr-4 text-slate-400">{entry.reference || "-"}</td>
                        <td className="py-3 pr-4 text-slate-400">{entry.document_number || "-"}</td>
                        <td className="py-3 pr-4 text-slate-400">{entry.created_by_name || "-"}</td>
                        <td className="py-3 pr-4 text-slate-400">{entry.description || "-"}</td>
                        <td className="py-3 font-semibold text-emerald-200">
                          {formatCurrency(entry.running_balance)}
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan="10" className="py-10 text-center text-slate-500">
                        No transactions for this account yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function LedgerTab({ navigationIntent, onNavigationHandled }) {
  const [activeTab, setActiveTab] = useState("ACCOUNTS");

  const [accounts, setAccounts] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [dailyReport, setDailyReport] = useState(null);
  const [deliveryBoyDirectory, setDeliveryBoyDirectory] = useState([]);

  const [accountFilters, setAccountFilters] = useState({
    search: "",
    account_type: "",
    show_inactive: false,
  });
  const [transactionFilters, setTransactionFilters] = useState({
    search: "",
    account_id: "",
    account_type: "",
    entry_type: "",
    payment_type: "",
    start_date: "",
    end_date: "",
  });

  const [dailyDate, setDailyDate] = useState(today);

  const [accountForm, setAccountForm] = useState(createEmptyAccountForm);
  const [editingAccount, setEditingAccount] = useState(null);
  const [accountManagementUnlocked, setAccountManagementUnlocked] = useState(false);
  const [showAccountManagementUnlock, setShowAccountManagementUnlock] = useState(false);
  const [accountManagementPassword, setAccountManagementPassword] = useState("");
  const [accountManagementUnlockError, setAccountManagementUnlockError] = useState("");
  const [quickDeleteState, setQuickDeleteState] = useState({
    account: null,
    password: "",
    error: "",
    loading: false,
  });
  const [selectedAccountIds, setSelectedAccountIds] = useState([]);
  const [bulkQuickDeleteState, setBulkQuickDeleteState] = useState({
    open: false,
    password: "",
    error: "",
    loading: false,
  });

  const [collectState, setCollectState] = useState({
    account: null,
    amount: "",
    payment_type: "CASH",
  });
  const [vendorEntryForm, setVendorEntryForm] = useState(createEmptyVendorEntryForm);
  const [selectedVendorId, setSelectedVendorId] = useState("");
  const [vendorReport, setVendorReport] = useState(null);
  const [vendorStatementFilters, setVendorStatementFilters] = useState({
    start_date: "",
    end_date: "",
  });
  const [selectedDeliveryLedgerBoyId, setSelectedDeliveryLedgerBoyId] = useState("");
  const [deliveryLedgerFilters, setDeliveryLedgerFilters] = useState({
    from_date: today,
    to_date: today,
    payment_type: "CASH",
  });
  const [deliveryLedgerReport, setDeliveryLedgerReport] = useState(null);
  const [highlightedDeliveryLedgerOrderId, setHighlightedDeliveryLedgerOrderId] = useState(null);

  const [accountReport, setAccountReport] = useState(null);
  const [viewingOrder, setViewingOrder] = useState(null);

  const [loadingAccounts, setLoadingAccounts] = useState(false);
  const [loadingDeliveryBoys, setLoadingDeliveryBoys] = useState(false);
  const [loadingTransactions, setLoadingTransactions] = useState(false);
  const [loadingDailyReport, setLoadingDailyReport] = useState(false);
  const [savingAccount, setSavingAccount] = useState(false);
  const [savingVendorEntry, setSavingVendorEntry] = useState(false);
  const [collectLoading, setCollectLoading] = useState(false);
  const [loadingAccountReport, setLoadingAccountReport] = useState(false);
  const [loadingVendorReport, setLoadingVendorReport] = useState(false);
  const [loadingDeliveryLedger, setLoadingDeliveryLedger] = useState(false);
  const [collectingDeliveryLedger, setCollectingDeliveryLedger] = useState(false);

  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [accountFormErrors, setAccountFormErrors] = useState({});

  const clearAccountFormError = (fieldName) => {
    setAccountFormErrors((current) => {
      if (!current[fieldName]) {
        return current;
      }

      const next = { ...current };
      delete next[fieldName];
      return next;
    });
  };

  const loadAccounts = async () => {
    setLoadingAccounts(true);
    try {
      const response = await api.get("/accounts/", {
        params: { include_inactive: accountFilters.show_inactive ? 1 : 0 },
      });
      setAccounts(response.data);
    } finally {
      setLoadingAccounts(false);
    }
  };

  const loadTransactions = async (filters = transactionFilters) => {
    setLoadingTransactions(true);
    try {
      const response = await api.get("/ledger/entries/", {
        params: buildParams(filters),
      });
      setTransactions(response.data);
    } finally {
      setLoadingTransactions(false);
    }
  };

  const loadDeliveryBoys = async () => {
    setLoadingDeliveryBoys(true);
    try {
      const response = await api.get("/ledger/delivery-boys/");
      setDeliveryBoyDirectory(Array.isArray(response.data) ? response.data : []);
    } finally {
      setLoadingDeliveryBoys(false);
    }
  };

  const loadDailyReport = async (date = dailyDate) => {
    setLoadingDailyReport(true);
    try {
      const response = await api.get("/daily-report/", {
        params: { date },
      });
      setDailyReport(response.data);
    } finally {
      setLoadingDailyReport(false);
    }
  };

  const refreshAll = async () => {
    await Promise.all([
      loadAccounts(),
      loadDeliveryBoys(),
      loadTransactions(transactionFilters),
      loadDailyReport(dailyDate),
    ]);
  };

  useEffect(() => {
    const load = async () => {
      setError("");
      try {
        await refreshAll();
      } catch (requestError) {
        setError(getErrorMessage(requestError, "Ledger failed to load."));
      }
    };

    load();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    loadAccounts().catch((requestError) => {
      setError(getErrorMessage(requestError, "Ledger accounts failed to refresh."));
    });
  }, [accountFilters.show_inactive]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!selectedDeliveryLedgerBoyId) {
      return;
    }

    if (loadingDeliveryBoys || !deliveryBoyDirectory.length) {
      return;
    }

    const stillExists = deliveryBoyDirectory.some(
      (account) => String(account.id) === String(selectedDeliveryLedgerBoyId),
    );

    if (!stillExists) {
      setSelectedDeliveryLedgerBoyId("");
      setDeliveryLedgerReport(null);
      setHighlightedDeliveryLedgerOrderId(null);
    }
  }, [selectedDeliveryLedgerBoyId, deliveryBoyDirectory, loadingDeliveryBoys]);

  const filteredAccounts = useMemo(() => {
    return accounts
      .filter((account) => {
        if (!accountFilters.account_type) {
          return true;
        }

        return account.account_type === accountFilters.account_type;
      })
      .filter((account) => {
        const search = accountFilters.search.trim().toLowerCase();

        if (!search) {
          return true;
        }

        return (
          account.name.toLowerCase().includes(search)
          || (account.contact_number || "").toLowerCase().includes(search)
          || (account.address || "").toLowerCase().includes(search)
        );
      });
  }, [accounts, accountFilters]);

  const selectableAccounts = useMemo(
    () => filteredAccounts.filter((account) => account.account_type !== "CASH"),
    [filteredAccounts],
  );

  const allSelectableSelected = Boolean(
    selectableAccounts.length
    && selectableAccounts.every((account) => selectedAccountIds.includes(account.id)),
  );

  useEffect(() => {
    setSelectedAccountIds((current) =>
      current.filter((accountId) => accounts.some((account) => account.id === accountId)),
    );
  }, [accounts]);

  const transactionSummary = useMemo(() => {
    return transactions.reduce(
      (summary, entry) => {
        if (entry.entry_type === "CREDIT") {
          summary.totalCredits += Number(entry.amount || 0);
        }

        if (entry.entry_type === "DEBIT") {
          summary.totalDebits += Number(entry.amount || 0);
        }

        return summary;
      },
      {
        totalCredits: 0,
        totalDebits: 0,
      },
    );
  }, [transactions]);

  const directorySummary = useMemo(() => {
    return {
      totalAccounts: accounts.length,
      customers: accounts.filter((account) => account.account_type === "CUSTOMER").length,
      delivery: accounts.filter((account) => account.account_type === "DELIVERY").length,
      vendors: accounts.filter((account) => account.account_type === "VENDOR").length,
    };
  }, [accounts]);

  const vendorAccounts = useMemo(
    () =>
      accounts.filter(
        (account) => account.account_type === "VENDOR" && account.is_active,
      ),
    [accounts],
  );

  const deliveryLedgerSummaryCards = deliveryLedgerReport
    ? [
        {
          label: "Orders In Range",
          value: deliveryLedgerReport.summary.orders_count,
          tone: "text-white",
        },
        {
          label: "Collectible Orders",
          value: deliveryLedgerReport.summary.collectible_order_count,
          tone: "text-amber-200",
        },
        {
          label: "Collected So Far",
          value: formatCurrency(deliveryLedgerReport.summary.collected_so_far),
          tone: "text-emerald-200",
        },
        {
          label: "Pending Balance",
          value: formatCurrency(deliveryLedgerReport.summary.pending_balance),
          tone: "text-rose-200",
        },
      ]
    : [];

  useEffect(() => {
    if (!selectedVendorId) {
      return;
    }

    const stillExists = vendorAccounts.some(
      (account) => String(account.id) === String(selectedVendorId),
    );

    if (!stillExists) {
      setSelectedVendorId("");
      setVendorReport(null);
      setVendorEntryForm(createEmptyVendorEntryForm());
    }
  }, [selectedVendorId, vendorAccounts]);

  const topCards = dailyReport
    ? [
        {
          label: "Cash Drawer",
          value: formatCurrency(dailyReport.summary.cash_drawer_balance),
          tone: "text-emerald-200",
        },
        {
          label: "Order Collections Today",
          value: formatCurrency(dailyReport.summary.total_order_collections),
          tone: "text-white",
        },
        {
          label: "Manual Collections Today",
          value: formatCurrency(dailyReport.summary.total_manual_collections),
          tone: "text-sky-200",
        },
        {
          label: "Customer Outstanding",
          value: formatCurrency(dailyReport.summary.customer_outstanding),
          tone: "text-amber-200",
        },
        {
          label: "Delivery Pending",
          value: formatCurrency(dailyReport.summary.delivery_pending),
          tone: "text-rose-200",
        },
      ]
    : [];

  const tabConfig = [
    { key: "ACCOUNTS", label: "Accounts" },
    { key: "DELIVERY_LEDGER", label: "Delivery Ledger" },
    { key: "VENDOR_LEDGER", label: "Vendor Ledger" },
    { key: "TRANSACTIONS", label: "Transactions" },
    { key: "REPORT", label: "Daily Report" },
  ];

  const resetAccountEditor = () => {
    setEditingAccount(null);
    setAccountForm(createEmptyAccountForm());
    setAccountFormErrors({});
  };

  const startVendorAccountCreate = () => {
    setActiveTab("ACCOUNTS");
    setEditingAccount(null);
    setAccountForm({
      ...createEmptyAccountForm(),
      account_type: "VENDOR",
    });
    setSuccess("");
    setError("");
  };

  const requestAccountManagementUnlock = (callback) => {
    if (accountManagementUnlocked) {
      callback();
      return;
    }

    setShowAccountManagementUnlock(true);
    setAccountManagementPassword("");
    setAccountManagementUnlockError("");
  };

  const handleAccountManagementUnlock = (event) => {
    event.preventDefault();

    if (accountManagementPassword !== ACCOUNT_MANAGEMENT_PASSWORD) {
      setAccountManagementUnlockError("Incorrect password. Ledger management stays locked.");
      return;
    }

    setAccountManagementUnlocked(true);
    setShowAccountManagementUnlock(false);
    setAccountManagementPassword("");
    setAccountManagementUnlockError("");
  };

  const handleSubmitAccount = async () => {
    setError("");
    setSuccess("");
    setAccountFormErrors({});

    if (!accountForm.name.trim()) {
      setAccountFormErrors({ name: "Account name is required." });
      setError("Enter an account name first.");
      return;
    }

    setSavingAccount(true);

    try {
      const payload = {
        ...accountForm,
        contact_number: accountForm.contact_number || null,
        address: accountForm.address || null,
        opening_balance: accountForm.opening_balance || "0.00",
      };

      if (editingAccount) {
        await api.patch(`/accounts/${editingAccount.id}/`, payload);
      } else {
        await api.post("/accounts/", payload);
      }

      resetAccountEditor();

      await loadAccounts();
      setSuccess(editingAccount ? "Ledger account updated." : "Ledger account created.");
    } catch (requestError) {
      const fieldErrors = normalizeFieldErrors(requestError?.response?.data);
      setAccountFormErrors(fieldErrors);
      setError(getErrorMessage(requestError, editingAccount ? "Failed to update account." : "Failed to create account."));
    } finally {
      setSavingAccount(false);
    }
  };

  const handleStartEditAccount = (account) => {
    requestAccountManagementUnlock(() => {
      setEditingAccount(account);
      setAccountForm({
        name: account.name || "",
        account_type: account.account_type || "CUSTOMER",
        contact_number: account.contact_number || "",
        address: account.address || "",
        opening_balance: String(account.opening_balance ?? "0.00"),
        is_active: Boolean(account.is_active),
      });
      setSuccess("");
      setError("");
      setAccountFormErrors({});
    });
  };

  const handleOpenQuickDelete = (account) => {
    setQuickDeleteState({
      account,
      password: "",
      error: "",
      loading: false,
    });
  };

  const toggleAccountSelection = (accountId) => {
    setSelectedAccountIds((current) =>
      current.includes(accountId)
        ? current.filter((id) => id !== accountId)
        : [...current, accountId],
    );
  };

  const toggleSelectAllAccounts = () => {
    if (allSelectableSelected) {
      setSelectedAccountIds([]);
      return;
    }

    setSelectedAccountIds(selectableAccounts.map((account) => account.id));
  };

  const handleOpenBulkQuickDelete = () => {
    if (!selectedAccountIds.length) {
      setError("Select at least one ledger account first.");
      return;
    }

    setBulkQuickDeleteState({
      open: true,
      password: "",
      error: "",
      loading: false,
    });
  };

  const handleConfirmQuickDelete = async (event) => {
    event.preventDefault();

    if (!quickDeleteState.account) {
      return;
    }

    if (!quickDeleteState.password) {
      setQuickDeleteState((current) => ({
        ...current,
        error: "Enter the password to quick delete this account.",
      }));
      return;
    }

    if (quickDeleteState.password !== ACCOUNT_MANAGEMENT_PASSWORD) {
      setQuickDeleteState((current) => ({
        ...current,
        error: "Incorrect password. Quick delete is blocked.",
      }));
      return;
    }

    setQuickDeleteState((current) => ({
      ...current,
      loading: true,
      error: "",
    }));
    setError("");
    setSuccess("");

    try {
      const response = await api.post(`/accounts/${quickDeleteState.account.id}/quick-delete/`, {
        password: quickDeleteState.password,
      });

      if (editingAccount?.id === quickDeleteState.account.id) {
        resetAccountEditor();
      }

      if (accountReport?.account?.id === quickDeleteState.account.id) {
        setAccountReport(null);
      }

      await refreshAll();
      setQuickDeleteState({
        account: null,
        password: "",
        error: "",
        loading: false,
      });
      setSuccess(
        response.data?.message
          || `${response.data.account_name || "Ledger account"} ${
            response.data?.action === "archived" ? "archived" : "deleted"
          }.`,
      );
    } catch (requestError) {
      setQuickDeleteState((current) => ({
        ...current,
        loading: false,
        error: getErrorMessage(requestError, "Quick delete failed."),
      }));
    }
  };

  const handleConfirmBulkQuickDelete = async (event) => {
    event.preventDefault();

    if (!selectedAccountIds.length) {
      setBulkQuickDeleteState((current) => ({
        ...current,
        error: "Select at least one ledger account to delete.",
      }));
      return;
    }

    if (!bulkQuickDeleteState.password) {
      setBulkQuickDeleteState((current) => ({
        ...current,
        error: "Enter the password to bulk delete these accounts.",
      }));
      return;
    }

    if (bulkQuickDeleteState.password !== ACCOUNT_MANAGEMENT_PASSWORD) {
      setBulkQuickDeleteState((current) => ({
        ...current,
        error: "Incorrect password. Bulk delete is blocked.",
      }));
      return;
    }

    setBulkQuickDeleteState((current) => ({
      ...current,
      loading: true,
      error: "",
    }));
    setError("");
    setSuccess("");

    try {
      const response = await api.post("/accounts/bulk-quick-delete/", {
        password: bulkQuickDeleteState.password,
        account_ids: selectedAccountIds,
      });

      if (editingAccount?.id && selectedAccountIds.includes(editingAccount.id)) {
        resetAccountEditor();
      }

      if (accountReport?.account?.id && selectedAccountIds.includes(accountReport.account.id)) {
        setAccountReport(null);
      }

      await refreshAll();
      setSelectedAccountIds([]);
      setBulkQuickDeleteState({
        open: false,
        password: "",
        error: "",
        loading: false,
      });
      setSuccess(response.data?.message || "Bulk delete finished.");
    } catch (requestError) {
      setBulkQuickDeleteState((current) => ({
        ...current,
        loading: false,
        error: getErrorMessage(requestError, "Bulk delete failed."),
      }));
    }
  };

  const handlePrintAccount = async (account) => {
    setError("");

    try {
      const response = await api.get(`/accounts/${account.id}/`);
      const report = response.data;

      if (report.account.account_type === "VENDOR") {
        openVendorStatementWindow(report);
        return;
      }

      const win = window.open("", "", "width=420,height=640");

      if (!win) {
        alert("Unable to open print preview. Please allow pop-ups and try again.");
        return;
      }

      const linkedOrdersMarkup = (report.related_orders || []).length
        ? report.related_orders
            .map(
              (order) => `
                <div class="order-line">
                  ${formatReceiptDateTime(order.created_at)} | ${orderTypeLabel(order.order_type)} | ${ledgerOrderHighlight(order)} | ${formatCurrency(order.total_amount)}
                </div>
              `,
            )
            .join("")
        : `
          <div class="note-line">No linked orders found for this account.</div>
          <div class="note-line">Balance created on: ${formatReceiptDateTime(report.account.created_at)}</div>
        `;

      win.document.write(`
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="UTF-8" />
          <title>Ledger Account Summary</title>
          <style>
            @page {
              size: 72mm auto;
              margin: 0;
            }

            body {
              font-family: monospace;
              width: 72mm;
              margin: 0;
              padding: 6px;
              font-size: 13px;
              font-weight: 600;
              color: #000;
            }

            .center { text-align: center; }
            .title {
              font-size: 22px;
              font-weight: 700;
            }
            .sub {
              font-size: 14px;
            }
            .section-title {
              font-size: 14px;
              font-weight: 700;
              margin-top: 6px;
            }
            .line {
              border-top: 1px dashed #000;
              margin: 6px 0;
            }
            .account-name {
              font-size: 18px;
              font-weight: 700;
            }
            .order-line,
            .note-line {
              line-height: 1.6;
              margin-bottom: 6px;
            }
            .total {
              font-size: 18px;
              font-weight: 700;
            }
          </style>
        </head>
        <body>
          <div class="center title">Al-Maidah Cafe</div>
          <div class="center sub">Chadoora</div>
          <div class="center sub">Phone: 7051333637</div>

          <div class="line"></div>

          <div class="account-name">${report.account.name}</div>
          <div>${report.account.account_type_display}</div>
          <div>${report.account.contact_number || "No phone"}</div>
          <div>${report.account.address || "No address"}</div>

          <div class="line"></div>
          <div class="section-title">Linked Order Summary</div>
          ${linkedOrdersMarkup}

          <div class="line"></div>
          <div class="section-title">Balance So Far</div>
          <div class="total">${formatCurrency(report.summary.current_balance)}</div>
        </body>
        </html>
      `);

      win.document.close();
      win.focus();
      win.onload = () => {
        setTimeout(() => {
          win.focus();
          win.print();
          win.onafterprint = () => {
            win.close();
          };
        }, 250);
      };
    } catch (requestError) {
      setError(getErrorMessage(requestError, "Unable to print this ledger account right now."));
    }
  };

  const openAccountReport = async (accountId) => {
    setLoadingAccountReport(true);
    setError("");
    setAccountReport(null);

    try {
      const response = await api.get(`/accounts/${accountId}/`);
      setAccountReport(response.data);
    } catch (requestError) {
      setError(getErrorMessage(requestError, "Failed to load account ledger."));
    } finally {
      setLoadingAccountReport(false);
    }
  };

  const applyTransactionFilters = async () => {
    setError("");

    try {
      await loadTransactions(transactionFilters);
    } catch (requestError) {
      setError(getErrorMessage(requestError, "Failed to load transactions."));
    }
  };

  const clearTransactionFilters = async () => {
    const next = {
      search: "",
      account_id: "",
      account_type: "",
      entry_type: "",
      payment_type: "",
      start_date: "",
      end_date: "",
    };

    setTransactionFilters(next);
    setError("");

    try {
      await loadTransactions(next);
    } catch (requestError) {
      setError(getErrorMessage(requestError, "Failed to load transactions."));
    }
  };

  const handleCollect = async () => {
    if (!collectState.account) {
      return;
    }

    setError("");
    setSuccess("");

    if (!collectState.amount || Number(collectState.amount) <= 0) {
      setError("Enter a valid collection amount.");
      return;
    }

    setCollectLoading(true);

    try {
      await api.post("/ledger/collect/", {
        account_id: collectState.account.id,
        amount: collectState.amount,
        payment_type: collectState.payment_type,
      });

      setCollectState({
        account: null,
        amount: "",
        payment_type: "CASH",
      });

      await refreshAll();
      setSuccess("Collection recorded successfully.");
    } catch (requestError) {
      setError(getErrorMessage(requestError, "Collection failed."));
    } finally {
      setCollectLoading(false);
    }
  };

  const loadDeliveryLedger = async (accountId, filters = deliveryLedgerFilters) => {
    if (!accountId) {
      setDeliveryLedgerReport(null);
      return;
    }

    setLoadingDeliveryLedger(true);
    try {
      const response = await api.get(`/ledger/delivery-boys/${accountId}/summary/`, {
        params: buildParams(filters),
      });
      setDeliveryLedgerReport(response.data);
    } finally {
      setLoadingDeliveryLedger(false);
    }
  };

  const handleSelectDeliveryLedgerBoy = async (accountId) => {
    setSelectedDeliveryLedgerBoyId(accountId);
    setHighlightedDeliveryLedgerOrderId(null);
    setError("");
    await loadDeliveryLedger(accountId, deliveryLedgerFilters);
  };

  const handleApplyDeliveryLedgerFilters = async () => {
    if (!selectedDeliveryLedgerBoyId) {
      setError("Choose a delivery boy first.");
      return;
    }

    setError("");
    await loadDeliveryLedger(selectedDeliveryLedgerBoyId, deliveryLedgerFilters);
  };

  const handleClearDeliveryLedgerFilters = async () => {
    const nextFilters = {
      from_date: today,
      to_date: today,
      payment_type: deliveryLedgerFilters.payment_type || "CASH",
    };

    setDeliveryLedgerFilters(nextFilters);
    setHighlightedDeliveryLedgerOrderId(null);
    setError("");

    if (!selectedDeliveryLedgerBoyId) {
      return;
    }

    await loadDeliveryLedger(selectedDeliveryLedgerBoyId, nextFilters);
  };

  const handleCollectDeliveryLedgerOrder = async (order) => {
    if (!order?.can_collect_from_rider) {
      return;
    }

    setCollectingDeliveryLedger(true);
    setError("");
    setSuccess("");

    try {
      const payload = {
        amount: order.remaining_amount,
        payment_type: deliveryLedgerFilters.payment_type,
      };

      if (deliveryLedgerFilters.payment_type === "CASH") {
        payload.cash_amount = order.remaining_amount;
      } else {
        payload.online_amount = order.remaining_amount;
      }

      await api.post(`/orders/${order.id}/collect-payment/`, payload);
      await refreshAll();
      await loadDeliveryLedger(selectedDeliveryLedgerBoyId, deliveryLedgerFilters);
      setSuccess(`Collected ${formatCurrency(order.remaining_amount)} from rider for Order #${order.id}.`);
    } catch (requestError) {
      setError(getErrorMessage(requestError, "Unable to collect this rider order right now."));
    } finally {
      setCollectingDeliveryLedger(false);
    }
  };

  const handleCollectAllDeliveryLedgerOrders = async () => {
    if (!selectedDeliveryLedgerBoyId) {
      setError("Choose a delivery boy first.");
      return;
    }

    setCollectingDeliveryLedger(true);
    setError("");
    setSuccess("");

    try {
      const response = await api.post(
        `/ledger/delivery-boys/${selectedDeliveryLedgerBoyId}/collect-all/`,
        deliveryLedgerFilters,
      );
      await refreshAll();
      await loadDeliveryLedger(selectedDeliveryLedgerBoyId, deliveryLedgerFilters);
      setSuccess(
        response.data?.summary?.collected_count
          ? `Collected ${formatCurrency(response.data.summary.total_collected_amount)} from ${response.data.summary.collected_count} rider order(s).`
          : "No rider orders needed collection for this range.",
      );
    } catch (requestError) {
      setError(getErrorMessage(requestError, "Unable to collect the selected rider orders."));
    } finally {
      setCollectingDeliveryLedger(false);
    }
  };

  const loadVendorReport = async (accountId, filters = vendorStatementFilters) => {
    if (!accountId) {
      setVendorReport(null);
      return;
    }

    setLoadingVendorReport(true);
    try {
      const response = await api.get(`/accounts/${accountId}/`, {
        params: buildParams(filters),
      });
      setVendorReport(response.data);
    } finally {
      setLoadingVendorReport(false);
    }
  };

  const handleVendorSelection = async (accountId) => {
    setSelectedVendorId(accountId);
    setVendorEntryForm((current) => ({
      ...current,
      account_id: accountId,
    }));
    setError("");
    await loadVendorReport(accountId, vendorStatementFilters);
  };

  const handleSaveVendorEntry = async () => {
    setError("");
    setSuccess("");

    if (!vendorEntryForm.account_id) {
      setError("Choose a vendor first.");
      return;
    }

    if (!vendorEntryForm.amount || Number(vendorEntryForm.amount) <= 0) {
      setError("Enter a valid vendor amount.");
      return;
    }

    setSavingVendorEntry(true);
    try {
      await api.post("/ledger/vendor-entry/", vendorEntryForm);
      setVendorEntryForm((current) => ({
        ...current,
        amount: "",
        document_number: "",
        note: "",
      }));
      await refreshAll();
      await loadVendorReport(vendorEntryForm.account_id, vendorStatementFilters);
      setSuccess("Vendor ledger updated.");
    } catch (requestError) {
      setError(getErrorMessage(requestError, "Failed to save vendor ledger entry."));
    } finally {
      setSavingVendorEntry(false);
    }
  };

  const handleUndoVendorEntry = async (entryId) => {
    setError("");
    setSuccess("");

    try {
      await api.post(`/ledger/entries/${entryId}/undo/`);
      await refreshAll();
      if (selectedVendorId) {
        await loadVendorReport(selectedVendorId, vendorStatementFilters);
      }
      setSuccess("Vendor transaction undone with full audit trail.");
    } catch (requestError) {
      setError(getErrorMessage(requestError, "Unable to undo this vendor transaction."));
    }
  };

  const handleApplyVendorStatementFilters = async () => {
    if (!selectedVendorId) {
      setError("Choose a vendor first.");
      return;
    }

    setError("");

    try {
      await loadVendorReport(selectedVendorId, vendorStatementFilters);
    } catch (requestError) {
      setError(getErrorMessage(requestError, "Unable to load this vendor statement."));
    }
  };

  const handleClearVendorStatementFilters = async () => {
    if (!selectedVendorId) {
      setVendorStatementFilters({
        start_date: "",
        end_date: "",
      });
      return;
    }

    const nextFilters = {
      start_date: "",
      end_date: "",
    };

    setVendorStatementFilters(nextFilters);
    setError("");

    try {
      await loadVendorReport(selectedVendorId, nextFilters);
    } catch (requestError) {
      setError(getErrorMessage(requestError, "Unable to reload the full vendor statement."));
    }
  };

  const openVendorStatementWindow = (report) => {
    const win = window.open("", "", "width=1080,height=860");

    if (!win) {
      alert("Unable to open print preview. Please allow pop-ups and try again.");
      return;
    }

    const statementRange = formatStatementRange(report.filters);
    const printableTransactions = (report.transactions || []).filter(
      (entry) => !["VENDOR-ADJUST-UP", "VENDOR-ADJUST-DOWN"].includes(entry.reference),
    );
    const printableVendorTotals = printableTransactions.reduce(
      (totals, entry) => {
        const amount = Number(entry.amount || 0);

        if (entry.reference === "VENDOR-DUE") {
          totals.due_added += amount;
        } else if (entry.reference === "VENDOR-PAY") {
          totals.payments_made += amount;
        }

        return totals;
      },
      {
        due_added: 0,
        payments_made: 0,
      },
    );
    const printedOpeningBalance = Number(report.summary.statement_opening_balance || 0);
    const printedClosingBalance = printedOpeningBalance
      + printableVendorTotals.due_added
      - printableVendorTotals.payments_made;
    const transactionRows = printableTransactions.length
      ? printableTransactions
          .map(
            (entry) => `
              <tr>
                <td>${escapeHtml(formatDate(entry.entry_date))}</td>
                <td>${escapeHtml(formatDateTime(entry.date))}</td>
                <td>${escapeHtml(vendorActionLabel(entry))}</td>
                <td>${escapeHtml(entry.document_number || "-")}</td>
                <td>${escapeHtml(entry.payment_type || "-")}</td>
                <td class="amount">${escapeHtml(formatCurrency(entry.amount))}</td>
                <td class="amount">${escapeHtml(formatCurrency(entry.running_balance))}</td>
                <td>${escapeHtml(entry.created_by_name || "-")}</td>
                <td>${escapeHtml(entry.description || "-")}</td>
              </tr>
            `,
          )
          .join("")
      : `
        <tr>
          <td colspan="9" class="empty">No transactions found for this statement range.</td>
        </tr>
      `;

    win.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8" />
        <title>Vendor Ledger Statement</title>
        <style>
          @page {
            size: A4 portrait;
            margin: 12mm;
          }

          body {
            font-family: Arial, sans-serif;
            color: #0f172a;
            margin: 0;
            font-size: 12px;
          }

          .header {
            display: flex;
            justify-content: space-between;
            gap: 24px;
            border-bottom: 2px solid #0f172a;
            padding-bottom: 12px;
          }

          .brand-title {
            font-size: 24px;
            font-weight: 700;
          }

          .brand-copy,
          .meta-copy {
            margin-top: 4px;
            line-height: 1.5;
          }

          .meta {
            text-align: right;
          }

          .section {
            margin-top: 18px;
          }

          .section-title {
            font-size: 14px;
            font-weight: 700;
            margin-bottom: 10px;
            text-transform: uppercase;
            letter-spacing: 0.08em;
          }

          .summary-grid {
            display: grid;
            grid-template-columns: repeat(4, minmax(0, 1fr));
            gap: 10px;
          }

          .summary-card {
            border: 1px solid #cbd5e1;
            border-radius: 12px;
            padding: 10px 12px;
            background: #f8fafc;
          }

          .summary-label {
            font-size: 10px;
            color: #475569;
            text-transform: uppercase;
            letter-spacing: 0.08em;
          }

          .summary-value {
            margin-top: 6px;
            font-size: 16px;
            font-weight: 700;
          }

          table {
            width: 100%;
            border-collapse: collapse;
          }

          th,
          td {
            border: 1px solid #cbd5e1;
            padding: 8px;
            vertical-align: top;
          }

          th {
            background: #e2e8f0;
            font-size: 10px;
            text-transform: uppercase;
            letter-spacing: 0.08em;
            text-align: left;
          }

          .amount {
            text-align: right;
            white-space: nowrap;
            font-weight: 700;
          }

          .empty {
            text-align: center;
            color: #64748b;
            padding: 16px;
          }

          .footer {
            margin-top: 18px;
            font-size: 11px;
            color: #475569;
          }
        </style>
      </head>
      <body>
        <div class="header">
          <div>
            <div class="brand-title">Al-Maidah Cafe</div>
            <div class="brand-copy">
              Chadoora<br />
              Phone: 7051333637<br />
              Vendor ledger statement
            </div>
          </div>
          <div class="meta">
            <div class="brand-title" style="font-size: 20px;">${escapeHtml(report.account.name)}</div>
            <div class="meta-copy">
              ${escapeHtml(report.account.contact_number || "No phone")}<br />
              ${escapeHtml(report.account.address || "No address")}<br />
              Statement range: ${escapeHtml(statementRange)}<br />
              Printed: ${escapeHtml(formatDateTime(new Date()))}
            </div>
          </div>
        </div>

        <div class="section">
          <div class="section-title">Statement Summary</div>
          <div class="summary-grid">
            <div class="summary-card">
              <div class="summary-label">Opening Balance</div>
              <div class="summary-value">${escapeHtml(formatCurrency(printedOpeningBalance))}</div>
            </div>
            <div class="summary-card">
              <div class="summary-label">Closing Balance</div>
              <div class="summary-value">${escapeHtml(formatCurrency(printedClosingBalance))}</div>
            </div>
            <div class="summary-card">
              <div class="summary-label">Due Added</div>
              <div class="summary-value">${escapeHtml(formatCurrency(printableVendorTotals.due_added))}</div>
            </div>
            <div class="summary-card">
              <div class="summary-label">Payments Made</div>
              <div class="summary-value">${escapeHtml(formatCurrency(printableVendorTotals.payments_made))}</div>
            </div>
            <div class="summary-card">
              <div class="summary-label">Transactions</div>
              <div class="summary-value">${escapeHtml(String(printableTransactions.length || 0))}</div>
            </div>
          </div>
        </div>

        <div class="section">
          <div class="section-title">Detailed Transactions</div>
          <table>
            <thead>
              <tr>
                <th>Statement Date</th>
                <th>Logged At</th>
                <th>Action</th>
                <th>Document No.</th>
                <th>Payment</th>
                <th>Amount</th>
                <th>Running Balance</th>
                <th>Created By</th>
                <th>Note</th>
              </tr>
            </thead>
            <tbody>
              ${transactionRows}
            </tbody>
          </table>
        </div>

        <div class="footer">
          This statement is system generated from the vendor ledger and can be used for internal reconciliation and vendor discussions.
        </div>
      </body>
      </html>
    `);

    win.document.close();
    win.focus();
    win.onload = () => {
      setTimeout(() => {
        win.focus();
        win.print();
        win.onafterprint = () => {
          win.close();
        };
      }, 250);
    };
  };

  const viewOrder = async (orderId) => {
    setError("");

    try {
      const response = await api.get(`/orders/${orderId}/`);
      setViewingOrder(response.data);
    } catch (requestError) {
      setError(getErrorMessage(requestError, "Failed to load order details."));
    }
  };

  useEffect(() => {
    if (navigationIntent?.type !== "OPEN_DELIVERY_LEDGER") {
      return;
    }

    const targetBoyId = String(navigationIntent.deliveryBoyId || "");
    const nextFilters = {
      from_date: navigationIntent.fromDate || today,
      to_date: navigationIntent.toDate || navigationIntent.fromDate || today,
      payment_type: deliveryLedgerFilters.payment_type || "CASH",
    };

    setActiveTab("DELIVERY_LEDGER");
    setSelectedDeliveryLedgerBoyId(targetBoyId);
    setDeliveryLedgerFilters(nextFilters);
    setHighlightedDeliveryLedgerOrderId(navigationIntent.orderId || null);
    setError("");

    if (targetBoyId) {
      loadDeliveryLedger(targetBoyId, nextFilters).catch((requestError) => {
        setError(getErrorMessage(requestError, "Unable to open this delivery-boy ledger."));
      });
    }

    if (navigationIntent.intentId) {
      onNavigationHandled?.(navigationIntent.intentId);
    }
  }, [navigationIntent]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!highlightedDeliveryLedgerOrderId) {
      return;
    }

    const match = deliveryLedgerReport?.orders?.some(
      (order) => String(order.id) === String(highlightedDeliveryLedgerOrderId),
    );

    if (!match) {
      setHighlightedDeliveryLedgerOrderId(null);
      return;
    }

    const row = document.getElementById(`delivery-ledger-order-${highlightedDeliveryLedgerOrderId}`);
    row?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [highlightedDeliveryLedgerOrderId, deliveryLedgerReport]);

  return (
    <div className="space-y-6 text-white">
      <div className="rounded-[28px] border border-slate-800 bg-[radial-gradient(circle_at_top_left,_rgba(14,165,233,0.18),_transparent_33%),linear-gradient(135deg,_rgba(15,23,42,0.98),_rgba(15,23,42,0.88))] p-6 shadow-[0_24px_60px_rgba(15,23,42,0.35)]">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="text-xs uppercase tracking-[0.35em] text-sky-300">Ledger Control</div>
            <h2 className="mt-2 text-3xl font-semibold">Ledger</h2>
            <p className="mt-2 max-w-3xl text-sm text-slate-400">
              Track dues, rider balances, cash movement, and account histories in one place with cleaner answers to everyday ledger questions.
            </p>
          </div>

          <div className="rounded-3xl border border-slate-800 bg-slate-950/70 px-4 py-3 text-sm text-slate-300">
            <div className="text-xs uppercase tracking-[0.28em] text-slate-500">Ledger Date</div>
            <div className="mt-1 font-semibold text-white">{formatDateTime(new Date())}</div>
          </div>
        </div>
      </div>

      {!!topCards.length && (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          {topCards.map((card) => (
            <div
              key={card.label}
              className="rounded-3xl border border-slate-800 bg-slate-950/70 p-4"
            >
              <div className="text-xs uppercase tracking-[0.28em] text-slate-500">{card.label}</div>
              <div className={`mt-2 text-2xl font-semibold ${card.tone}`}>{card.value}</div>
            </div>
          ))}
        </div>
      )}

      <div className="rounded-3xl border border-slate-800 bg-slate-950/70 p-3">
        <div className="flex flex-wrap gap-3">
          {tabConfig.map((tab) => {
            const active = activeTab === tab.key;

            return (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`rounded-2xl px-4 py-3 text-sm font-semibold transition ${
                  active
                    ? "bg-sky-500 text-slate-950"
                    : "bg-slate-900/70 text-slate-300 hover:bg-slate-800 hover:text-white"
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {activeTab === "ACCOUNTS" && (
        <div className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
          <div className="space-y-6">
            <div className="rounded-3xl border border-slate-800 bg-slate-950/70 p-5">
              <div className="flex items-center justify-between gap-3 border-b border-slate-800 pb-4">
                <div>
                  <div className="text-lg font-semibold">
                    {editingAccount ? `Edit Account: ${editingAccount.name}` : "Create Account"}
                  </div>
                  <div className="mt-1 text-sm text-slate-400">
                    {editingAccount
                      ? "Correct account details here. Opening balance changes will also shift the live balance."
                      : "Add customer, delivery, or vendor ledger accounts directly from the panel. Phone can stay blank if you want to keep the account manual for now."}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div
                    className={`rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] ${
                      accountManagementUnlocked
                        ? "bg-emerald-500/15 text-emerald-200"
                        : "bg-amber-500/15 text-amber-200"
                    }`}
                  >
                    {accountManagementUnlocked ? "Management Unlocked" : "Management Locked"}
                  </div>
                  <button
                    onClick={() => {
                      if (accountManagementUnlocked) {
                        setAccountManagementUnlocked(false);
                        setShowAccountManagementUnlock(false);
                        setAccountManagementPassword("");
                        setAccountManagementUnlockError("");
                        resetAccountEditor();
                        return;
                      }

                      setShowAccountManagementUnlock(true);
                      setAccountManagementPassword("");
                      setAccountManagementUnlockError("");
                    }}
                    className={`rounded-2xl px-3 py-2 text-sm font-semibold transition ${
                      accountManagementUnlocked
                        ? "border border-rose-500/30 bg-rose-500/10 text-rose-100 hover:bg-rose-500/20"
                        : "border border-amber-500/30 bg-amber-500/10 text-amber-100 hover:bg-amber-500/20"
                    }`}
                  >
                    {accountManagementUnlocked ? "Lock Controls" : "Unlock Controls"}
                  </button>
                </div>
              </div>

              <div className="mt-4 grid gap-4">
                {(error || Object.keys(accountFormErrors).length) ? (
                  <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
                    {error || "Please fix the highlighted account fields and try again."}
                  </div>
                ) : null}

                <div>
                  <label className="mb-2 block text-sm text-slate-300">Account Type</label>
                  <select
                    value={accountForm.account_type}
                    onChange={(event) => {
                      setAccountForm((current) => ({
                        ...current,
                        account_type: event.target.value,
                      }));
                      clearAccountFormError("account_type");
                    }}
                    className={`w-full rounded-2xl border bg-slate-900 px-4 py-3 text-white outline-none transition focus:border-sky-500 ${
                      accountFormErrors.account_type ? "border-rose-500/60" : "border-slate-700"
                    }`}
                    disabled={Boolean(editingAccount)}
                  >
                    {ACCOUNT_TYPE_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                  {editingAccount ? (
                    <div className="mt-2 text-xs text-slate-500">
                      Account type stays locked after creation so existing ledger and order links remain safe.
                    </div>
                  ) : null}
                  {accountFormErrors.account_type ? (
                    <div className="mt-2 text-xs text-rose-300">{accountFormErrors.account_type}</div>
                  ) : null}
                </div>

                <div>
                  <label className="mb-2 block text-sm text-slate-300">Name</label>
                  <input
                    type="text"
                    value={accountForm.name}
                    onChange={(event) => {
                      setAccountForm((current) => ({
                        ...current,
                        name: event.target.value,
                      }));
                      clearAccountFormError("name");
                    }}
                    className={`w-full rounded-2xl border bg-slate-900 px-4 py-3 text-white outline-none transition focus:border-sky-500 ${
                      accountFormErrors.name ? "border-rose-500/60" : "border-slate-700"
                    }`}
                    placeholder="Enter account name"
                  />
                  {accountFormErrors.name ? (
                    <div className="mt-2 text-xs text-rose-300">{accountFormErrors.name}</div>
                  ) : null}
                </div>

                <div>
                  <label className="mb-2 block text-sm text-slate-300">Phone Number</label>
                  <input
                    type="text"
                    value={accountForm.contact_number}
                    onChange={(event) => {
                      setAccountForm((current) => ({
                        ...current,
                        contact_number: event.target.value,
                      }));
                      clearAccountFormError("contact_number");
                    }}
                    className={`w-full rounded-2xl border bg-slate-900 px-4 py-3 text-white outline-none transition focus:border-sky-500 ${
                      accountFormErrors.contact_number ? "border-rose-500/60" : "border-slate-700"
                    }`}
                    placeholder="Optional. Add it when you want phone-based matching."
                  />
                  {accountFormErrors.contact_number ? (
                    <div className="mt-2 text-xs text-rose-300">{accountFormErrors.contact_number}</div>
                  ) : null}
                </div>

                <div>
                  <label className="mb-2 block text-sm text-slate-300">Address</label>
                  <textarea
                    value={accountForm.address}
                    onChange={(event) => {
                      setAccountForm((current) => ({
                        ...current,
                        address: event.target.value,
                      }));
                      clearAccountFormError("address");
                    }}
                    className={`min-h-[110px] w-full rounded-2xl border bg-slate-900 px-4 py-3 text-white outline-none transition focus:border-sky-500 ${
                      accountFormErrors.address ? "border-rose-500/60" : "border-slate-700"
                    }`}
                    placeholder="Optional"
                  />
                  {accountFormErrors.address ? (
                    <div className="mt-2 text-xs text-rose-300">{accountFormErrors.address}</div>
                  ) : null}
                </div>

                <div>
                  <label className="mb-2 block text-sm text-slate-300">
                    {editingAccount ? "Opening Balance / Balance Correction" : "Opening Balance"}
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={accountForm.opening_balance}
                    onChange={(event) => {
                      setAccountForm((current) => ({
                        ...current,
                        opening_balance: event.target.value,
                      }));
                      clearAccountFormError("opening_balance");
                    }}
                    className={`w-full rounded-2xl border bg-slate-900 px-4 py-3 text-white outline-none transition focus:border-sky-500 ${
                      accountFormErrors.opening_balance ? "border-rose-500/60" : "border-slate-700"
                    }`}
                    placeholder="0.00"
                  />
                  {editingAccount ? (
                    <div className="mt-2 text-xs text-slate-500">
                      Current computed balance updates from this opening balance plus all existing ledger entries.
                    </div>
                  ) : null}
                  {accountFormErrors.opening_balance ? (
                    <div className="mt-2 text-xs text-rose-300">{accountFormErrors.opening_balance}</div>
                  ) : null}
                </div>

                <div className="flex flex-col gap-3 sm:flex-row">
                  <button
                    onClick={handleSubmitAccount}
                    disabled={savingAccount}
                    className="flex-1 rounded-2xl bg-sky-500 px-4 py-3 font-semibold text-slate-950 transition hover:bg-sky-400 disabled:cursor-not-allowed disabled:bg-sky-500/60"
                  >
                    <InlineButtonContent
                      busy={savingAccount}
                      busyLabel={editingAccount ? "Saving..." : "Creating..."}
                    >
                      {editingAccount ? "Save Changes" : "Create Account"}
                    </InlineButtonContent>
                  </button>
                  {editingAccount ? (
                    <button
                      onClick={resetAccountEditor}
                      disabled={savingAccount}
                      className="rounded-2xl border border-slate-700 px-4 py-3 font-semibold text-slate-200 transition hover:border-slate-500 hover:text-white"
                    >
                      Cancel Edit
                    </button>
                  ) : null}
                </div>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="rounded-3xl border border-slate-800 bg-slate-950/70 p-4">
                <div className="text-xs uppercase tracking-[0.28em] text-slate-500">Customers</div>
                <div className="mt-2 text-2xl font-semibold text-amber-200">{directorySummary.customers}</div>
              </div>
              <div className="rounded-3xl border border-slate-800 bg-slate-950/70 p-4">
                <div className="text-xs uppercase tracking-[0.28em] text-slate-500">Delivery Boys</div>
                <div className="mt-2 text-2xl font-semibold text-rose-200">{directorySummary.delivery}</div>
              </div>
              <div className="rounded-3xl border border-slate-800 bg-slate-950/70 p-4">
                <div className="text-xs uppercase tracking-[0.28em] text-slate-500">Vendors</div>
                <div className="mt-2 text-2xl font-semibold text-emerald-200">{directorySummary.vendors}</div>
              </div>
              <div className="rounded-3xl border border-slate-800 bg-slate-950/70 p-4">
                <div className="text-xs uppercase tracking-[0.28em] text-slate-500">Total Accounts</div>
                <div className="mt-2 text-2xl font-semibold text-white">{directorySummary.totalAccounts}</div>
              </div>
            </div>
          </div>

          <div className="rounded-3xl border border-slate-800 bg-slate-950/70 p-5">
            <div className="flex flex-col gap-2 border-b border-slate-800 pb-4 md:flex-row md:items-end md:justify-between">
              <div>
                <div className="text-lg font-semibold">Account Directory</div>
                <div className="mt-1 text-sm text-slate-400">
                  Search by name, phone, or address and jump into any ledger instantly.
                </div>
              </div>
              <div className="text-xs uppercase tracking-[0.28em] text-slate-500">
                {filteredAccounts.length} showing
              </div>
            </div>

            <div className="mt-4 grid gap-4 md:grid-cols-[1.3fr_0.7fr]">
              <input
                type="text"
                value={accountFilters.search}
                onChange={(event) =>
                  setAccountFilters((current) => ({
                    ...current,
                    search: event.target.value,
                  }))
                }
                className="w-full rounded-2xl border border-slate-700 bg-slate-900 px-4 py-3 text-white outline-none transition focus:border-sky-500"
                placeholder="Search accounts..."
              />
              <select
                value={accountFilters.account_type}
                onChange={(event) =>
                  setAccountFilters((current) => ({
                    ...current,
                    account_type: event.target.value,
                  }))
                }
                className="w-full rounded-2xl border border-slate-700 bg-slate-900 px-4 py-3 text-white outline-none transition focus:border-sky-500"
              >
                <option value="">All Types</option>
                <option value="CUSTOMER">Customer</option>
                <option value="DELIVERY">Delivery Boy</option>
                <option value="VENDOR">Vendor</option>
                <option value="CASH">Cash Drawer</option>
              </select>
            </div>

            <div className="mt-4 flex items-center justify-between gap-3 rounded-2xl border border-slate-800 bg-slate-900/50 px-4 py-3">
              <div className="text-sm text-slate-300">
                {accountFilters.show_inactive
                  ? "Archived / inactive accounts are visible right now."
                  : "Archived / inactive accounts are hidden so deleted accounts get out of your way."}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {!!selectedAccountIds.length && (
                  <button
                    onClick={handleOpenBulkQuickDelete}
                    className="rounded-2xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm font-semibold text-rose-100 transition hover:bg-rose-500/20"
                  >
                    Bulk Delete ({selectedAccountIds.length})
                  </button>
                )}
                <button
                  onClick={() =>
                    setAccountFilters((current) => ({
                      ...current,
                      show_inactive: !current.show_inactive,
                    }))
                  }
                  className={`rounded-2xl px-3 py-2 text-sm font-semibold transition ${
                    accountFilters.show_inactive
                      ? "border border-amber-500/30 bg-amber-500/10 text-amber-100 hover:bg-amber-500/20"
                      : "border border-slate-700 bg-slate-900 text-slate-200 hover:border-slate-500 hover:text-white"
                  }`}
                >
                  {accountFilters.show_inactive ? "Hide Archived" : "Show Archived"}
                </button>
              </div>
            </div>

            <div className="mt-4 space-y-3">
              {loadingAccounts ? (
                <PanelLoader
                  eyebrow="Ledger"
                  label="Loading accounts..."
                  description="Pulling balances, linked order states, and current account activity."
                />
              ) : filteredAccounts.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-800 px-4 py-8 text-center text-sm text-slate-500">
                  No accounts match the current filter.
                </div>
              ) : (
                <>
                  {selectableAccounts.length ? (
                    <div className="flex items-center justify-between rounded-2xl border border-slate-800 bg-slate-900/50 px-4 py-3 text-sm">
                      <div className="text-slate-300">
                        Select multiple accounts, then use Bulk Delete for one-shot cleanup.
                      </div>
                      <label className="flex cursor-pointer items-center gap-2 text-slate-200">
                        <input
                          type="checkbox"
                          checked={allSelectableSelected}
                          onChange={toggleSelectAllAccounts}
                          className="h-4 w-4 rounded border-slate-600 bg-slate-900 accent-rose-500"
                        />
                        Select All
                      </label>
                    </div>
                  ) : null}

                  {filteredAccounts.map((account) => (
                  <div
                    key={account.id}
                    className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4"
                  >
                    <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                      <div className="flex items-start gap-3">
                        {account.account_type !== "CASH" ? (
                          <label className="mt-1 flex shrink-0 cursor-pointer items-center">
                            <input
                              type="checkbox"
                              checked={selectedAccountIds.includes(account.id)}
                              onChange={() => toggleAccountSelection(account.id)}
                              className="h-4 w-4 rounded border-slate-600 bg-slate-900 accent-rose-500"
                            />
                          </label>
                        ) : (
                          <div className="mt-1 h-4 w-4 shrink-0" />
                        )}

                        <div>
                        <div className="flex items-center gap-2">
                          <div className="text-lg font-semibold text-white">{account.name}</div>
                          <span className="rounded-full bg-slate-800 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-300">
                            {account.account_type_display}
                          </span>
                          {!account.is_active && (
                            <span className="rounded-full bg-rose-500/15 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-rose-200">
                              Inactive
                            </span>
                          )}
                        </div>
                        <div className="mt-2 text-sm text-slate-400">
                          {(account.contact_number || "No phone") + " • " + (account.address || "No address")}
                        </div>
                        <div className={`mt-3 text-xl font-semibold ${balanceTone(account.account_type, account.balance)}`}>
                          {formatCurrency(account.balance)}
                        </div>
                      </div>
                      </div>

                      <div className="flex gap-2">
                        <button
                          onClick={() => openAccountReport(account.id)}
                          className="rounded-2xl border border-slate-700 px-3 py-2 text-sm text-slate-200 transition hover:border-slate-500 hover:text-white"
                        >
                          View Ledger
                        </button>
                        {account.account_type === "CUSTOMER" && Number(account.balance || 0) > 0 && (
                          <button
                            onClick={() =>
                              setCollectState({
                                account,
                                amount: "",
                                payment_type: "CASH",
                              })
                            }
                            className="rounded-2xl bg-emerald-500/15 px-3 py-2 text-sm font-semibold text-emerald-100 transition hover:bg-emerald-500/25"
                          >
                            Collect
                          </button>
                        )}
                        <button
                          onClick={() => handlePrintAccount(account)}
                          className="rounded-2xl border border-slate-700 bg-slate-900/80 px-3 py-2 text-sm font-semibold text-white transition hover:border-slate-500"
                        >
                          Print
                        </button>
                        <button
                          onClick={() => handleStartEditAccount(account)}
                          className="rounded-2xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm font-semibold text-amber-100 transition hover:bg-amber-500/20"
                        >
                          {accountManagementUnlocked ? "Edit" : "Unlock to Edit"}
                        </button>
                        {account.account_type !== "CASH" ? (
                          <button
                            onClick={() => handleOpenQuickDelete(account)}
                            className="rounded-2xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm font-semibold text-rose-100 transition hover:bg-rose-500/20"
                          >
                            Quick Delete
                          </button>
                        ) : null}
                      </div>
                    </div>
                  </div>
                ))}
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {activeTab === "DELIVERY_LEDGER" && (
        <div className="grid gap-6 xl:grid-cols-[0.82fr_1.18fr]">
          <div className="space-y-6">
            <div className="rounded-3xl border border-slate-800 bg-slate-950/70 p-5">
              <div className="border-b border-slate-800 pb-4">
                <div className="text-lg font-semibold text-white">Delivery Settlement Desk</div>
                <div className="mt-1 text-sm text-slate-400">
                  Open one rider, keep the order list lean, and collect only the orders that still need money returned to the restaurant.
                </div>
              </div>

              <div className="mt-4 space-y-4">
                <div>
                  <label className="mb-2 block text-sm text-slate-300">Delivery Boy</label>
                  <select
                    value={selectedDeliveryLedgerBoyId}
                    onChange={(event) => {
                      const nextId = event.target.value;
                      setSelectedDeliveryLedgerBoyId(nextId);
                      setHighlightedDeliveryLedgerOrderId(null);
                    }}
                    className="w-full rounded-2xl border border-slate-700 bg-slate-900 px-4 py-3 text-white outline-none transition focus:border-amber-500"
                  >
                    <option value="">
                      {loadingDeliveryBoys ? "Loading delivery boys..." : "Choose delivery boy"}
                    </option>
                    {deliveryBoyDirectory.map((boy) => (
                      <option key={boy.id} value={boy.id}>
                        {boy.name}
                      </option>
                    ))}
                  </select>
                  <div className="mt-2 text-xs text-slate-500">
                    Deleted riders disappear from this list entirely. Paid delivery orders still show here for tracking, but they stay non-collectible.
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <label className="mb-2 block text-sm text-slate-300">From Date</label>
                    <input
                      type="date"
                      value={deliveryLedgerFilters.from_date}
                      onChange={(event) =>
                        setDeliveryLedgerFilters((current) => ({
                          ...current,
                          from_date: event.target.value,
                        }))
                      }
                      className="w-full rounded-2xl border border-slate-700 bg-slate-900 px-4 py-3 text-white outline-none transition focus:border-amber-500"
                    />
                  </div>
                  <div>
                    <label className="mb-2 block text-sm text-slate-300">To Date</label>
                    <input
                      type="date"
                      value={deliveryLedgerFilters.to_date}
                      onChange={(event) =>
                        setDeliveryLedgerFilters((current) => ({
                          ...current,
                          to_date: event.target.value,
                        }))
                      }
                      className="w-full rounded-2xl border border-slate-700 bg-slate-900 px-4 py-3 text-white outline-none transition focus:border-amber-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="mb-2 block text-sm text-slate-300">Collection Mode</label>
                  <div className="grid gap-3 md:grid-cols-2">
                    {["CASH", "ONLINE"].map((option) => {
                      const selected = deliveryLedgerFilters.payment_type === option;

                      return (
                        <button
                          key={option}
                          type="button"
                          onClick={() =>
                            setDeliveryLedgerFilters((current) => ({
                              ...current,
                              payment_type: option,
                            }))
                          }
                          className={`rounded-2xl border px-4 py-3 text-left transition ${
                            selected
                              ? "border-amber-400 bg-amber-500/10"
                              : "border-slate-800 bg-slate-900/60 hover:border-slate-600"
                          }`}
                        >
                          <div className="font-semibold text-white">{option}</div>
                          <div className="mt-1 text-xs text-slate-400">
                            {option === "CASH" ? "Rider returns cash" : "Rider settles online"}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="flex flex-col gap-3 sm:flex-row">
                  <button
                    onClick={() => handleSelectDeliveryLedgerBoy(selectedDeliveryLedgerBoyId)}
                    disabled={!selectedDeliveryLedgerBoyId || loadingDeliveryLedger}
                    className="flex-1 rounded-2xl bg-amber-400 px-4 py-3 font-semibold text-slate-950 transition hover:bg-amber-300 disabled:cursor-not-allowed disabled:bg-amber-400/60"
                  >
                    {loadingDeliveryLedger ? "Loading..." : "Open Rider Orders"}
                  </button>
                  <button
                    onClick={handleApplyDeliveryLedgerFilters}
                    disabled={!selectedDeliveryLedgerBoyId || loadingDeliveryLedger}
                    className="rounded-2xl border border-slate-700 px-4 py-3 font-semibold text-slate-200 transition hover:border-slate-500 hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    Apply Range
                  </button>
                  <button
                    onClick={handleClearDeliveryLedgerFilters}
                    className="rounded-2xl border border-slate-700 px-4 py-3 font-semibold text-slate-200 transition hover:border-slate-500 hover:text-white"
                  >
                    Today
                  </button>
                </div>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="rounded-3xl border border-slate-800 bg-slate-950/70 p-4">
                <div className="text-xs uppercase tracking-[0.28em] text-slate-500">Delivery Boys</div>
                <div className="mt-2 text-2xl font-semibold text-rose-200">{deliveryBoyDirectory.length}</div>
              </div>
              <div className="rounded-3xl border border-slate-800 bg-slate-950/70 p-4">
                <div className="text-xs uppercase tracking-[0.28em] text-slate-500">Selected Mode</div>
                <div className="mt-2 text-2xl font-semibold text-white">{deliveryLedgerFilters.payment_type}</div>
              </div>
            </div>
          </div>

          <div className="space-y-6">
            <div className="rounded-3xl border border-slate-800 bg-slate-950/70 p-5">
              <div className="flex flex-col gap-3 border-b border-slate-800 pb-4 md:flex-row md:items-start md:justify-between">
                <div>
                  <div className="text-lg font-semibold text-white">Rider Order List</div>
                  <div className="mt-1 text-sm text-slate-400">
                    Minimal view by design: order number, type, total, view, and collect when collection is actually needed.
                  </div>
                </div>

                {deliveryLedgerReport ? (
                  <button
                    onClick={handleCollectAllDeliveryLedgerOrders}
                    disabled={
                      collectingDeliveryLedger
                      || !deliveryLedgerReport.summary.collectible_order_count
                    }
                    className="rounded-2xl bg-emerald-500 px-4 py-3 text-sm font-semibold text-slate-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:bg-emerald-500/60"
                  >
                    <InlineButtonContent
                      busy={collectingDeliveryLedger}
                      busyLabel="Collecting..."
                    >
                      Collect All In Range
                    </InlineButtonContent>
                  </button>
                ) : null}
              </div>

              {!selectedDeliveryLedgerBoyId ? (
                <div className="py-10 text-center text-sm text-slate-500">
                  Choose a delivery boy on the left to open today’s delivery ledger.
                </div>
              ) : loadingDeliveryLedger ? (
                <PanelLoader
                  eyebrow="Delivery Ledger"
                  label="Loading rider orders..."
                  description="Pulling delivery orders, pending rider balances, direct-paid orders, and customer-ledger transfers."
                />
              ) : deliveryLedgerReport ? (
                <>
                  <div className="mt-4 rounded-2xl border border-slate-800 bg-slate-900/50 p-4">
                    <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                      <div>
                        <div className="text-xs uppercase tracking-[0.24em] text-slate-500">Delivery Boy</div>
                        <div className="mt-2 text-xl font-semibold text-white">
                          {deliveryLedgerReport.delivery_boy.name}
                        </div>
                        <div className="mt-2 text-sm text-slate-400">
                          {deliveryLedgerReport.delivery_boy.contact_number || "No phone"} •{" "}
                          {deliveryLedgerReport.delivery_boy.address || "No address"}
                        </div>
                      </div>
                      <div className="rounded-2xl border border-slate-800 bg-slate-950/70 px-4 py-3 text-sm text-slate-300">
                        Range:{" "}
                        <span className="font-semibold text-white">
                          {formatDate(deliveryLedgerReport.filters.from_date)} to {formatDate(deliveryLedgerReport.filters.to_date)}
                        </span>
                      </div>
                    </div>
                  </div>

                  {!!deliveryLedgerSummaryCards.length && (
                    <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                      {deliveryLedgerSummaryCards.map((card) => (
                        <div
                          key={card.label}
                          className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4"
                        >
                          <div className="text-xs uppercase tracking-[0.2em] text-slate-500">{card.label}</div>
                          <div className={`mt-2 text-2xl font-semibold ${card.tone}`}>{card.value}</div>
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="mt-4 grid gap-4 md:grid-cols-3">
                    <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
                      <div className="text-xs uppercase tracking-[0.2em] text-slate-500">Total Order Value</div>
                      <div className="mt-2 text-xl font-semibold text-white">
                        {formatCurrency(deliveryLedgerReport.summary.total_order_value)}
                      </div>
                    </div>
                    <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
                      <div className="text-xs uppercase tracking-[0.2em] text-slate-500">Moved To Customer Ledger</div>
                      <div className="mt-2 text-xl font-semibold text-sky-200">
                        {formatCurrency(deliveryLedgerReport.summary.moved_to_customer_total)}
                      </div>
                    </div>
                    <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
                      <div className="text-xs uppercase tracking-[0.2em] text-slate-500">Paid Directly</div>
                      <div className="mt-2 text-xl font-semibold text-violet-200">
                        {formatCurrency(deliveryLedgerReport.summary.direct_paid_total)}
                      </div>
                    </div>
                  </div>

                  <div className="mt-5 overflow-hidden rounded-2xl border border-slate-800 bg-slate-950/35">
                    <div className="hidden items-center gap-3 border-b border-slate-800 bg-slate-950/70 px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500 md:grid md:grid-cols-[1fr_0.85fr_0.9fr_1.15fr_auto_auto]">
                      <div>Order</div>
                      <div>Type</div>
                      <div>Total</div>
                      <div>Status</div>
                      <div>View</div>
                      <div>Collect</div>
                    </div>
                    {deliveryLedgerReport.orders.length ? (
                      deliveryLedgerReport.orders.map((order) => {
                        const settlement = deliverySettlementMeta(order.settlement_status);
                        const highlighted = String(order.id) === String(highlightedDeliveryLedgerOrderId);

                        return (
                          <div
                            key={order.id}
                            id={`delivery-ledger-order-${order.id}`}
                            className={`border-b border-slate-800 px-4 py-3 transition last:border-b-0 ${
                              highlighted
                                ? "bg-amber-500/10 shadow-[inset_3px_0_0_rgba(251,191,36,0.9)]"
                                : "bg-transparent hover:bg-slate-900/45"
                            }`}
                          >
                            <div className="grid gap-3 md:grid-cols-[1fr_0.85fr_0.9fr_1.15fr_auto_auto] md:items-center">
                              <div className="min-w-0">
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className="text-base font-semibold text-white">Order #{order.id}</span>
                                  {highlighted ? (
                                    <span className="rounded-full border border-amber-400/30 bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-amber-100">
                                      Highlighted
                                    </span>
                                  ) : null}
                                </div>
                                <div className="mt-1 text-xs text-slate-500">
                                  {formatDateTime(order.created_at)}
                                </div>
                              </div>

                              <div className="text-sm font-medium text-slate-200">
                                {orderTypeLabel(order.order_type)}
                              </div>

                              <div className="text-sm font-semibold text-white">
                                {formatCurrency(order.total_amount)}
                              </div>

                              <div className="min-w-0">
                                <div className={`inline-flex max-w-full items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] ${settlement.tone}`}>
                                  {settlement.label}
                                </div>
                                <div className="mt-1 truncate text-xs text-slate-500">
                                  Pending {formatCurrency(order.pending_from_rider)} • Collected {formatCurrency(order.collected_from_rider)}
                                </div>
                              </div>

                              <div className="flex md:justify-end">
                                <button
                                  onClick={() => viewOrder(order.id)}
                                  className="rounded-2xl border border-slate-700 px-3 py-2 text-sm font-semibold text-slate-200 transition hover:border-slate-500 hover:text-white"
                                >
                                  View Order
                                </button>
                              </div>

                              <div className="flex md:justify-end">
                                {order.can_collect_from_rider ? (
                                  <button
                                    onClick={() => handleCollectDeliveryLedgerOrder(order)}
                                    disabled={collectingDeliveryLedger}
                                    className="rounded-2xl bg-emerald-500/15 px-3 py-2 text-sm font-semibold text-emerald-100 transition hover:bg-emerald-500/25 disabled:cursor-not-allowed disabled:opacity-60"
                                  >
                                    Collect
                                  </button>
                                ) : (
                                  <div className="rounded-2xl border border-slate-700 bg-slate-950/80 px-3 py-2 text-sm font-semibold text-slate-400">
                                    No Collect
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })
                    ) : (
                      <div className="px-4 py-10 text-center text-sm text-slate-500">
                        No delivery orders found for this rider and date range.
                      </div>
                    )}
                  </div>
                </>
              ) : (
                <div className="py-10 text-center text-sm text-slate-500">
                  No rider ledger loaded yet.
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {activeTab === "TRANSACTIONS" && (
        <div className="rounded-3xl border border-slate-800 bg-slate-950/70 p-5">
          <div className="flex flex-col gap-2 border-b border-slate-800 pb-4 md:flex-row md:items-end md:justify-between">
            <div>
              <div className="text-lg font-semibold">Transaction Explorer</div>
              <div className="mt-1 text-sm text-slate-400">
                Search references, descriptions, payment types, dates, and account trails.
              </div>
            </div>
            <div className="text-xs uppercase tracking-[0.28em] text-slate-500">
              {transactions.length} entries
            </div>
          </div>

          <div className="mt-4 grid gap-4 xl:grid-cols-3">
            <input
              type="text"
              value={transactionFilters.search}
              onChange={(event) =>
                setTransactionFilters((current) => ({
                  ...current,
                  search: event.target.value,
                }))
              }
              className="w-full rounded-2xl border border-slate-700 bg-slate-900 px-4 py-3 text-white outline-none transition focus:border-sky-500"
              placeholder="Search reference, description, account..."
            />

            <select
              value={transactionFilters.account_id}
              onChange={(event) =>
                setTransactionFilters((current) => ({
                  ...current,
                  account_id: event.target.value,
                }))
              }
              className="w-full rounded-2xl border border-slate-700 bg-slate-900 px-4 py-3 text-white outline-none transition focus:border-sky-500"
            >
              <option value="">All Accounts</option>
              {accounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.name}
                </option>
              ))}
            </select>

            <select
              value={transactionFilters.account_type}
              onChange={(event) =>
                setTransactionFilters((current) => ({
                  ...current,
                  account_type: event.target.value,
                }))
              }
              className="w-full rounded-2xl border border-slate-700 bg-slate-900 px-4 py-3 text-white outline-none transition focus:border-sky-500"
            >
              <option value="">All Account Types</option>
              <option value="CUSTOMER">Customer</option>
              <option value="DELIVERY">Delivery Boy</option>
              <option value="VENDOR">Vendor</option>
              <option value="CASH">Cash Drawer</option>
            </select>

            <select
              value={transactionFilters.entry_type}
              onChange={(event) =>
                setTransactionFilters((current) => ({
                  ...current,
                  entry_type: event.target.value,
                }))
              }
              className="w-full rounded-2xl border border-slate-700 bg-slate-900 px-4 py-3 text-white outline-none transition focus:border-sky-500"
            >
              {ENTRY_TYPE_OPTIONS.map((option) => (
                <option key={option.value || "all"} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>

            <select
              value={transactionFilters.payment_type}
              onChange={(event) =>
                setTransactionFilters((current) => ({
                  ...current,
                  payment_type: event.target.value,
                }))
              }
              className="w-full rounded-2xl border border-slate-700 bg-slate-900 px-4 py-3 text-white outline-none transition focus:border-sky-500"
            >
              {PAYMENT_TYPE_OPTIONS.map((option) => (
                <option key={option.value || "all"} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>

            <input
              type="date"
              value={transactionFilters.start_date}
              onChange={(event) =>
                setTransactionFilters((current) => ({
                  ...current,
                  start_date: event.target.value,
                }))
              }
              className="w-full rounded-2xl border border-slate-700 bg-slate-900 px-4 py-3 text-white outline-none transition focus:border-sky-500"
            />

            <input
              type="date"
              value={transactionFilters.end_date}
              onChange={(event) =>
                setTransactionFilters((current) => ({
                  ...current,
                  end_date: event.target.value,
                }))
              }
              className="w-full rounded-2xl border border-slate-700 bg-slate-900 px-4 py-3 text-white outline-none transition focus:border-sky-500"
            />
          </div>

          <div className="mt-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="grid gap-3 md:grid-cols-3">
              <div className="rounded-2xl border border-slate-800 bg-slate-900/60 px-4 py-3">
                <div className="text-xs uppercase tracking-[0.2em] text-slate-500">Credits</div>
                <div className="mt-2 text-lg font-semibold text-emerald-200">
                  {formatCurrency(transactionSummary.totalCredits)}
                </div>
              </div>
              <div className="rounded-2xl border border-slate-800 bg-slate-900/60 px-4 py-3">
                <div className="text-xs uppercase tracking-[0.2em] text-slate-500">Debits</div>
                <div className="mt-2 text-lg font-semibold text-rose-200">
                  {formatCurrency(transactionSummary.totalDebits)}
                </div>
              </div>
              <div className="rounded-2xl border border-slate-800 bg-slate-900/60 px-4 py-3">
                <div className="text-xs uppercase tracking-[0.2em] text-slate-500">Entries</div>
                <div className="mt-2 text-lg font-semibold text-white">{transactions.length}</div>
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={clearTransactionFilters}
                className="rounded-2xl border border-slate-700 px-4 py-3 font-semibold text-slate-200 transition hover:border-slate-500 hover:text-white"
              >
                Clear
              </button>
              <button
                onClick={applyTransactionFilters}
                className="rounded-2xl bg-sky-500 px-4 py-3 font-semibold text-slate-950 transition hover:bg-sky-400"
              >
                Apply Filters
              </button>
            </div>
          </div>

          <div className="mt-6 overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="text-xs uppercase tracking-[0.18em] text-slate-500">
                <tr>
                  <th className="pb-3 pr-4">Date</th>
                  <th className="pb-3 pr-4">Account</th>
                  <th className="pb-3 pr-4">Type</th>
                  <th className="pb-3 pr-4">Payment</th>
                  <th className="pb-3 pr-4">Amount</th>
                  <th className="pb-3 pr-4">Reference</th>
                  <th className="pb-3">Description</th>
                </tr>
              </thead>
              <tbody>
                {loadingTransactions ? (
                  <tr>
                    <td colSpan="7" className="py-10 text-center text-slate-500">
                      Loading transactions...
                    </td>
                  </tr>
                ) : transactions.length === 0 ? (
                  <tr>
                    <td colSpan="7" className="py-10 text-center text-slate-500">
                      No transactions found for the selected filters.
                    </td>
                  </tr>
                ) : (
                  transactions.map((entry) => (
                    <tr key={entry.id} className="border-t border-slate-800 align-top">
                      <td className="py-3 pr-4 text-slate-300">{formatDateTime(entry.date)}</td>
                      <td className="py-3 pr-4">
                        <button
                          onClick={() => openAccountReport(entry.account_id)}
                          className="text-left text-white transition hover:text-sky-300"
                        >
                          {entry.account}
                        </button>
                        <div className="mt-1 text-xs uppercase tracking-[0.18em] text-slate-500">
                          {entry.account_type}
                        </div>
                      </td>
                      <td className="py-3 pr-4 text-slate-200">{entry.entry_type}</td>
                      <td className="py-3 pr-4 text-slate-200">{entry.payment_type}</td>
                      <td className="py-3 pr-4 font-semibold text-white">{formatCurrency(entry.amount)}</td>
                      <td className="py-3 pr-4 text-slate-400">{entry.reference || "-"}</td>
                      <td className="py-3 text-slate-400">{entry.description || "-"}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === "VENDOR_LEDGER" && (
        <div className="grid gap-6 xl:grid-cols-[0.96fr_1.04fr]">
          <div className="space-y-6">
            <div className="rounded-3xl border border-slate-800 bg-slate-950/70 p-5">
              <div className="border-b border-slate-800 pb-4">
                <div className="text-lg font-semibold text-white">Vendor Ledger Workspace</div>
                <div className="mt-1 text-sm text-slate-400">
                  Use this for fast vendor entries during operations and for dispute-ready statements when a vendor needs a detailed balance trail.
                </div>
              </div>

              <div className="mt-4 space-y-4">
                <div className="flex flex-wrap justify-end gap-3">
                  <button
                    onClick={startVendorAccountCreate}
                    className="rounded-2xl border border-sky-500/30 bg-sky-500/10 px-4 py-3 text-sm font-semibold text-sky-100 transition hover:bg-sky-500/20"
                  >
                    Create Vendor Account
                  </button>
                </div>

                <div>
                  <label className="mb-2 block text-sm text-slate-300">Vendor Account</label>
                  <select
                    value={selectedVendorId}
                    onChange={(event) => handleVendorSelection(event.target.value)}
                    className="w-full rounded-2xl border border-slate-700 bg-slate-900 px-4 py-3 text-white outline-none transition focus:border-emerald-500"
                  >
                    <option value="">
                      {vendorAccounts.length ? "Choose vendor" : "No vendor accounts yet"}
                    </option>
                    {vendorAccounts.map((account) => (
                      <option key={account.id} value={account.id}>
                        {account.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <label className="mb-2 block text-sm text-slate-300">Action</label>
                    <div className="grid gap-3 grid-cols-2">
                      {[
                        { value: "OWE", label: "Invoice Recorded", hint: "Adds to vendor payable" },
                        { value: "PAY", label: "Payment Issued", hint: "Reduces vendor payable" },
                        { value: "ADJUST_UP", label: "Balance Correction (Increase)", hint: "Internal correction raises payable" },
                        { value: "ADJUST_DOWN", label: "Balance Correction (Decrease)", hint: "Internal correction lowers payable" },
                      ].map((option) => {
                        const selected = vendorEntryForm.mode === option.value;

                        return (
                          <button
                            key={option.value}
                            type="button"
                            onClick={() =>
                              setVendorEntryForm((current) => ({
                                ...current,
                                mode: option.value,
                              }))
                            }
                            className={`rounded-2xl border px-4 py-3 text-left transition ${
                              selected
                                ? "border-emerald-500 bg-emerald-500/10"
                                : "border-slate-800 bg-slate-900/60 hover:border-slate-600"
                            }`}
                          >
                            <div className="font-semibold text-white">{option.label}</div>
                            <div className="mt-1 text-xs text-slate-400">{option.hint}</div>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div>
                    <label className="mb-2 block text-sm text-slate-300">Payment Type</label>
                    <select
                      value={vendorEntryForm.payment_type}
                      onChange={(event) =>
                        setVendorEntryForm((current) => ({
                          ...current,
                          payment_type: event.target.value,
                        }))
                      }
                      disabled={vendorEntryForm.mode !== "PAY"}
                      className="w-full rounded-2xl border border-slate-700 bg-slate-900 px-4 py-3 text-white outline-none transition focus:border-emerald-500 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      <option value="CASH">Cash</option>
                      <option value="ONLINE">Online</option>
                    </select>
                    <div className="mt-2 text-xs text-slate-500">
                      Payment type only matters when you are recording money paid to the vendor.
                    </div>
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-3">
                  <div>
                    <label className="mb-2 block text-sm text-slate-300">Statement Date</label>
                    <input
                      type="date"
                      value={vendorEntryForm.entry_date}
                      onChange={(event) =>
                        setVendorEntryForm((current) => ({
                          ...current,
                          entry_date: event.target.value,
                        }))
                      }
                      className="w-full rounded-2xl border border-slate-700 bg-slate-900 px-4 py-3 text-white outline-none transition focus:border-emerald-500"
                    />
                  </div>

                  <div>
                    <label className="mb-2 block text-sm text-slate-300">Document Number</label>
                    <input
                      type="text"
                      value={vendorEntryForm.document_number}
                      onChange={(event) =>
                        setVendorEntryForm((current) => ({
                          ...current,
                          document_number: event.target.value,
                        }))
                      }
                      className="w-full rounded-2xl border border-slate-700 bg-slate-900 px-4 py-3 text-white outline-none transition focus:border-emerald-500"
                      placeholder="Invoice, bill, challan, receipt no."
                    />
                  </div>

                  <div>
                    <label className="mb-2 block text-sm text-slate-300">Amount</label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={vendorEntryForm.amount}
                      onChange={(event) =>
                        setVendorEntryForm((current) => ({
                          ...current,
                          amount: event.target.value,
                        }))
                      }
                      className="w-full rounded-2xl border border-slate-700 bg-slate-900 px-4 py-3 text-white outline-none transition focus:border-emerald-500"
                      placeholder="0.00"
                    />
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <label className="mb-2 block text-sm text-slate-300">Note</label>
                    <input
                      type="text"
                      value={vendorEntryForm.note}
                      onChange={(event) =>
                        setVendorEntryForm((current) => ({
                          ...current,
                          note: event.target.value,
                        }))
                      }
                      className="w-full rounded-2xl border border-slate-700 bg-slate-900 px-4 py-3 text-white outline-none transition focus:border-emerald-500"
                      placeholder="Example: Rice sack purchase"
                    />
                  </div>

                  <div className="rounded-2xl border border-slate-800 bg-slate-900/50 px-4 py-3 text-sm text-slate-400">
                    Manual adjustments are meant for corrections, dispute settlements, and backward balance fixes without touching original audit history.
                  </div>
                </div>

                <div className="flex flex-col gap-3 sm:flex-row">
                  <button
                    onClick={handleSaveVendorEntry}
                    disabled={savingVendorEntry}
                    className="flex-1 rounded-2xl bg-emerald-500 px-4 py-3 font-semibold text-slate-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:bg-emerald-500/60"
                  >
                    <InlineButtonContent busy={savingVendorEntry} busyLabel="Saving...">
                      Save Vendor Entry
                    </InlineButtonContent>
                  </button>
                  {selectedVendorId ? (
                    <button
                      onClick={() => {
                        const selectedVendor = vendorAccounts.find(
                          (account) => String(account.id) === String(selectedVendorId),
                        );
                        if (selectedVendor) {
                          handleOpenQuickDelete(selectedVendor);
                        }
                      }}
                      className="rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 font-semibold text-rose-100 transition hover:bg-rose-500/20"
                    >
                      Delete Vendor Account
                    </button>
                  ) : null}
                </div>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-3xl border border-slate-800 bg-slate-950/70 p-4">
                <div className="text-xs uppercase tracking-[0.28em] text-slate-500">Vendor Accounts</div>
                <div className="mt-2 text-2xl font-semibold text-emerald-200">{vendorAccounts.length}</div>
              </div>
              <div className="rounded-3xl border border-slate-800 bg-slate-950/70 p-4">
                <div className="text-xs uppercase tracking-[0.28em] text-slate-500">Live Current Due</div>
                <div className="mt-2 text-2xl font-semibold text-amber-200">
                  {vendorReport ? formatCurrency(vendorReport.summary.current_balance) : formatCurrency(0)}
                </div>
              </div>
              <div className="rounded-3xl border border-slate-800 bg-slate-950/70 p-4">
                <div className="text-xs uppercase tracking-[0.28em] text-slate-500">Statement Opening</div>
                <div className="mt-2 text-2xl font-semibold text-white">
                  {vendorReport ? formatCurrency(vendorReport.summary.statement_opening_balance) : formatCurrency(0)}
                </div>
              </div>
              <div className="rounded-3xl border border-slate-800 bg-slate-950/70 p-4">
                <div className="text-xs uppercase tracking-[0.28em] text-slate-500">Statement Closing</div>
                <div className="mt-2 text-2xl font-semibold text-sky-200">
                  {vendorReport ? formatCurrency(vendorReport.summary.statement_closing_balance) : formatCurrency(0)}
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-6">
            <div className="rounded-3xl border border-slate-800 bg-slate-950/70 p-5">
              <div className="flex items-start justify-between gap-3 border-b border-slate-800 pb-4">
                <div>
                  <div className="text-lg font-semibold text-white">Selected Vendor Snapshot</div>
                  <div className="mt-1 text-sm text-slate-400">
                    Open a vendor to review statement range, balance movement, document references, and printable conflict-ready details.
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  {vendorReport ? (
                    <>
                      <button
                        onClick={() => openAccountReport(vendorReport.account.id)}
                        className="rounded-2xl border border-slate-700 px-3 py-2 text-sm text-slate-200 transition hover:border-slate-500 hover:text-white"
                      >
                        View Full Ledger
                      </button>
                      <button
                        onClick={() => openVendorStatementWindow(vendorReport)}
                        className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm font-semibold text-emerald-100 transition hover:bg-emerald-500/20"
                      >
                        Print Statement
                      </button>
                    </>
                  ) : null}
                </div>
              </div>

              {!selectedVendorId ? (
                <div className="py-10 text-center text-sm text-slate-500">
                  <div>Choose a vendor to open the ledger workspace.</div>
                  {!vendorAccounts.length ? (
                    <button
                      onClick={startVendorAccountCreate}
                      className="mt-4 rounded-2xl border border-sky-500/30 bg-sky-500/10 px-4 py-3 text-sm font-semibold text-sky-100 transition hover:bg-sky-500/20"
                    >
                      Create Your First Vendor
                    </button>
                  ) : null}
                </div>
              ) : loadingVendorReport ? (
                <PanelLoader
                  eyebrow="Vendor Ledger"
                  label="Loading vendor activity..."
                  description="Pulling vendor balance, statement range, manual dues, payments, and undo-ready entries."
                />
              ) : vendorReport ? (
                <>
                  <div className="mt-4 rounded-2xl border border-slate-800 bg-slate-900/50 p-4">
                    <div className="grid gap-3 md:grid-cols-[1fr_1fr_auto_auto]">
                      <input
                        type="date"
                        value={vendorStatementFilters.start_date}
                        onChange={(event) =>
                          setVendorStatementFilters((current) => ({
                            ...current,
                            start_date: event.target.value,
                          }))
                        }
                        className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-white outline-none transition focus:border-emerald-500"
                      />
                      <input
                        type="date"
                        value={vendorStatementFilters.end_date}
                        onChange={(event) =>
                          setVendorStatementFilters((current) => ({
                            ...current,
                            end_date: event.target.value,
                          }))
                        }
                        className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-white outline-none transition focus:border-emerald-500"
                      />
                      <button
                        onClick={handleClearVendorStatementFilters}
                        className="rounded-2xl border border-slate-700 px-4 py-3 font-semibold text-slate-200 transition hover:border-slate-500 hover:text-white"
                      >
                        Clear
                      </button>
                      <button
                        onClick={handleApplyVendorStatementFilters}
                        className="rounded-2xl bg-emerald-500 px-4 py-3 font-semibold text-slate-950 transition hover:bg-emerald-400"
                      >
                        Apply Range
                      </button>
                    </div>
                    <div className="mt-3 text-sm text-slate-400">
                      Statement range: <span className="font-semibold text-slate-200">{formatStatementRange(vendorReport.filters)}</span>
                    </div>
                  </div>

                  <div className="mt-4 grid gap-4 md:grid-cols-2">
                    <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
                      <div className="text-xs uppercase tracking-[0.2em] text-slate-500">Vendor</div>
                      <div className="mt-2 text-xl font-semibold text-white">{vendorReport.account.name}</div>
                      <div className="mt-2 text-sm text-slate-400">
                        {vendorReport.account.contact_number || "No phone"} • {vendorReport.account.address || "No address"}
                      </div>
                    </div>
                    <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
                      <div className="text-xs uppercase tracking-[0.2em] text-slate-500">Closing Balance For This Statement</div>
                      <div className="mt-2 text-2xl font-semibold text-amber-200">
                        {formatCurrency(vendorReport.summary.statement_closing_balance)}
                      </div>
                      <div className="mt-2 text-sm text-slate-400">
                        Positive means the restaurant still owes this vendor for the selected statement range.
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-5">
                    <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
                      <div className="text-xs uppercase tracking-[0.2em] text-slate-500">Due Added</div>
                      <div className="mt-2 text-xl font-semibold text-white">
                        {formatCurrency(vendorReport.vendor_statement?.due_added || 0)}
                      </div>
                    </div>
                    <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
                      <div className="text-xs uppercase tracking-[0.2em] text-slate-500">Payments Made</div>
                      <div className="mt-2 text-xl font-semibold text-emerald-200">
                        {formatCurrency(vendorReport.vendor_statement?.payments_made || 0)}
                      </div>
                    </div>
                    <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
                      <div className="text-xs uppercase tracking-[0.2em] text-slate-500">Adjust Up</div>
                      <div className="mt-2 text-xl font-semibold text-amber-200">
                        {formatCurrency(vendorReport.vendor_statement?.adjustments_up || 0)}
                      </div>
                    </div>
                    <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
                      <div className="text-xs uppercase tracking-[0.2em] text-slate-500">Adjust Down</div>
                      <div className="mt-2 text-xl font-semibold text-sky-200">
                        {formatCurrency(vendorReport.vendor_statement?.adjustments_down || 0)}
                      </div>
                    </div>
                    <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
                      <div className="text-xs uppercase tracking-[0.2em] text-slate-500">Transactions</div>
                      <div className="mt-2 text-xl font-semibold text-white">
                        {vendorReport.summary.transaction_count}
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 overflow-x-auto">
                    <table className="min-w-full text-left text-sm">
                      <thead className="text-xs uppercase tracking-[0.18em] text-slate-500">
                        <tr>
                          <th className="pb-3 pr-4">Statement Date</th>
                          <th className="pb-3 pr-4">Logged</th>
                          <th className="pb-3 pr-4">Action</th>
                          <th className="pb-3 pr-4">Document</th>
                          <th className="pb-3 pr-4">Amount</th>
                          <th className="pb-3 pr-4">Payment</th>
                          <th className="pb-3 pr-4">Created By</th>
                          <th className="pb-3 pr-4">Note</th>
                          <th className="pb-3 pr-4">Running</th>
                          <th className="pb-3">Undo</th>
                        </tr>
                      </thead>
                      <tbody>
                        {vendorReport.transactions.length ? (
                          vendorReport.transactions.map((entry) => (
                              <tr key={entry.id} className="border-t border-slate-800 align-top">
                                <td className="py-3 pr-4 text-slate-300">{formatDate(entry.entry_date)}</td>
                                <td className="py-3 pr-4 text-slate-400">{formatDateTime(entry.date)}</td>
                                <td className="py-3 pr-4">
                                  <div className="font-semibold text-white">{vendorActionLabel(entry)}</div>
                                  <div className="mt-1 text-xs uppercase tracking-[0.18em] text-slate-500">
                                    {entry.reference || "-"}
                                  </div>
                                </td>
                                <td className="py-3 pr-4 text-slate-300">{entry.document_number || "-"}</td>
                                <td className="py-3 pr-4 font-semibold text-white">{formatCurrency(entry.amount)}</td>
                                <td className="py-3 pr-4 text-slate-300">{entry.payment_type}</td>
                                <td className="py-3 pr-4 text-slate-400">{entry.created_by_name || "-"}</td>
                                <td className="py-3 pr-4 text-slate-400">{entry.description || "-"}</td>
                                <td className="py-3 pr-4 font-semibold text-amber-200">
                                  {formatCurrency(entry.running_balance)}
                                </td>
                                <td className="py-3">
                                  {entry.can_undo ? (
                                    <button
                                      onClick={() => handleUndoVendorEntry(entry.id)}
                                      className="rounded-2xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-amber-100 transition hover:bg-amber-500/20"
                                    >
                                      Undo
                                    </button>
                                ) : (
                                  <span className="text-xs text-slate-500">Locked</span>
                                )}
                                </td>
                              </tr>
                            ))
                        ) : (
                          <tr>
                            <td colSpan="10" className="py-10 text-center text-slate-500">
                              No vendor transactions found for the selected statement range.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </>
              ) : (
                <div className="py-10 text-center text-sm text-slate-500">
                  No vendor report available right now.
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {activeTab === "REPORT" && (
        <div className="space-y-6">
          <div className="rounded-3xl border border-slate-800 bg-slate-950/70 p-5">
            <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
              <div>
                <div className="text-lg font-semibold">Daily Ledger Summary</div>
                <div className="mt-1 text-sm text-slate-400">
                  Understand what came in from orders, what came in from old dues, and what went out.
                </div>
              </div>
              <div className="flex gap-3">
                <input
                  type="date"
                  value={dailyDate}
                  onChange={(event) => setDailyDate(event.target.value)}
                  className="rounded-2xl border border-slate-700 bg-slate-900 px-4 py-3 text-white outline-none transition focus:border-sky-500"
                />
                <button
                  onClick={() => loadDailyReport(dailyDate)}
                  className="rounded-2xl bg-sky-500 px-4 py-3 font-semibold text-slate-950 transition hover:bg-sky-400"
                >
                  Refresh
                </button>
              </div>
            </div>
          </div>

          {loadingDailyReport || !dailyReport ? (
            <div className="rounded-3xl border border-dashed border-slate-800 px-4 py-10 text-center text-sm text-slate-500">
              Loading daily ledger summary...
            </div>
          ) : (
            <>
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <div className="rounded-3xl border border-slate-800 bg-slate-950/70 p-4">
                  <div className="text-xs uppercase tracking-[0.28em] text-slate-500">Cash Drawer</div>
                  <div className="mt-2 text-2xl font-semibold text-emerald-200">
                    {formatCurrency(dailyReport.summary.cash_drawer_balance)}
                  </div>
                </div>
                <div className="rounded-3xl border border-slate-800 bg-slate-950/70 p-4">
                  <div className="text-xs uppercase tracking-[0.28em] text-slate-500">Order Cash</div>
                  <div className="mt-2 text-2xl font-semibold text-white">
                    {formatCurrency(dailyReport.summary.order_cash_collections)}
                  </div>
                </div>
                <div className="rounded-3xl border border-slate-800 bg-slate-950/70 p-4">
                  <div className="text-xs uppercase tracking-[0.28em] text-slate-500">Order Online</div>
                  <div className="mt-2 text-2xl font-semibold text-white">
                    {formatCurrency(dailyReport.summary.order_online_collections)}
                  </div>
                </div>
                <div className="rounded-3xl border border-slate-800 bg-slate-950/70 p-4">
                  <div className="text-xs uppercase tracking-[0.28em] text-slate-500">Manual Collections</div>
                  <div className="mt-2 text-2xl font-semibold text-sky-200">
                    {formatCurrency(dailyReport.summary.total_manual_collections)}
                  </div>
                </div>
                <div className="rounded-3xl border border-slate-800 bg-slate-950/70 p-4">
                  <div className="text-xs uppercase tracking-[0.28em] text-slate-500">Refunds</div>
                  <div className="mt-2 text-2xl font-semibold text-rose-200">
                    {formatCurrency(dailyReport.summary.refunds_issued)}
                  </div>
                </div>
                <div className="rounded-3xl border border-slate-800 bg-slate-950/70 p-4">
                  <div className="text-xs uppercase tracking-[0.28em] text-slate-500">Change Given</div>
                  <div className="mt-2 text-2xl font-semibold text-rose-200">
                    {formatCurrency(dailyReport.summary.change_given)}
                  </div>
                </div>
                <div className="rounded-3xl border border-slate-800 bg-slate-950/70 p-4">
                  <div className="text-xs uppercase tracking-[0.28em] text-slate-500">Net Cash Movement</div>
                  <div className="mt-2 text-2xl font-semibold text-emerald-200">
                    {formatCurrency(dailyReport.summary.net_cash_movement)}
                  </div>
                </div>
                <div className="rounded-3xl border border-slate-800 bg-slate-950/70 p-4">
                  <div className="text-xs uppercase tracking-[0.28em] text-slate-500">Unpaid Orders</div>
                  <div className="mt-2 text-2xl font-semibold text-amber-200">
                    {dailyReport.summary.unpaid_orders_count}
                  </div>
                </div>
              </div>

              <div className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
                <div className="space-y-6">
                  <div className="rounded-3xl border border-slate-800 bg-slate-950/70 p-5">
                    <div className="flex items-center justify-between gap-3 border-b border-slate-800 pb-4">
                      <div>
                        <div className="text-lg font-semibold">Collections Breakdown</div>
                        <div className="mt-1 text-sm text-slate-400">
                          Split between live order collections and old dues received manually.
                        </div>
                      </div>
                    </div>

                    <div className="mt-4 grid gap-4 md:grid-cols-2">
                      <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
                        <div className="text-xs uppercase tracking-[0.2em] text-slate-500">Order Collections</div>
                        <div className="mt-2 text-lg font-semibold text-white">
                          {formatCurrency(dailyReport.summary.total_order_collections)}
                        </div>
                      </div>
                      <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
                        <div className="text-xs uppercase tracking-[0.2em] text-slate-500">Manual Customer Collections</div>
                        <div className="mt-2 text-lg font-semibold text-sky-200">
                          {formatCurrency(dailyReport.summary.total_manual_collections)}
                        </div>
                      </div>
                      <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
                        <div className="text-xs uppercase tracking-[0.2em] text-slate-500">Customer Outstanding</div>
                        <div className="mt-2 text-lg font-semibold text-amber-200">
                          {formatCurrency(dailyReport.summary.customer_outstanding)}
                        </div>
                      </div>
                      <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
                        <div className="text-xs uppercase tracking-[0.2em] text-slate-500">Delivery Pending</div>
                        <div className="mt-2 text-lg font-semibold text-rose-200">
                          {formatCurrency(dailyReport.summary.delivery_pending)}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="rounded-3xl border border-slate-800 bg-slate-950/70 p-5">
                  <div className="flex items-center justify-between gap-3 border-b border-slate-800 pb-4">
                    <div>
                      <div className="text-lg font-semibold">Current Unpaid Orders</div>
                      <div className="mt-1 text-sm text-slate-400">
                        These are active unpaid orders still open in the system.
                      </div>
                    </div>
                    <div className="text-xs uppercase tracking-[0.28em] text-slate-500">
                      {dailyReport.summary.unpaid_orders_count} orders
                    </div>
                  </div>

                  <div className="mt-4 overflow-x-auto">
                    <table className="min-w-full text-left text-sm">
                      <thead className="text-xs uppercase tracking-[0.18em] text-slate-500">
                        <tr>
                          <th className="pb-3 pr-4">Order</th>
                          <th className="pb-3 pr-4">Type</th>
                          <th className="pb-3 pr-4">Customer</th>
                          <th className="pb-3 pr-4">Phone</th>
                          <th className="pb-3 pr-4">Total</th>
                          <th className="pb-3 pr-4">Status</th>
                          <th className="pb-3">View</th>
                        </tr>
                      </thead>
                      <tbody>
                        {dailyReport.unpaid_orders.length ? (
                          dailyReport.unpaid_orders.map((order) => (
                            <tr key={order.id} className="border-t border-slate-800 align-top">
                              <td className="py-3 pr-4 font-semibold text-white">#{order.id}</td>
                              <td className="py-3 pr-4 text-slate-300">{order.type}</td>
                              <td className="py-3 pr-4 text-slate-300">{order.customer || "-"}</td>
                              <td className="py-3 pr-4 text-slate-400">{order.phone || "-"}</td>
                              <td className="py-3 pr-4 font-semibold text-white">{formatCurrency(order.total)}</td>
                              <td className="py-3 pr-4 text-slate-300">{order.status}</td>
                              <td className="py-3">
                                <button
                                  onClick={() => viewOrder(order.id)}
                                  className="rounded-2xl border border-slate-700 px-3 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-200 transition hover:border-slate-500 hover:text-white"
                                >
                                  View
                                </button>
                              </td>
                            </tr>
                          ))
                        ) : (
                          <tr>
                            <td colSpan="7" className="py-10 text-center text-slate-500">
                              No unpaid orders currently open.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {error && (
        <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
          {error}
        </div>
      )}

      {success && (
        <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">
          {success}
        </div>
      )}

      <AccountManagementUnlockModal
        open={showAccountManagementUnlock}
        password={accountManagementPassword}
        error={accountManagementUnlockError}
        onClose={() => setShowAccountManagementUnlock(false)}
        onChange={setAccountManagementPassword}
        onSubmit={handleAccountManagementUnlock}
      />

      <QuickDeleteModal
        account={quickDeleteState.account}
        password={quickDeleteState.password}
        error={quickDeleteState.error}
        loading={quickDeleteState.loading}
        onClose={() =>
          setQuickDeleteState({
            account: null,
            password: "",
            error: "",
            loading: false,
          })
        }
        onChange={(value) =>
          setQuickDeleteState((current) => ({
            ...current,
            password: value,
          }))
        }
        onSubmit={handleConfirmQuickDelete}
      />

      <BulkQuickDeleteModal
        count={bulkQuickDeleteState.open ? selectedAccountIds.length : 0}
        password={bulkQuickDeleteState.password}
        error={bulkQuickDeleteState.error}
        loading={bulkQuickDeleteState.loading}
        onClose={() =>
          setBulkQuickDeleteState({
            open: false,
            password: "",
            error: "",
            loading: false,
          })
        }
        onChange={(value) =>
          setBulkQuickDeleteState((current) => ({
            ...current,
            password: value,
            error: "",
          }))
        }
        onSubmit={handleConfirmBulkQuickDelete}
      />

      {collectState.account && (
        <CollectModal
          account={collectState.account}
          amount={collectState.amount}
          paymentType={collectState.payment_type}
          onAmountChange={(value) =>
            setCollectState((current) => ({
              ...current,
              amount: value,
            }))
          }
          onPaymentTypeChange={(value) =>
            setCollectState((current) => ({
              ...current,
              payment_type: value,
            }))
          }
          onClose={() =>
            setCollectState({
              account: null,
              amount: "",
              payment_type: "CASH",
            })
          }
          onConfirm={handleCollect}
          loading={collectLoading}
        />
      )}

      {loadingAccountReport && !accountReport && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm">
          <div className="rounded-2xl border border-slate-800 bg-slate-950 px-6 py-4 text-sm text-slate-300">
            <InlineLoaderLabel label="Loading account ledger..." />
          </div>
        </div>
      )}

      {accountReport && (
        <AccountDetailModal
          report={accountReport}
          onClose={() => setAccountReport(null)}
          onViewOrder={viewOrder}
        />
      )}

      {viewingOrder && (
        <OrderDetailModal
          order={viewingOrder}
          onClose={() => setViewingOrder(null)}
        />
      )}
    </div>
  );
}
