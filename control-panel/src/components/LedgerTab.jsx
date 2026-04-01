import { useEffect, useMemo, useState } from "react";
import api from "../services/api";

const today = new Date().toISOString().split("T")[0];

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
            {loading ? "Recording..." : "Confirm Collection"}
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
                    <th className="pb-3 pr-4">Date</th>
                    <th className="pb-3 pr-4">Type</th>
                    <th className="pb-3 pr-4">Payment</th>
                    <th className="pb-3 pr-4">Amount</th>
                    <th className="pb-3 pr-4">Reference</th>
                    <th className="pb-3 pr-4">Description</th>
                    <th className="pb-3">Running</th>
                  </tr>
                </thead>
                <tbody>
                  {report.transactions.length ? (
                    report.transactions.map((entry) => (
                      <tr key={entry.id} className="border-t border-slate-800 align-top">
                        <td className="py-3 pr-4 text-slate-300">{formatDateTime(entry.date)}</td>
                        <td className="py-3 pr-4 text-slate-200">{entry.entry_type}</td>
                        <td className="py-3 pr-4 text-slate-200">{entry.payment_type}</td>
                        <td className="py-3 pr-4 font-semibold text-white">{formatCurrency(entry.amount)}</td>
                        <td className="py-3 pr-4 text-slate-400">{entry.reference || "-"}</td>
                        <td className="py-3 pr-4 text-slate-400">{entry.description || "-"}</td>
                        <td className="py-3 font-semibold text-emerald-200">
                          {formatCurrency(entry.running_balance)}
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan="7" className="py-10 text-center text-slate-500">
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

export default function LedgerTab() {
  const [activeTab, setActiveTab] = useState("ACCOUNTS");

  const [accounts, setAccounts] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [dailyReport, setDailyReport] = useState(null);

  const [accountFilters, setAccountFilters] = useState({
    search: "",
    account_type: "",
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

  const [accountForm, setAccountForm] = useState({
    name: "",
    account_type: "CUSTOMER",
    contact_number: "",
    address: "",
    opening_balance: "0.00",
    is_active: true,
  });

  const [collectState, setCollectState] = useState({
    account: null,
    amount: "",
    payment_type: "CASH",
  });

  const [accountReport, setAccountReport] = useState(null);
  const [viewingOrder, setViewingOrder] = useState(null);

  const [loadingAccounts, setLoadingAccounts] = useState(false);
  const [loadingTransactions, setLoadingTransactions] = useState(false);
  const [loadingDailyReport, setLoadingDailyReport] = useState(false);
  const [savingAccount, setSavingAccount] = useState(false);
  const [collectLoading, setCollectLoading] = useState(false);
  const [loadingAccountReport, setLoadingAccountReport] = useState(false);

  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const loadAccounts = async () => {
    setLoadingAccounts(true);
    try {
      const response = await api.get("/accounts/", {
        params: { include_inactive: 1 },
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
    { key: "TRANSACTIONS", label: "Transactions" },
    { key: "REPORT", label: "Daily Report" },
  ];

  const handleCreateAccount = async () => {
    setError("");
    setSuccess("");

    if (!accountForm.name.trim()) {
      setError("Enter an account name first.");
      return;
    }

    setSavingAccount(true);

    try {
      await api.post("/accounts/", {
        ...accountForm,
        contact_number: accountForm.contact_number || null,
        address: accountForm.address || null,
        opening_balance: accountForm.opening_balance || "0.00",
      });

      setAccountForm({
        name: "",
        account_type: "CUSTOMER",
        contact_number: "",
        address: "",
        opening_balance: "0.00",
        is_active: true,
      });

      await loadAccounts();
      setSuccess("Ledger account created.");
    } catch (requestError) {
      setError(getErrorMessage(requestError, "Failed to create account."));
    } finally {
      setSavingAccount(false);
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

  const viewOrder = async (orderId) => {
    setError("");

    try {
      const response = await api.get(`/orders/${orderId}/`);
      setViewingOrder(response.data);
    } catch (requestError) {
      setError(getErrorMessage(requestError, "Failed to load order details."));
    }
  };

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
                  <div className="text-lg font-semibold">Create Account</div>
                  <div className="mt-1 text-sm text-slate-400">
                    Add customer, delivery, or vendor ledger accounts directly from the panel.
                  </div>
                </div>
                <div className="text-xs uppercase tracking-[0.28em] text-slate-500">Setup</div>
              </div>

              <div className="mt-4 grid gap-4">
                <div>
                  <label className="mb-2 block text-sm text-slate-300">Account Type</label>
                  <select
                    value={accountForm.account_type}
                    onChange={(event) =>
                      setAccountForm((current) => ({
                        ...current,
                        account_type: event.target.value,
                      }))
                    }
                    className="w-full rounded-2xl border border-slate-700 bg-slate-900 px-4 py-3 text-white outline-none transition focus:border-sky-500"
                  >
                    {ACCOUNT_TYPE_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="mb-2 block text-sm text-slate-300">Name</label>
                  <input
                    type="text"
                    value={accountForm.name}
                    onChange={(event) =>
                      setAccountForm((current) => ({
                        ...current,
                        name: event.target.value,
                      }))
                    }
                    className="w-full rounded-2xl border border-slate-700 bg-slate-900 px-4 py-3 text-white outline-none transition focus:border-sky-500"
                    placeholder="Enter account name"
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm text-slate-300">Phone Number</label>
                  <input
                    type="text"
                    value={accountForm.contact_number}
                    onChange={(event) =>
                      setAccountForm((current) => ({
                        ...current,
                        contact_number: event.target.value,
                      }))
                    }
                    className="w-full rounded-2xl border border-slate-700 bg-slate-900 px-4 py-3 text-white outline-none transition focus:border-sky-500"
                    placeholder="Required for customer and delivery"
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm text-slate-300">Address</label>
                  <textarea
                    value={accountForm.address}
                    onChange={(event) =>
                      setAccountForm((current) => ({
                        ...current,
                        address: event.target.value,
                      }))
                    }
                    className="min-h-[110px] w-full rounded-2xl border border-slate-700 bg-slate-900 px-4 py-3 text-white outline-none transition focus:border-sky-500"
                    placeholder="Optional"
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm text-slate-300">Opening Balance</label>
                  <input
                    type="number"
                    step="0.01"
                    value={accountForm.opening_balance}
                    onChange={(event) =>
                      setAccountForm((current) => ({
                        ...current,
                        opening_balance: event.target.value,
                      }))
                    }
                    className="w-full rounded-2xl border border-slate-700 bg-slate-900 px-4 py-3 text-white outline-none transition focus:border-sky-500"
                    placeholder="0.00"
                  />
                </div>

                <button
                  onClick={handleCreateAccount}
                  disabled={savingAccount}
                  className="rounded-2xl bg-sky-500 px-4 py-3 font-semibold text-slate-950 transition hover:bg-sky-400 disabled:cursor-not-allowed disabled:bg-sky-500/60"
                >
                  {savingAccount ? "Creating..." : "Create Account"}
                </button>
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

            <div className="mt-4 space-y-3">
              {loadingAccounts ? (
                <div className="rounded-2xl border border-dashed border-slate-800 px-4 py-8 text-center text-sm text-slate-500">
                  Loading accounts...
                </div>
              ) : filteredAccounts.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-800 px-4 py-8 text-center text-sm text-slate-500">
                  No accounts match the current filter.
                </div>
              ) : (
                filteredAccounts.map((account) => (
                  <div
                    key={account.id}
                    className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4"
                  >
                    <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
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
                      </div>
                    </div>
                  </div>
                ))
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
            Loading account ledger...
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
