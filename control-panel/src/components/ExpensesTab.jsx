import { useEffect, useMemo, useState } from "react";
import api from "../services/api";
import { InlineButtonContent, InlineLoaderLabel } from "./SystemLoader";

const PAYMENT_MODE_OPTIONS = [
  {
    value: "cash",
    label: "Cash",
    hint: "Logged as cash expense",
  },
  {
    value: "upi",
    label: "UPI",
    hint: "Digital expense",
  },
  {
    value: "card",
    label: "Card",
    hint: "Paid by card machine",
  },
  {
    value: "bank",
    label: "Bank",
    hint: "Bank transfer",
  },
];

const today = new Date().toISOString().split("T")[0];

function getMonthStart() {
  const date = new Date();
  date.setDate(1);
  return date.toISOString().split("T")[0];
}

function formatCurrency(value) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(Number(value || 0));
}

function formatDate(value) {
  if (!value) {
    return "-";
  }

  return new Date(value).toLocaleDateString("en-IN", {
    year: "numeric",
    month: "short",
    day: "numeric",
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

  if (Array.isArray(data.non_field_errors) && data.non_field_errors.length) {
    return data.non_field_errors[0];
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

function buildQueryParams(filters) {
  const params = {};

  Object.entries(filters).forEach(([key, value]) => {
    if (value !== "" && value !== null && value !== undefined) {
      params[key] = value;
    }
  });

  return params;
}

function CategoryModal({
  category,
  onClose,
  onSave,
  loading,
}) {
  const [name, setName] = useState(category?.name || "");
  const [description, setDescription] = useState(category?.description || "");
  const [isActive, setIsActive] = useState(category?.is_active ?? true);

  const handleSubmit = async () => {
    await onSave({
      name,
      description,
      is_active: isActive,
    });
  };

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-950/80 px-4 backdrop-blur-sm">
      <div className="w-full max-w-xl rounded-[28px] border border-slate-800 bg-slate-950 p-6 shadow-[0_35px_80px_rgba(15,23,42,0.55)]">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-xs uppercase tracking-[0.3em] text-emerald-300">
              Category Manager
            </div>
            <h3 className="mt-2 text-2xl font-semibold">Edit Category</h3>
            <p className="mt-2 text-sm text-slate-400">
              Update the category label, description, and whether staff can use it for fresh expenses.
            </p>
          </div>

          <button
            onClick={onClose}
            className="rounded-2xl border border-slate-800 px-3 py-2 text-sm text-slate-300 transition hover:border-slate-600 hover:text-white"
          >
            Close
          </button>
        </div>

        <div className="mt-6 grid gap-4">
          <div>
            <label className="mb-2 block text-sm text-slate-300">Category Name</label>
            <input
              type="text"
              value={name}
              onChange={(event) => setName(event.target.value)}
              className="w-full rounded-2xl border border-slate-700 bg-slate-900 px-4 py-3 text-white outline-none transition focus:border-emerald-500"
              placeholder="Utilities, Groceries, Repairs..."
            />
          </div>

          <div>
            <label className="mb-2 block text-sm text-slate-300">Description</label>
            <textarea
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              className="min-h-[120px] w-full rounded-2xl border border-slate-700 bg-slate-900 px-4 py-3 text-white outline-none transition focus:border-emerald-500"
              placeholder="Optional note for staff"
            />
          </div>

          <label className="flex items-center justify-between rounded-2xl border border-slate-800 bg-slate-900/60 px-4 py-3 text-sm text-slate-200">
            <span>Allow this category for new expense entries</span>
            <button
              type="button"
              onClick={() => setIsActive((current) => !current)}
              className={`rounded-full px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] transition ${
                isActive
                  ? "bg-emerald-500/20 text-emerald-200"
                  : "bg-rose-500/20 text-rose-200"
              }`}
            >
              {isActive ? "Active" : "Inactive"}
            </button>
          </label>
        </div>

        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
          <button
            onClick={handleSubmit}
            disabled={loading}
            className="flex-1 rounded-2xl bg-emerald-500 px-4 py-3 font-semibold text-slate-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:bg-emerald-500/60"
          >
            <InlineButtonContent busy={loading} busyLabel="Saving...">
              Save Category
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

export default function ExpensesTab() {
  const defaultFilters = useMemo(
    () => ({
      search: "",
      category: "",
      payment_mode: "",
      start_date: getMonthStart(),
      end_date: today,
    }),
    [],
  );

  const [categories, setCategories] = useState([]);
  const [expensesData, setExpensesData] = useState({
    summary: {
      total_expenses: 0,
      expense_count: 0,
      cash_expenses: 0,
      non_cash_expenses: 0,
      categories_used: 0,
    },
    category_breakdown: [],
    payment_mode_breakdown: [],
    daily_totals: [],
    expenses: [],
  });

  const [filters, setFilters] = useState(defaultFilters);
  const [draftFilters, setDraftFilters] = useState(defaultFilters);

  const [categoryForm, setCategoryForm] = useState({
    name: "",
    description: "",
  });
  const [expenseForm, setExpenseForm] = useState({
    category: "",
    amount: "",
    payment_mode: "cash",
    expense_date: today,
    description: "",
    reference_id: "",
  });

  const [editingCategory, setEditingCategory] = useState(null);

  const [loadingDashboard, setLoadingDashboard] = useState(false);
  const [savingCategory, setSavingCategory] = useState(false);
  const [savingExpense, setSavingExpense] = useState(false);

  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const activeCategories = useMemo(
    () => categories.filter((category) => category.is_active),
    [categories],
  );

  const fetchCategories = async () => {
    const response = await api.get("/expensescategory/", {
      params: { include_inactive: 1 },
    });

    setCategories(response.data);
  };

  const fetchDashboard = async (appliedFilters) => {
    setLoadingDashboard(true);

    try {
      const response = await api.get("/expenses/", {
        params: buildQueryParams(appliedFilters),
      });
      setExpensesData(response.data);
    } catch (requestError) {
      setError(getErrorMessage(requestError, "Failed to load expenses."));
    } finally {
      setLoadingDashboard(false);
    }
  };

  useEffect(() => {
    const load = async () => {
      try {
        await Promise.all([fetchCategories(), fetchDashboard(filters)]);
      } catch {
        setError("Failed to load expenses workspace.");
      }
    };

    load();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const applyFilters = async (nextFilters = draftFilters) => {
    setError("");
    setFilters(nextFilters);
    await fetchDashboard(nextFilters);
  };

  const clearFilters = async () => {
    setDraftFilters(defaultFilters);
    setError("");
    setFilters(defaultFilters);
    await fetchDashboard(defaultFilters);
  };

  const applyQuickRange = async (range) => {
    let nextFilters = { ...draftFilters };

    if (range === "today") {
      nextFilters = {
        ...nextFilters,
        start_date: today,
        end_date: today,
      };
    }

    if (range === "week") {
      const date = new Date();
      date.setDate(date.getDate() - 6);
      nextFilters = {
        ...nextFilters,
        start_date: date.toISOString().split("T")[0],
        end_date: today,
      };
    }

    if (range === "month") {
      nextFilters = {
        ...nextFilters,
        start_date: getMonthStart(),
        end_date: today,
      };
    }

    if (range === "all") {
      nextFilters = {
        ...nextFilters,
        start_date: "",
        end_date: "",
      };
    }

    setDraftFilters(nextFilters);
    await applyFilters(nextFilters);
  };

  const handleCreateCategory = async () => {
    setError("");
    setSuccess("");

    if (!categoryForm.name.trim()) {
      setError("Enter a category name first.");
      return;
    }

    setSavingCategory(true);

    try {
      const response = await api.post("/expensescategory/", {
        name: categoryForm.name,
        description: categoryForm.description || null,
      });

      setCategoryForm({
        name: "",
        description: "",
      });
      setExpenseForm((current) => ({
        ...current,
        category: current.category || String(response.data.id),
      }));
      await fetchCategories();
      setSuccess("Category created. You can use it right away.");
    } catch (requestError) {
      setError(getErrorMessage(requestError, "Failed to create category."));
    } finally {
      setSavingCategory(false);
    }
  };

  const handleSaveCategory = async (payload) => {
    if (!editingCategory) {
      return;
    }

    setError("");
    setSuccess("");
    setSavingCategory(true);

    try {
      await api.patch(`/expensescategory/${editingCategory.id}/`, payload);
      await fetchCategories();

      if (!payload.is_active && expenseForm.category === String(editingCategory.id)) {
        setExpenseForm((current) => ({
          ...current,
          category: "",
        }));
      }

      setEditingCategory(null);
      setSuccess("Category updated.");
    } catch (requestError) {
      setError(getErrorMessage(requestError, "Failed to update category."));
    } finally {
      setSavingCategory(false);
    }
  };

  const toggleCategoryStatus = async (category) => {
    setError("");
    setSuccess("");
    setSavingCategory(true);

    try {
      await api.patch(`/expensescategory/${category.id}/`, {
        is_active: !category.is_active,
      });
      await fetchCategories();

      if (category.is_active && expenseForm.category === String(category.id)) {
        setExpenseForm((current) => ({
          ...current,
          category: "",
        }));
      }

      setSuccess(
        category.is_active
          ? "Category deactivated for future expense entries."
          : "Category activated again.",
      );
    } catch (requestError) {
      setError(getErrorMessage(requestError, "Failed to update category."));
    } finally {
      setSavingCategory(false);
    }
  };

  const handleCreateExpense = async () => {
    setError("");
    setSuccess("");

    if (!expenseForm.category) {
      setError("Choose a category first.");
      return;
    }

    if (!expenseForm.amount || Number(expenseForm.amount) <= 0) {
      setError("Enter a valid amount greater than zero.");
      return;
    }

    if (!expenseForm.expense_date) {
      setError("Choose the expense date.");
      return;
    }

    setSavingExpense(true);

    try {
      await api.post("/expenses/", {
        category: Number(expenseForm.category),
        amount: expenseForm.amount,
        payment_mode: expenseForm.payment_mode,
        expense_date: expenseForm.expense_date,
        description: expenseForm.description || null,
        reference_id: expenseForm.reference_id || null,
      });

      setExpenseForm((current) => ({
        ...current,
        amount: "",
        description: "",
        reference_id: "",
        expense_date: today,
      }));

      await fetchDashboard(filters);
      await fetchCategories();

      setSuccess("Expense recorded successfully.");
    } catch (requestError) {
      setError(getErrorMessage(requestError, "Failed to record expense."));
    } finally {
      setSavingExpense(false);
    }
  };

  const useExpenseAsTemplate = (expense) => {
    setExpenseForm({
      category: String(expense.category),
      amount: expense.amount,
      payment_mode: expense.payment_mode,
      expense_date: today,
      description: expense.description || "",
      reference_id: "",
    });
    setSuccess("Expense form prefilled. Update amount/date if needed and save.");
    setError("");
  };

  const summaryCards = [
    {
      label: "Filtered Spend",
      value: formatCurrency(expensesData.summary.total_expenses),
      tone: "text-white",
    },
    {
      label: "Entries",
      value: expensesData.summary.expense_count,
      tone: "text-white",
    },
    {
      label: "Cash Paid",
      value: formatCurrency(expensesData.summary.cash_expenses),
      tone: "text-amber-200",
    },
    {
      label: "Non-Cash Paid",
      value: formatCurrency(expensesData.summary.non_cash_expenses),
      tone: "text-sky-200",
    },
    {
      label: "Categories Used",
      value: expensesData.summary.categories_used,
      tone: "text-emerald-200",
    },
  ];

  return (
    <div className="space-y-6 text-white">
      <div className="rounded-[28px] border border-slate-800 bg-[radial-gradient(circle_at_top_left,_rgba(16,185,129,0.18),_transparent_35%),linear-gradient(135deg,_rgba(15,23,42,0.98),_rgba(15,23,42,0.9))] p-6 shadow-[0_24px_60px_rgba(15,23,42,0.35)]">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="text-xs uppercase tracking-[0.35em] text-emerald-300">
              Expense Control
            </div>
            <h2 className="mt-2 text-3xl font-semibold">Expenses</h2>
            <p className="mt-2 max-w-3xl text-sm text-slate-400">
              Keep expenses manual, fast, and clean. Every entry stays independent from ledger and ready
              for deeper reporting later.
            </p>
          </div>

          <div className="rounded-3xl border border-slate-800 bg-slate-950/70 px-4 py-3 text-sm text-slate-300">
            <div className="text-xs uppercase tracking-[0.28em] text-slate-500">Current Filter Window</div>
            <div className="mt-1 font-semibold text-white">
              {filters.start_date ? formatDate(filters.start_date) : "All time"} to{" "}
              {filters.end_date ? formatDate(filters.end_date) : "Now"}
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        {summaryCards.map((card) => (
          <div
            key={card.label}
            className="rounded-3xl border border-slate-800 bg-slate-950/70 p-4"
          >
            <div className="text-xs uppercase tracking-[0.28em] text-slate-500">{card.label}</div>
            <div className={`mt-2 text-2xl font-semibold ${card.tone}`}>{card.value}</div>
          </div>
        ))}
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <div className="rounded-3xl border border-slate-800 bg-slate-950/70 p-5">
          <div className="flex flex-col gap-2 border-b border-slate-800 pb-4 md:flex-row md:items-end md:justify-between">
            <div>
              <div className="text-lg font-semibold">Record Expense</div>
              <div className="mt-1 text-sm text-slate-400">
                Built for quick daily entry with the fields you will later need in reports.
              </div>
            </div>
            <div className="text-xs uppercase tracking-[0.28em] text-slate-500">
              Fast entry
            </div>
          </div>

          <div className="mt-5 grid gap-4 md:grid-cols-2">
            <div>
              <label className="mb-2 block text-sm text-slate-300">Category</label>
              <select
                value={expenseForm.category}
                onChange={(event) =>
                  setExpenseForm((current) => ({
                    ...current,
                    category: event.target.value,
                  }))
                }
                className="w-full rounded-2xl border border-slate-700 bg-slate-900 px-4 py-3 text-white outline-none transition focus:border-emerald-500"
              >
                <option value="">Select Category</option>
                {activeCategories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-2 block text-sm text-slate-300">Amount</label>
              <input
                type="number"
                min="0"
                step="0.01"
                placeholder="0.00"
                value={expenseForm.amount}
                onChange={(event) =>
                  setExpenseForm((current) => ({
                    ...current,
                    amount: event.target.value,
                  }))
                }
                className="w-full rounded-2xl border border-slate-700 bg-slate-900 px-4 py-3 text-white outline-none transition focus:border-emerald-500"
              />
            </div>

            <div className="md:col-span-2">
              <label className="mb-2 block text-sm text-slate-300">Payment Mode</label>
              <div className="grid gap-3 md:grid-cols-4">
                {PAYMENT_MODE_OPTIONS.map((option) => {
                  const selected = expenseForm.payment_mode === option.value;

                  return (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() =>
                        setExpenseForm((current) => ({
                          ...current,
                          payment_mode: option.value,
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
              <label className="mb-2 block text-sm text-slate-300">Expense Date</label>
              <input
                type="date"
                value={expenseForm.expense_date}
                onChange={(event) =>
                  setExpenseForm((current) => ({
                    ...current,
                    expense_date: event.target.value,
                  }))
                }
                className="w-full rounded-2xl border border-slate-700 bg-slate-900 px-4 py-3 text-white outline-none transition focus:border-emerald-500"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm text-slate-300">Reference / Bill No.</label>
              <input
                type="text"
                placeholder="Optional"
                value={expenseForm.reference_id}
                onChange={(event) =>
                  setExpenseForm((current) => ({
                    ...current,
                    reference_id: event.target.value,
                  }))
                }
                className="w-full rounded-2xl border border-slate-700 bg-slate-900 px-4 py-3 text-white outline-none transition focus:border-emerald-500"
              />
            </div>

            <div className="md:col-span-2">
              <label className="mb-2 block text-sm text-slate-300">Reason / Notes</label>
              <textarea
                placeholder="What was this expense for?"
                value={expenseForm.description}
                onChange={(event) =>
                  setExpenseForm((current) => ({
                    ...current,
                    description: event.target.value,
                  }))
                }
                className="min-h-[120px] w-full rounded-2xl border border-slate-700 bg-slate-900 px-4 py-3 text-white outline-none transition focus:border-emerald-500"
              />
            </div>
          </div>

          <div className="mt-5 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="text-sm text-slate-400">
              This entry stays in expense records and future reports without changing the ledger.
            </div>

            <button
              onClick={handleCreateExpense}
              disabled={savingExpense || activeCategories.length === 0}
              className="rounded-2xl bg-emerald-500 px-6 py-3 font-semibold text-slate-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:bg-emerald-500/60"
            >
              <InlineButtonContent busy={savingExpense} busyLabel="Saving...">
                Save Expense
              </InlineButtonContent>
            </button>
          </div>
        </div>

        <div className="space-y-6">
          <div className="rounded-3xl border border-slate-800 bg-slate-950/70 p-5">
            <div className="flex items-center justify-between gap-3 border-b border-slate-800 pb-4">
              <div>
                <div className="text-lg font-semibold">Create Category</div>
                <div className="mt-1 text-sm text-slate-400">
                  Keep categories clean so reports stay readable later.
                </div>
              </div>
              <div className="text-xs uppercase tracking-[0.28em] text-slate-500">Setup</div>
            </div>

            <div className="mt-4 space-y-4">
              <input
                type="text"
                placeholder="Category name"
                value={categoryForm.name}
                onChange={(event) =>
                  setCategoryForm((current) => ({
                    ...current,
                    name: event.target.value,
                  }))
                }
                className="w-full rounded-2xl border border-slate-700 bg-slate-900 px-4 py-3 text-white outline-none transition focus:border-emerald-500"
              />
              <textarea
                placeholder="Optional description"
                value={categoryForm.description}
                onChange={(event) =>
                  setCategoryForm((current) => ({
                    ...current,
                    description: event.target.value,
                  }))
                }
                className="min-h-[110px] w-full rounded-2xl border border-slate-700 bg-slate-900 px-4 py-3 text-white outline-none transition focus:border-emerald-500"
              />

              <button
                onClick={handleCreateCategory}
                disabled={savingCategory}
                className="w-full rounded-2xl border border-emerald-500/30 bg-emerald-500/15 px-4 py-3 font-semibold text-emerald-100 transition hover:bg-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-70"
              >
                <InlineButtonContent busy={savingCategory} busyLabel="Saving...">
                  Add Category
                </InlineButtonContent>
              </button>
            </div>
          </div>

          <div className="rounded-3xl border border-slate-800 bg-slate-950/70 p-5">
            <div className="flex items-center justify-between gap-3 border-b border-slate-800 pb-4">
              <div>
                <div className="text-lg font-semibold">Categories</div>
                <div className="mt-1 text-sm text-slate-400">
                  Activate or pause categories without losing old expense history.
                </div>
              </div>
              <div className="text-xs uppercase tracking-[0.28em] text-slate-500">
                {categories.length} total
              </div>
            </div>

            <div className="mt-4 space-y-3">
              {categories.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-800 px-4 py-6 text-center text-sm text-slate-500">
                  No categories yet.
                </div>
              ) : (
                categories.map((category) => (
                  <div
                    key={category.id}
                    className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4"
                  >
                    <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                      <div>
                        <div className="flex items-center gap-2">
                          <div className="text-base font-semibold text-white">{category.name}</div>
                          <span
                            className={`rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] ${
                              category.is_active
                                ? "bg-emerald-500/15 text-emerald-200"
                                : "bg-rose-500/15 text-rose-200"
                            }`}
                          >
                            {category.is_active ? "Active" : "Inactive"}
                          </span>
                        </div>
                        <div className="mt-2 text-sm text-slate-400">
                          {category.description || "No description added yet."}
                        </div>
                        <div className="mt-3 flex flex-wrap gap-3 text-xs text-slate-500">
                          <span>{category.expense_count || 0} entries</span>
                          <span>{formatCurrency(category.total_spend)}</span>
                        </div>
                      </div>

                      <div className="flex gap-2">
                        <button
                          onClick={() => setEditingCategory(category)}
                          className="rounded-2xl border border-slate-700 px-3 py-2 text-sm text-slate-200 transition hover:border-slate-500 hover:text-white"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => toggleCategoryStatus(category)}
                          disabled={savingCategory}
                          className={`rounded-2xl px-3 py-2 text-sm font-semibold transition ${
                            category.is_active
                              ? "bg-rose-500/15 text-rose-100 hover:bg-rose-500/25"
                              : "bg-emerald-500/15 text-emerald-100 hover:bg-emerald-500/25"
                          }`}
                        >
                          {category.is_active ? "Deactivate" : "Activate"}
                        </button>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-3xl border border-slate-800 bg-slate-950/70 p-5">
        <div className="flex flex-col gap-2 border-b border-slate-800 pb-4 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="text-lg font-semibold">Filters & History</div>
            <div className="mt-1 text-sm text-slate-400">
              Review spending by period, category, mode, reference, or notes without leaving the page.
            </div>
          </div>
          <div className="text-xs uppercase tracking-[0.28em] text-slate-500">
            Audit-ready
          </div>
        </div>

        <div className="mt-4 grid gap-4 xl:grid-cols-[1.4fr_1fr_1fr_1fr_1fr]">
          <div>
            <label className="mb-2 block text-sm text-slate-300">Search</label>
            <input
              type="text"
              placeholder="Category, reason, reference..."
              value={draftFilters.search}
              onChange={(event) =>
                setDraftFilters((current) => ({
                  ...current,
                  search: event.target.value,
                }))
              }
              className="w-full rounded-2xl border border-slate-700 bg-slate-900 px-4 py-3 text-white outline-none transition focus:border-emerald-500"
            />
          </div>

          <div>
            <label className="mb-2 block text-sm text-slate-300">Category</label>
            <select
              value={draftFilters.category}
              onChange={(event) =>
                setDraftFilters((current) => ({
                  ...current,
                  category: event.target.value,
                }))
              }
              className="w-full rounded-2xl border border-slate-700 bg-slate-900 px-4 py-3 text-white outline-none transition focus:border-emerald-500"
            >
              <option value="">All Categories</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-2 block text-sm text-slate-300">Payment Mode</label>
            <select
              value={draftFilters.payment_mode}
              onChange={(event) =>
                setDraftFilters((current) => ({
                  ...current,
                  payment_mode: event.target.value,
                }))
              }
              className="w-full rounded-2xl border border-slate-700 bg-slate-900 px-4 py-3 text-white outline-none transition focus:border-emerald-500"
            >
              <option value="">All Modes</option>
              {PAYMENT_MODE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-2 block text-sm text-slate-300">From</label>
            <input
              type="date"
              value={draftFilters.start_date}
              onChange={(event) =>
                setDraftFilters((current) => ({
                  ...current,
                  start_date: event.target.value,
                }))
              }
              className="w-full rounded-2xl border border-slate-700 bg-slate-900 px-4 py-3 text-white outline-none transition focus:border-emerald-500"
            />
          </div>

          <div>
            <label className="mb-2 block text-sm text-slate-300">To</label>
            <input
              type="date"
              value={draftFilters.end_date}
              onChange={(event) =>
                setDraftFilters((current) => ({
                  ...current,
                  end_date: event.target.value,
                }))
              }
              className="w-full rounded-2xl border border-slate-700 bg-slate-900 px-4 py-3 text-white outline-none transition focus:border-emerald-500"
            />
          </div>
        </div>

        <div className="mt-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => applyQuickRange("today")}
              className="rounded-full border border-slate-700 px-4 py-2 text-sm text-slate-200 transition hover:border-slate-500 hover:text-white"
            >
              Today
            </button>
            <button
              onClick={() => applyQuickRange("week")}
              className="rounded-full border border-slate-700 px-4 py-2 text-sm text-slate-200 transition hover:border-slate-500 hover:text-white"
            >
              Last 7 Days
            </button>
            <button
              onClick={() => applyQuickRange("month")}
              className="rounded-full border border-slate-700 px-4 py-2 text-sm text-slate-200 transition hover:border-slate-500 hover:text-white"
            >
              This Month
            </button>
            <button
              onClick={() => applyQuickRange("all")}
              className="rounded-full border border-slate-700 px-4 py-2 text-sm text-slate-200 transition hover:border-slate-500 hover:text-white"
            >
              All Time
            </button>
          </div>

          <div className="flex gap-3">
            <button
              onClick={clearFilters}
              className="rounded-2xl border border-slate-700 px-4 py-3 font-semibold text-slate-200 transition hover:border-slate-500 hover:text-white"
            >
              Clear
            </button>
            <button
              onClick={() => applyFilters()}
              className="rounded-2xl bg-sky-500 px-4 py-3 font-semibold text-slate-950 transition hover:bg-sky-400"
            >
              Apply Filters
            </button>
          </div>
        </div>

        <div className="mt-6 grid gap-4 xl:grid-cols-[1.2fr_0.8fr_0.8fr]">
          <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="text-base font-semibold">Expense History</div>
              <div className="text-xs uppercase tracking-[0.28em] text-slate-500">
                {expensesData.expenses.length} entries
              </div>
            </div>

            <div className="mt-4 overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="text-xs uppercase tracking-[0.24em] text-slate-500">
                  <tr>
                    <th className="pb-3 pr-4">Date</th>
                    <th className="pb-3 pr-4">Category</th>
                    <th className="pb-3 pr-4">Reason</th>
                    <th className="pb-3 pr-4">Mode</th>
                    <th className="pb-3 pr-4">Amount</th>
                    <th className="pb-3 pr-4">Reference</th>
                    <th className="pb-3">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {loadingDashboard ? (
                    <tr>
                      <td colSpan="7" className="py-10 text-center text-slate-500">
                        <InlineLoaderLabel label="Loading expenses..." />
                      </td>
                    </tr>
                  ) : expensesData.expenses.length === 0 ? (
                    <tr>
                      <td colSpan="7" className="py-10 text-center text-slate-500">
                        No expenses found for the selected filters.
                      </td>
                    </tr>
                  ) : (
                    expensesData.expenses.map((expense) => (
                      <tr key={expense.id} className="border-t border-slate-800 align-top">
                        <td className="py-4 pr-4 text-slate-200">{formatDate(expense.expense_date)}</td>
                        <td className="py-4 pr-4">
                          <div className="font-medium text-white">{expense.category_name}</div>
                        </td>
                        <td className="py-4 pr-4 text-slate-300">
                          {expense.description || "No note"}
                        </td>
                        <td className="py-4 pr-4">
                          <span
                            className={`rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] ${
                              expense.payment_mode === "cash"
                                ? "bg-amber-500/15 text-amber-200"
                                : "bg-sky-500/15 text-sky-200"
                            }`}
                          >
                            {expense.payment_mode_display}
                          </span>
                        </td>
                        <td className="py-4 pr-4 font-semibold text-white">
                          {formatCurrency(expense.amount)}
                        </td>
                        <td className="py-4 pr-4 text-slate-400">
                          {expense.reference_id || "-"}
                        </td>
                        <td className="py-4">
                          <button
                            onClick={() => useExpenseAsTemplate(expense)}
                            className="rounded-2xl border border-slate-700 px-3 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-slate-200 transition hover:border-slate-500 hover:text-white"
                          >
                            Use Again
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="text-base font-semibold">By Category</div>
              <div className="text-xs uppercase tracking-[0.28em] text-slate-500">
                report-ready
              </div>
            </div>

            <div className="mt-4 space-y-3">
              {expensesData.category_breakdown.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-800 px-4 py-6 text-center text-sm text-slate-500">
                  No category totals yet.
                </div>
              ) : (
                expensesData.category_breakdown.map((row) => (
                  <div
                    key={row.category_id}
                    className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="font-medium text-white">{row.category_name}</div>
                      <div className="font-semibold text-emerald-200">
                        {formatCurrency(row.total_amount)}
                      </div>
                    </div>
                    <div className="mt-2 text-xs uppercase tracking-[0.2em] text-slate-500">
                      {row.expense_count} entries
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="text-base font-semibold">By Payment Mode</div>
              <div className="text-xs uppercase tracking-[0.28em] text-slate-500">
                future reports
              </div>
            </div>

            <div className="mt-4 space-y-3">
              {expensesData.payment_mode_breakdown.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-800 px-4 py-6 text-center text-sm text-slate-500">
                  No payment breakdown yet.
                </div>
              ) : (
                expensesData.payment_mode_breakdown.map((row) => (
                  <div
                    key={row.payment_mode}
                    className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="font-medium text-white">{row.payment_mode_display}</div>
                      <div className="font-semibold text-sky-200">
                        {formatCurrency(row.total_amount)}
                      </div>
                    </div>
                    <div className="mt-2 text-xs uppercase tracking-[0.2em] text-slate-500">
                      {row.expense_count} entries
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>

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

      {editingCategory && (
        <CategoryModal
          category={editingCategory}
          onClose={() => setEditingCategory(null)}
          onSave={handleSaveCategory}
          loading={savingCategory}
        />
      )}
    </div>
  );
}
