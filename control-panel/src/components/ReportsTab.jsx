import { useEffect, useMemo, useState } from "react";

import api from "../services/api";

const today = new Date().toISOString().split("T")[0];

const donutPalette = [
  "#22c55e",
  "#38bdf8",
  "#f97316",
  "#facc15",
  "#a78bfa",
  "#fb7185",
  "#14b8a6",
  "#e879f9",
];

const moneyFlowBars = [
  { key: "revenue", label: "Revenue", color: "bg-emerald-400" },
  { key: "cogs", label: "COGS", color: "bg-amber-400" },
  { key: "expenses", label: "Expenses", color: "bg-rose-400" },
];

const reasonBars = [
  { key: "total_cogs", label: "Value", color: "bg-cyan-400" },
];

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

function formatNumber(value) {
  return new Intl.NumberFormat("en-IN", {
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

function buildPresetRange(preset) {
  const end = new Date();
  const start = new Date();

  if (preset === "today") {
    return {
      from: today,
      to: today,
    };
  }

  if (preset === "week") {
    start.setDate(end.getDate() - 6);
  } else if (preset === "month") {
    start.setDate(1);
  } else if (preset === "30d") {
    start.setDate(end.getDate() - 29);
  } else if (preset === "90d") {
    start.setDate(end.getDate() - 89);
  }

  return {
    from: start.toISOString().split("T")[0],
    to: end.toISOString().split("T")[0],
  };
}

function readValue(row, valueKey) {
  if (typeof valueKey === "function") {
    return Number(valueKey(row) || 0);
  }

  return Number(row?.[valueKey] || 0);
}

function SectionCard({ title, eyebrow, description, children, className = "" }) {
  return (
    <div className={`rounded-[30px] border border-slate-800 bg-slate-950/90 p-5 shadow-[0_25px_70px_rgba(15,23,42,0.28)] ${className}`}>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          {eyebrow ? (
            <div className="text-[11px] uppercase tracking-[0.34em] text-emerald-300">
              {eyebrow}
            </div>
          ) : null}
          <h3 className="mt-2 text-xl font-semibold text-white">{title}</h3>
          {description ? (
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">
              {description}
            </p>
          ) : null}
        </div>
      </div>

      <div className="mt-5">{children}</div>
    </div>
  );
}

function MetricCard({ title, value, hint, tone = "slate" }) {
  const toneMap = {
    emerald: "border-emerald-500/25 bg-emerald-500/10 text-emerald-100",
    rose: "border-rose-500/25 bg-rose-500/10 text-rose-100",
    amber: "border-amber-500/25 bg-amber-500/10 text-amber-100",
    cyan: "border-cyan-500/25 bg-cyan-500/10 text-cyan-100",
    violet: "border-violet-500/25 bg-violet-500/10 text-violet-100",
    slate: "border-slate-800 bg-slate-900/70 text-slate-100",
  };

  return (
    <div className={`rounded-[26px] border p-4 ${toneMap[tone] || toneMap.slate}`}>
      <div className="text-[11px] uppercase tracking-[0.28em] text-slate-400">
        {title}
      </div>
      <div className="mt-3 text-2xl font-semibold">{value}</div>
      {hint ? <div className="mt-2 text-sm text-slate-300/80">{hint}</div> : null}
    </div>
  );
}

function StatusPill({ label, tone = "slate" }) {
  const toneMap = {
    emerald: "bg-emerald-500/15 text-emerald-200",
    amber: "bg-amber-500/15 text-amber-200",
    rose: "bg-rose-500/15 text-rose-200",
    cyan: "bg-cyan-500/15 text-cyan-200",
    slate: "bg-slate-800 text-slate-200",
  };

  return (
    <span className={`inline-flex rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] ${toneMap[tone] || toneMap.slate}`}>
      {label}
    </span>
  );
}

function EmptyBlock({ text }) {
  return (
    <div className="rounded-[24px] border border-dashed border-slate-700 bg-slate-900/50 px-5 py-10 text-center text-sm text-slate-400">
      {text}
    </div>
  );
}

function DonutChart({ title, subtitle, data, valueKey, centerLabel, emptyLabel = "No data" }) {
  const safeData = (data || [])
    .map((item) => ({
      ...item,
      chartValue: readValue(item, valueKey),
    }))
    .filter((item) => item.chartValue > 0);

  const total = safeData.reduce((sum, item) => sum + item.chartValue, 0);

  if (!total) {
    return (
      <SectionCard title={title} description={subtitle}>
        <EmptyBlock text={emptyLabel} />
      </SectionCard>
    );
  }

  let cursor = 0;
  const stops = safeData.map((item, index) => {
    const start = cursor;
    const end = cursor + (item.chartValue / total) * 100;
    cursor = end;
    return `${donutPalette[index % donutPalette.length]} ${start}% ${end}%`;
  });

  const centerValue = centerLabel || formatNumber(total);

  return (
    <SectionCard title={title} description={subtitle}>
      <div className="grid gap-6 xl:grid-cols-[220px,minmax(0,1fr)] xl:items-center">
        <div className="mx-auto flex h-[220px] w-[220px] items-center justify-center rounded-full border border-slate-800 bg-slate-950 shadow-inner">
          <div
            className="relative flex h-[180px] w-[180px] items-center justify-center rounded-full"
            style={{
              background: `conic-gradient(${stops.join(", ")})`,
            }}
          >
            <div className="flex h-[112px] w-[112px] flex-col items-center justify-center rounded-full border border-slate-800 bg-slate-950 text-center shadow-[0_0_0_14px_rgba(2,6,23,0.75)]">
              <div className="text-[10px] uppercase tracking-[0.28em] text-slate-400">Total</div>
              <div className="mt-2 text-lg font-semibold text-white">{centerValue}</div>
            </div>
          </div>
        </div>

        <div className="grid gap-3">
          {safeData.map((item, index) => {
            const percent = (item.chartValue / total) * 100;
            const label = item.label || item.category_name || item.payment_mode_display || item.order_type_display || item.order_status || item.reason;

            return (
              <div
                key={`${label}-${index}`}
                className="rounded-[22px] border border-slate-800 bg-slate-900/70 px-4 py-3"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <span
                      className="mt-1 inline-flex h-3 w-3 rounded-full"
                      style={{ backgroundColor: donutPalette[index % donutPalette.length] }}
                    />
                    <div>
                      <div className="text-sm font-medium text-white">{label}</div>
                      <div className="mt-1 text-xs uppercase tracking-[0.22em] text-slate-500">
                        {percent.toFixed(1)}% share
                      </div>
                    </div>
                  </div>

                  <div className="text-right">
                    <div className="text-sm font-semibold text-white">
                      {valueKey === "value" || valueKey === "order_count" || valueKey === "payment_count"
                        ? formatNumber(item.chartValue)
                        : formatCurrency(item.chartValue)}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </SectionCard>
  );
}

function GroupedBarChart({ title, subtitle, data, bars, xKey, labelFormatter, valueFormatter = formatCurrency }) {
  const chartRows = (data || []).slice(0, 12);
  const maxValue = Math.max(
    1,
    ...chartRows.flatMap((row) => bars.map((bar) => Number(row?.[bar.key] || 0))),
  );

  if (!chartRows.length) {
    return (
      <SectionCard title={title} description={subtitle}>
        <EmptyBlock text="Nothing to chart in this range yet." />
      </SectionCard>
    );
  }

  return (
    <SectionCard title={title} description={subtitle}>
      <div className="mb-5 flex flex-wrap gap-3 text-xs uppercase tracking-[0.22em] text-slate-400">
        {bars.map((bar) => (
          <div key={bar.key} className="flex items-center gap-2 rounded-full border border-slate-800 bg-slate-900/70 px-3 py-2">
            <span className={`inline-flex h-3 w-3 rounded-full ${bar.color}`} />
            {bar.label}
          </div>
        ))}
      </div>

      <div className="overflow-x-auto">
        <div className="min-w-[720px]">
          <div className="grid h-64 grid-cols-12 gap-3">
            {chartRows.map((row, rowIndex) => (
              <div key={`${row[xKey]}-${rowIndex}`} className="flex flex-col justify-end gap-3">
                <div className="relative h-48 rounded-[24px] border border-slate-800 bg-slate-900/70 px-3 py-3">
                  <div className="absolute inset-x-3 bottom-3 top-3 flex items-end justify-center gap-2">
                    {bars.map((bar) => {
                      const value = Number(row?.[bar.key] || 0);
                      const height = `${Math.max((value / maxValue) * 100, value > 0 ? 7 : 0)}%`;

                      return (
                        <div key={bar.key} className="flex h-full flex-1 items-end">
                          <div
                            className={`w-full rounded-t-2xl ${bar.color} shadow-[0_12px_24px_rgba(15,23,42,0.28)]`}
                            style={{ height }}
                            title={`${bar.label}: ${valueFormatter(value)}`}
                          />
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="text-center text-xs font-medium uppercase tracking-[0.18em] text-slate-400">
                  {labelFormatter ? labelFormatter(row[xKey], row) : row[xKey]}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </SectionCard>
  );
}

function InsightStrip({ insights }) {
  if (!insights.length) {
    return null;
  }

  return (
    <div className="grid gap-3 lg:grid-cols-3">
      {insights.map((insight, index) => (
        <div
          key={`${insight.title}-${index}`}
          className="rounded-[24px] border border-slate-800 bg-slate-900/70 px-4 py-4"
        >
          <div className="text-[10px] uppercase tracking-[0.3em] text-emerald-300">{insight.title}</div>
          <div className="mt-2 text-sm leading-6 text-slate-200">{insight.body}</div>
        </div>
      ))}
    </div>
  );
}

export default function ReportsTab() {
  const [fromDate, setFromDate] = useState(getMonthStart());
  const [toDate, setToDate] = useState(today);
  const [activePreset, setActivePreset] = useState("month");
  const [dashboard, setDashboard] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const loadReports = async (from = fromDate, to = toDate) => {
    try {
      setLoading(true);
      setError("");

      const response = await api.get("reports/dashboard/", {
        params: {
          from_date: from,
          to_date: to,
        },
      });

      setDashboard(response.data);
    } catch (err) {
      setError(getErrorMessage(err, "Unable to load reports right now."));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadReports(getMonthStart(), today);
  }, []);

  const applyPreset = (preset) => {
    const range = buildPresetRange(preset);
    setFromDate(range.from);
    setToDate(range.to);
    setActivePreset(preset);
    loadReports(range.from, range.to);
  };

  const summary = dashboard?.summary || {};
  const snapshot = dashboard?.snapshot || {};
  const charts = dashboard?.charts || {};
  const details = dashboard?.details || {};

  const insights = useMemo(() => {
    if (!dashboard) {
      return [];
    }

    const topOrderType = charts.sales_by_order_type?.[0];
    const topExpenseCategory = charts.expense_categories?.[0];
    const topSellingItem = details.top_selling_items?.[0];

    return [
      topOrderType
        ? {
            title: "Sales Direction",
            body: `${topOrderType.label} is leading the selected period with ${formatCurrency(topOrderType.total_revenue)} from ${formatNumber(topOrderType.order_count)} completed orders.`,
          }
        : null,
      topExpenseCategory
        ? {
            title: "Expense Pressure",
            body: `${topExpenseCategory.category_name} is the largest expense bucket in this range at ${formatCurrency(topExpenseCategory.total_amount)}.`,
          }
        : null,
      topSellingItem
        ? {
            title: "Menu Pulse",
            body: `${topSellingItem.item_name} is your top moving item with ${formatNumber(topSellingItem.quantity_sold)} units sold in completed orders.`,
          }
        : null,
      Number(snapshot.low_stock_count || 0) > 0
        ? {
            title: "Action Needed",
            body: `${formatNumber(snapshot.low_stock_count)} stock items are already at or below threshold. This is worth reviewing before the next rush.`,
          }
        : {
            title: "Stock Health",
            body: "No low-stock warnings are active right now, which means your current inventory snapshot looks stable.",
          },
      Number(snapshot.open_unpaid_total || 0) > 0
        ? {
            title: "Outstanding Money",
            body: `${formatCurrency(snapshot.open_unpaid_total)} is still sitting in unpaid open orders. Ledger and collections should stay on top of this.`,
          }
        : null,
    ].filter(Boolean);
  }, [charts, dashboard, details, snapshot]);

  return (
    <div className="space-y-6 text-white">
      <div className="overflow-hidden rounded-[34px] border border-slate-800 bg-[radial-gradient(circle_at_top_left,_rgba(16,185,129,0.24),_transparent_26%),radial-gradient(circle_at_top_right,_rgba(56,189,248,0.18),_transparent_24%),linear-gradient(135deg,_#020617_0%,_#0f172a_48%,_#111827_100%)] p-6">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
          <div className="max-w-3xl">
            <div className="text-[11px] uppercase tracking-[0.34em] text-emerald-300">
              Business Command Center
            </div>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight">
              Reports that answer the real questions behind the restaurant
            </h2>
            <p className="mt-3 max-w-2xl text-sm leading-7 text-slate-300">
              Profit here is calculated from completed orders, manual stock-out cost, and manually logged expenses.
              Since inventory and expenses stay independent from orders by design, this dashboard is built to bring those
              numbers together cleanly without forcing the apps to merge operationally.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 xl:min-w-[360px]">
            <MetricCard
              title="Net Profit"
              value={formatCurrency(summary.net_profit)}
              hint={`${formatNumber(summary.profit_margin)}% margin`}
              tone={Number(summary.net_profit || 0) >= 0 ? "emerald" : "rose"}
            />
            <MetricCard
              title="Inventory Value"
              value={formatCurrency(snapshot.inventory_value)}
              hint={`${formatNumber(snapshot.inventory_items_count)} stocked items`}
              tone="cyan"
            />
          </div>
        </div>
      </div>

      <SectionCard
        title="Date Controls"
        eyebrow="Range Builder"
        description="Use quick presets for owner-style review or define a custom date window for audit, tax, or performance checks."
      >
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div className="flex flex-wrap gap-3">
            {[
              { key: "today", label: "Today" },
              { key: "week", label: "Last 7 Days" },
              { key: "month", label: "This Month" },
              { key: "30d", label: "Last 30 Days" },
              { key: "90d", label: "Last 90 Days" },
            ].map((preset) => (
              <button
                key={preset.key}
                onClick={() => applyPreset(preset.key)}
                className={`rounded-full px-4 py-2 text-sm font-medium transition ${
                  activePreset === preset.key
                    ? "bg-emerald-500 text-slate-950"
                    : "border border-slate-700 bg-slate-900/70 text-slate-200 hover:border-slate-500"
                }`}
              >
                {preset.label}
              </button>
            ))}
          </div>

          <div className="grid gap-3 sm:grid-cols-3 xl:min-w-[520px]">
            <div>
              <label className="mb-2 block text-sm text-slate-300">From Date</label>
              <input
                type="date"
                value={fromDate}
                onChange={(event) => {
                  setFromDate(event.target.value);
                  setActivePreset("custom");
                }}
                className="w-full rounded-2xl border border-slate-700 bg-slate-900 px-4 py-3 text-white outline-none transition focus:border-emerald-500"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm text-slate-300">To Date</label>
              <input
                type="date"
                value={toDate}
                onChange={(event) => {
                  setToDate(event.target.value);
                  setActivePreset("custom");
                }}
                className="w-full rounded-2xl border border-slate-700 bg-slate-900 px-4 py-3 text-white outline-none transition focus:border-emerald-500"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm text-slate-300">Load Snapshot</label>
              <button
                onClick={() => loadReports()}
                disabled={loading}
                className="w-full rounded-2xl bg-emerald-500 px-4 py-3 font-semibold text-slate-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:bg-emerald-500/60"
              >
                {loading ? "Refreshing..." : "Generate Reports"}
              </button>
            </div>
          </div>
        </div>

        {error ? (
          <div className="mt-4 rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
            {error}
          </div>
        ) : null}
      </SectionCard>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard title="Gross Revenue" value={formatCurrency(summary.gross_revenue)} hint={`${formatNumber(summary.completed_orders)} completed orders`} tone="emerald" />
        <MetricCard title="COGS" value={formatCurrency(summary.total_cogs)} hint="Based on manual stock-out logs" tone="amber" />
        <MetricCard title="Expenses" value={formatCurrency(summary.total_expenses)} hint="Purely from expense logging" tone="rose" />
        <MetricCard title="Average Order Value" value={formatCurrency(summary.average_order_value)} hint={`${formatNumber(summary.created_orders)} orders created in range`} tone="cyan" />
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard title="Cash Drawer" value={formatCurrency(snapshot.cash_drawer_balance)} hint="Current live ledger balance" tone="cyan" />
        <MetricCard title="Customer Outstanding" value={formatCurrency(snapshot.customer_outstanding)} hint="Current receivables still open" tone="violet" />
        <MetricCard title="Delivery Pending" value={formatCurrency(snapshot.delivery_pending)} hint="Money still sitting with riders" tone="amber" />
        <MetricCard title="Open Unpaid" value={formatCurrency(snapshot.open_unpaid_total)} hint={`${formatNumber(snapshot.open_unpaid_orders_count)} live unpaid orders`} tone="rose" />
      </div>

      <InsightStrip insights={insights} />

      <div className="grid gap-6 xl:grid-cols-[1.45fr,1fr]">
        <GroupedBarChart
          title="Daily Money Flow"
          subtitle="Revenue, COGS, and expenses across the selected period. Profit is calculated from these three streams."
          data={charts.daily_financials || []}
          bars={moneyFlowBars}
          xKey="date"
          labelFormatter={(value) =>
            formatDate(value).replace(/,\s\d{4}/, "")
          }
        />

        <div className="grid gap-6">
          <DonutChart
            title="Sales by Order Type"
            subtitle="Completed-order revenue mix for the selected period."
            data={charts.sales_by_order_type || []}
            valueKey="total_revenue"
            centerLabel={formatCurrency(summary.gross_revenue)}
          />
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <DonutChart
          title="Collection Mix"
          subtitle="Actual money channel mix based on recorded order payments."
          data={charts.payment_mix || []}
          valueKey="total_amount"
          centerLabel={formatCurrency(
            (charts.payment_mix || []).reduce((sum, row) => sum + Number(row.total_amount || 0), 0),
          )}
        />

        <DonutChart
          title="Expense Categories"
          subtitle="Where the business spent money in this selected period."
          data={(charts.expense_categories || []).slice(0, 6)}
          valueKey="total_amount"
          centerLabel={formatCurrency(summary.total_expenses)}
        />

        <DonutChart
          title="Live Order Status"
          subtitle="Current operational picture across the entire restaurant."
          data={charts.live_order_status || []}
          valueKey="value"
          centerLabel={formatNumber(
            (charts.live_order_status || []).reduce((sum, row) => sum + Number(row.value || 0), 0),
          )}
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.2fr,1fr]">
        <GroupedBarChart
          title="Stock-Out Reasons"
          subtitle="Value of stock leaving inventory, grouped by the manual reason entered during stock-out."
          data={(charts.stock_out_reasons || []).slice(0, 8)}
          bars={reasonBars}
          xKey="reason"
          labelFormatter={(value) => String(value || "").slice(0, 10) || "Reason"}
        />

        <SectionCard
          title="Operational Snapshot"
          eyebrow="Live Now"
          description="This area is not limited to the selected period. It answers what is happening right now in the business."
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-[24px] border border-slate-800 bg-slate-900/70 p-4">
              <div className="text-sm text-slate-400">Low Stock Alerts</div>
              <div className="mt-2 text-3xl font-semibold text-white">{formatNumber(snapshot.low_stock_count)}</div>
              <div className="mt-2 text-sm text-slate-400">Based on product threshold vs current balance.</div>
            </div>

            <div className="rounded-[24px] border border-slate-800 bg-slate-900/70 p-4">
              <div className="text-sm text-slate-400">Scheduled Orders</div>
              <div className="mt-2 text-3xl font-semibold text-white">{formatNumber(snapshot.scheduled_orders_count)}</div>
              <div className="mt-2 text-sm text-slate-400">Upcoming future orders waiting to be started.</div>
            </div>

            <div className="rounded-[24px] border border-slate-800 bg-slate-900/70 p-4">
              <div className="text-sm text-slate-400">Ready Orders</div>
              <div className="mt-2 text-3xl font-semibold text-white">{formatNumber(snapshot.ready_orders_count)}</div>
              <div className="mt-2 text-sm text-slate-400">Orders that can move to completion or collection.</div>
            </div>

            <div className="rounded-[24px] border border-slate-800 bg-slate-900/70 p-4">
              <div className="text-sm text-slate-400">Processing Orders</div>
              <div className="mt-2 text-3xl font-semibold text-white">{formatNumber(snapshot.processing_orders_count)}</div>
              <div className="mt-2 text-sm text-slate-400">Orders currently live in the kitchen or service flow.</div>
            </div>
          </div>

          <div className="mt-5 rounded-[24px] border border-slate-800 bg-slate-900/60 p-4">
            <div className="flex flex-wrap items-center gap-3">
              <StatusPill label={`Refunds ${formatCurrency(summary.refunds_issued)}`} tone="rose" />
              <StatusPill label={`Cooked Cancelled ${formatCurrency(summary.cooked_cancelled_value)}`} tone="amber" />
              <StatusPill label={`${formatNumber(summary.cooked_cancelled_count)} cooked cancellations`} tone="amber" />
            </div>
            <p className="mt-3 text-sm leading-6 text-slate-400">
              Cooked cancelled orders matter operationally because they represent wastage. Refunded amount matters financially because it tells you how much money was returned.
            </p>
          </div>
        </SectionCard>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <SectionCard
          title="Top Selling Items"
          eyebrow="Menu Movers"
          description="Completed-order item sales for the selected period."
        >
          {details.top_selling_items?.length ? (
            <div className="space-y-3">
              {details.top_selling_items.map((item) => (
                <div
                  key={item.item_name}
                  className="flex flex-col gap-3 rounded-[22px] border border-slate-800 bg-slate-900/70 px-4 py-4 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div>
                    <div className="text-base font-medium text-white">{item.item_name}</div>
                    <div className="mt-1 text-sm text-slate-400">
                      {formatNumber(item.quantity_sold)} units across {formatNumber(item.orders_count)} orders
                    </div>
                  </div>
                  <div className="text-lg font-semibold text-emerald-200">
                    {formatCurrency(item.total_sales)}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <EmptyBlock text="No completed-order item sales in this date range yet." />
          )}
        </SectionCard>

        <SectionCard
          title="Low Stock Watchlist"
          eyebrow="Inventory Risk"
          description="Items already at or below the threshold defined in Inventory."
        >
          {details.low_stock_items?.length ? (
            <div className="overflow-hidden rounded-[24px] border border-slate-800">
              <table className="min-w-full divide-y divide-slate-800 text-sm">
                <thead className="bg-slate-900/90 text-left text-xs uppercase tracking-[0.24em] text-slate-400">
                  <tr>
                    <th className="px-4 py-3">Item</th>
                    <th className="px-4 py-3">Stock</th>
                    <th className="px-4 py-3">Threshold</th>
                    <th className="px-4 py-3">Value</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800 bg-slate-950/60">
                  {details.low_stock_items.map((item) => (
                    <tr key={item.product_id}>
                      <td className="px-4 py-3 font-medium text-white">{item.product_name}</td>
                      <td className="px-4 py-3 text-slate-300">
                        {formatNumber(item.quantity)} {item.unit}
                      </td>
                      <td className="px-4 py-3 text-slate-300">
                        {formatNumber(item.threshold)} {item.unit}
                      </td>
                      <td className="px-4 py-3 text-slate-300">{formatCurrency(item.total_value)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyBlock text="No low-stock items are active right now." />
          )}
        </SectionCard>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <SectionCard
          title="Upcoming Scheduled Orders"
          eyebrow="Future Load"
          description="Orders still parked in scheduled state and waiting to be started."
        >
          {details.scheduled_orders?.length ? (
            <div className="space-y-3">
              {details.scheduled_orders.map((order) => (
                <div
                  key={order.id}
                  className="rounded-[22px] border border-slate-800 bg-slate-900/70 px-4 py-4"
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <div className="text-base font-semibold text-white">Order #{order.id}</div>
                      <div className="mt-1 text-sm text-slate-400">
                        {order.order_type_display} • {order.customer_name || "Walk-in / unnamed"}
                      </div>
                    </div>
                    <StatusPill label={formatCurrency(order.total_amount)} tone="cyan" />
                  </div>
                  <div className="mt-3 text-sm text-slate-300">
                    Scheduled for {formatDateTime(order.scheduled_time)}
                  </div>
                  <div className="mt-1 text-sm text-slate-400">{order.customer_phone || "No phone"}</div>
                </div>
              ))}
            </div>
          ) : (
            <EmptyBlock text="No scheduled orders are currently waiting." />
          )}
        </SectionCard>

        <SectionCard
          title="Open Unpaid Orders"
          eyebrow="Money Still Out"
          description="These are still open in the business and have not been fully settled."
        >
          {details.open_unpaid_orders?.length ? (
            <div className="space-y-3">
              {details.open_unpaid_orders.map((order) => (
                <div
                  key={order.id}
                  className="rounded-[22px] border border-slate-800 bg-slate-900/70 px-4 py-4"
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <div className="text-base font-semibold text-white">Order #{order.id}</div>
                      <div className="mt-1 text-sm text-slate-400">
                        {order.order_type_display} • {order.customer_name || "Unnamed customer"}
                      </div>
                    </div>
                    <StatusPill label={order.order_status} tone="rose" />
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-3 text-sm text-slate-300">
                    <span>{formatCurrency(order.total_amount)}</span>
                    <span>•</span>
                    <span>{order.customer_phone || "No phone"}</span>
                    <span>•</span>
                    <span>{formatDateTime(order.created_at)}</span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <EmptyBlock text="No open unpaid orders right now." />
          )}
        </SectionCard>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.2fr,1fr]">
        <SectionCard
          title="Recent Completed Orders"
          eyebrow="Revenue Trail"
          description="Latest completed orders inside the selected period."
        >
          {details.recent_completed_orders?.length ? (
            <div className="overflow-hidden rounded-[24px] border border-slate-800">
              <table className="min-w-full divide-y divide-slate-800 text-sm">
                <thead className="bg-slate-900/90 text-left text-xs uppercase tracking-[0.24em] text-slate-400">
                  <tr>
                    <th className="px-4 py-3">Order</th>
                    <th className="px-4 py-3">Type</th>
                    <th className="px-4 py-3">Customer</th>
                    <th className="px-4 py-3">Amount</th>
                    <th className="px-4 py-3">Completed</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800 bg-slate-950/60">
                  {details.recent_completed_orders.map((order) => (
                    <tr key={order.id}>
                      <td className="px-4 py-3 font-medium text-white">#{order.id}</td>
                      <td className="px-4 py-3 text-slate-300">{order.order_type_display}</td>
                      <td className="px-4 py-3 text-slate-300">{order.customer_name || "Unnamed"}</td>
                      <td className="px-4 py-3 text-slate-300">{formatCurrency(order.total_amount)}</td>
                      <td className="px-4 py-3 text-slate-300">{formatDateTime(order.completed_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyBlock text="No completed orders in this period yet." />
          )}
        </SectionCard>

        <SectionCard
          title="Recent Expenses"
          eyebrow="Cost Log"
          description="Logged expense records from the selected period."
        >
          {details.recent_expenses?.length ? (
            <div className="space-y-3">
              {details.recent_expenses.map((expense) => (
                <div
                  key={expense.id}
                  className="rounded-[22px] border border-slate-800 bg-slate-900/70 px-4 py-4"
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <div className="text-base font-medium text-white">{expense.category_name}</div>
                      <div className="mt-1 text-sm text-slate-400">
                        {expense.payment_mode_display} • {formatDate(expense.expense_date)}
                      </div>
                    </div>
                    <div className="text-lg font-semibold text-rose-200">
                      {formatCurrency(expense.amount)}
                    </div>
                  </div>
                  <div className="mt-3 text-sm text-slate-300">
                    {expense.description || "No description added."}
                  </div>
                  {expense.reference_id ? (
                    <div className="mt-2 text-xs uppercase tracking-[0.22em] text-slate-500">
                      Ref: {expense.reference_id}
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          ) : (
            <EmptyBlock text="No expenses recorded in this range yet." />
          )}
        </SectionCard>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <SectionCard
          title="Cancelled Orders and Wastage"
          eyebrow="Audit Trail"
          description="Useful for understanding refunds, non-refunded cooked cancellations, and loss behaviour."
        >
          {details.cancelled_orders?.length ? (
            <div className="space-y-3">
              {details.cancelled_orders.map((order) => (
                <div
                  key={order.id}
                  className="rounded-[22px] border border-slate-800 bg-slate-900/70 px-4 py-4"
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <div className="text-base font-semibold text-white">Order #{order.id}</div>
                      <div className="mt-1 text-sm text-slate-400">
                        {order.order_type_display} • {order.customer_name || "Unnamed customer"}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-base font-semibold text-white">{formatCurrency(order.total_amount)}</div>
                      <div className="mt-1 text-xs uppercase tracking-[0.22em] text-slate-500">
                        {formatDateTime(order.cancelled_at)}
                      </div>
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <StatusPill label={order.cooked ? "Cooked" : "Not Cooked"} tone={order.cooked ? "amber" : "cyan"} />
                    <StatusPill label={order.refunded ? `Refunded ${formatCurrency(order.refund_amount)}` : "Not Refunded"} tone={order.refunded ? "rose" : "slate"} />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <EmptyBlock text="No cancellations in this period." />
          )}
        </SectionCard>

        <SectionCard
          title="Inventory by Value"
          eyebrow="Stock Snapshot"
          description="Highest-value items in current inventory, independent of the date range."
        >
          {details.inventory_snapshot?.length ? (
            <div className="space-y-3">
              {details.inventory_snapshot.map((item) => (
                <div
                  key={item.product_id}
                  className="rounded-[22px] border border-slate-800 bg-slate-900/70 px-4 py-4"
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <div className="text-base font-medium text-white">{item.product_name}</div>
                      <div className="mt-1 text-sm text-slate-400">
                        {formatNumber(item.quantity)} {item.unit} • Avg {formatCurrency(item.average_unit_cost)}/{item.unit}
                      </div>
                    </div>
                    <div className="text-lg font-semibold text-cyan-200">
                      {formatCurrency(item.total_value)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <EmptyBlock text="Inventory has no value rows yet." />
          )}
        </SectionCard>
      </div>
    </div>
  );
}
