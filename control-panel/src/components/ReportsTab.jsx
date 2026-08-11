import { useEffect, useMemo, useState } from "react";

import api from "../services/api";
import { InlineButtonContent } from "./SystemLoader";
import {
  buildMonthWindowWithReportingStart,
  clampDateRangeToReportingStart,
} from "../utils/operationalSettings";

const today = new Date().toISOString().split("T")[0];
const PROFIT_UNLOCK_PASSWORD = "admin@almaidah";

const reportViews = [
  { key: "overview", label: "Overview" },
  { key: "profit", label: "Profit Summary", locked: true },
  { key: "consumption", label: "Inventory Consumption" },
];

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

const consumptionQuantityBars = [
  { key: "stocked_in_qty", label: "Stock In", color: "bg-emerald-400" },
  { key: "stocked_out_qty", label: "Stock Out", color: "bg-rose-400" },
];

const consumptionValueBars = [
  { key: "stocked_in_value", label: "Stock In Value", color: "bg-cyan-400" },
  { key: "stocked_out_value", label: "Stock Out Value", color: "bg-amber-400" },
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

function formatDateCompact(value) {
  if (!value) {
    return "-";
  }

  return new Date(value).toLocaleDateString("en-IN", {
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

function formatDays(value) {
  if (value === null || value === undefined || value === "") {
    return "Not enough usage yet";
  }

  return `${formatNumber(value)} day${Number(value) === 1 ? "" : "s"}`;
}

function getLocalDateFromIso(value) {
  if (!value) {
    return null;
  }

  return new Date(`${value}T00:00:00`);
}

function toIsoDate(value) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function addDays(value, days) {
  const next = new Date(value);
  next.setDate(next.getDate() + days);
  return next;
}

function getWeekStart(value) {
  const current = new Date(value);
  const day = current.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  current.setDate(current.getDate() + diff);
  return current;
}

function formatWeekLabel(start, end) {
  const startLabel = start.toLocaleDateString("en-IN", {
    month: "short",
    day: "numeric",
  });
  const endLabel = end.toLocaleDateString("en-IN", {
    month: start.getMonth() === end.getMonth() ? undefined : "short",
    day: "numeric",
  });
  return `${startLabel} - ${endLabel}`;
}

function formatMonthLabel(date) {
  return date.toLocaleDateString("en-IN", {
    month: "short",
    year: "2-digit",
  });
}

function buildFinancialTimelineRows(rows, granularity) {
  const grouped = new Map();

  (rows || []).forEach((row) => {
    const rowDate = getLocalDateFromIso(row.date);
    if (!rowDate) {
      return;
    }

    let key = row.date;
    let label = formatDateCompact(row.date);
    let longLabel = formatDate(row.date);
    let startDate = rowDate;
    let endDate = rowDate;

    if (granularity === "week") {
      startDate = getWeekStart(rowDate);
      endDate = addDays(startDate, 6);
      key = toIsoDate(startDate);
      label = `Wk ${startDate.toLocaleDateString("en-IN", { day: "numeric", month: "short" })}`;
      longLabel = formatWeekLabel(startDate, endDate);
    } else if (granularity === "month") {
      startDate = new Date(rowDate.getFullYear(), rowDate.getMonth(), 1);
      endDate = new Date(rowDate.getFullYear(), rowDate.getMonth() + 1, 0);
      key = `${rowDate.getFullYear()}-${String(rowDate.getMonth() + 1).padStart(2, "0")}`;
      label = formatMonthLabel(startDate);
      longLabel = startDate.toLocaleDateString("en-IN", {
        month: "long",
        year: "numeric",
      });
    }

    if (!grouped.has(key)) {
      grouped.set(key, {
        key,
        label,
        longLabel,
        startDate,
        endDate,
        rangeStartDate: rowDate,
        rangeEndDate: rowDate,
        revenue: 0,
        cogs: 0,
        expenses: 0,
        profit: 0,
        dayCount: 0,
      });
    }

    const bucket = grouped.get(key);
    if (rowDate < bucket.rangeStartDate) {
      bucket.rangeStartDate = rowDate;
    }
    if (rowDate > bucket.rangeEndDate) {
      bucket.rangeEndDate = rowDate;
    }
    bucket.revenue += Number(row.revenue || 0);
    bucket.cogs += Number(row.cogs || 0);
    bucket.expenses += Number(row.expenses || 0);
    bucket.profit += Number(row.profit || 0);
    bucket.dayCount += 1;
  });

  return Array.from(grouped.values())
    .sort((left, right) => left.startDate - right.startDate)
    .map((row) => ({
      ...row,
      longLabel:
        granularity === "day"
          ? formatDate(toIsoDate(row.rangeStartDate))
          : granularity === "week"
            ? formatWeekLabel(row.rangeStartDate, row.rangeEndDate)
            : `${formatDate(toIsoDate(row.rangeStartDate))} to ${formatDate(toIsoDate(row.rangeEndDate))}`,
    }));
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

function pickDefaultMovementDate(data) {
  const withMovement = (data || []).find(
    (row) => Number(row?.stocked_in_qty || 0) > 0 || Number(row?.stocked_out_qty || 0) > 0,
  );

  if (withMovement) {
    return withMovement.date;
  }

  return data?.[data.length - 1]?.date || "";
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
    violet: "bg-violet-500/15 text-violet-200",
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
            const label =
              item.label ||
              item.category_name ||
              item.payment_mode_display ||
              item.order_type_display ||
              item.order_status ||
              item.reason;

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

function GroupedBarChart({
  title,
  subtitle,
  data,
  bars,
  xKey,
  labelFormatter,
  valueFormatter = formatCurrency,
  maxItems = 12,
  sliceFromEnd = false,
}) {
  const sourceRows = data || [];
  const chartRows = sliceFromEnd ? sourceRows.slice(-maxItems) : sourceRows.slice(0, maxItems);
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

function ViewTabs({ activeView, profitUnlocked, onChange }) {
  return (
    <div className="flex flex-wrap gap-3">
      {reportViews.map((view) => {
        const isLocked = view.locked && !profitUnlocked;
        const isActive = activeView === view.key;

        return (
          <button
            key={view.key}
            onClick={() => onChange(view.key)}
            className={`rounded-full border px-4 py-2 text-sm font-medium transition ${
              isActive
                ? "border-emerald-500 bg-emerald-500 text-slate-950"
                : "border-slate-700 bg-slate-900/70 text-slate-200 hover:border-slate-500"
            }`}
          >
            <span className="flex items-center gap-2">
              {view.label}
              {isLocked ? <span className="text-xs">Lock</span> : null}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function ProfitUnlockModal({
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
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-950/80 px-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-[30px] border border-slate-800 bg-slate-950 p-6 shadow-[0_25px_80px_rgba(0,0,0,0.55)]">
        <div className="text-[11px] uppercase tracking-[0.34em] text-amber-300">
          Protected Profit View
        </div>
        <h3 className="mt-3 text-2xl font-semibold text-white">Unlock Profit Summary</h3>
        <p className="mt-3 text-sm leading-6 text-slate-400">
          Profit figures stay hidden until the correct password is entered for this browser session.
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
              placeholder="Enter profit password"
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

function FinancialDrilldownModal({
  open,
  title,
  loading,
  error,
  report,
  onClose,
}) {
  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-950/80 px-4 backdrop-blur-sm">
      <div className="flex max-h-[88vh] w-full max-w-5xl flex-col rounded-[30px] border border-slate-800 bg-slate-950 shadow-[0_25px_80px_rgba(0,0,0,0.55)]">
        <div className="flex items-start justify-between gap-4 border-b border-slate-800 px-6 py-5">
          <div>
            <div className="text-[11px] uppercase tracking-[0.34em] text-cyan-300">
              Timeline Drilldown
            </div>
            <h3 className="mt-3 text-2xl font-semibold text-white">{title}</h3>
            {report?.date_range ? (
              <p className="mt-2 text-sm text-slate-400">
                {formatDate(report.date_range.from_date)} to {formatDate(report.date_range.to_date)}
              </p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-slate-700 px-4 py-2 text-sm font-semibold text-slate-200 transition hover:border-slate-500"
          >
            Close
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
          {loading ? (
            <EmptyBlock text="Loading the register behind this bar..." />
          ) : error ? (
            <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
              {error}
            </div>
          ) : report ? (
            <div className="space-y-5">
              <div className="grid gap-4 md:grid-cols-3">
                <MetricCard
                  title="Total"
                  value={formatCurrency(report.summary?.total_amount)}
                  hint={`${formatNumber(report.summary?.record_count)} records`}
                  tone="cyan"
                />
                {report.metric === "cogs" ? (
                  <MetricCard
                    title="Total Quantity"
                    value={formatNumber(report.summary?.total_quantity)}
                    hint="Stock moved out in this selected time slice"
                    tone="amber"
                  />
                ) : null}
                {report.metric === "expenses" ? (
                  <MetricCard
                    title="Categories Used"
                    value={formatNumber(report.summary?.categories_used)}
                    hint="Distinct expense categories in this selected time slice"
                    tone="violet"
                  />
                ) : null}
              </div>

              {report.items?.length ? (
                <div className="space-y-3">
                  {report.items.map((item) => (
                    <div
                      key={`${report.metric}-${item.id}`}
                      className="rounded-[24px] border border-slate-800 bg-slate-900/70 px-4 py-4"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <div className="text-base font-semibold text-white">{item.title}</div>
                          <div className="mt-1 text-sm text-slate-400">{item.subtitle}</div>
                        </div>
                        <div className="text-right">
                          <div className="text-lg font-semibold text-white">{formatCurrency(item.amount)}</div>
                          <div className="mt-1 text-xs uppercase tracking-[0.18em] text-slate-500">
                            {item.occurred_at ? formatDateTime(item.occurred_at) : "-"}
                          </div>
                        </div>
                      </div>
                      <div className="mt-3 flex flex-wrap items-center gap-2 text-sm text-slate-300">
                        {item.meta ? <span>{item.meta}</span> : null}
                        {item.status ? (
                          <span className="rounded-full border border-slate-700 px-3 py-1 text-[11px] uppercase tracking-[0.18em] text-slate-300">
                            {item.status}
                          </span>
                        ) : null}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyBlock text="No records were found for this selected bar." />
              )}
            </div>
          ) : (
            <EmptyBlock text="Click a bar to inspect the records behind that number." />
          )}
        </div>
      </div>
    </div>
  );
}

function ConsumptionPulseChart({ data, selectedDate, onSelect, unit }) {
  const rows = data || [];
  const selectedRow = rows.find((row) => row.date === selectedDate) || rows[rows.length - 1];
  const maxMovement = Math.max(
    1,
    ...rows.map((row) =>
      Math.max(Number(row.stocked_in_qty || 0), Number(row.stocked_out_qty || 0)),
    ),
  );

  if (!rows.length) {
    return (
      <SectionCard
        title="Movement Pulse"
        eyebrow="Interactive Timeline"
        description="Choose a day to inspect the product movement rhythm inside the selected range."
      >
        <EmptyBlock text="Run a product analysis to explore movement pulse." />
      </SectionCard>
    );
  }

  return (
    <SectionCard
      title="Movement Pulse"
      eyebrow="Interactive Timeline"
      description="Tap a date to inspect how much was stocked in, stocked out, and what the day looked like for this product."
    >
      <div className="rounded-[24px] border border-slate-800 bg-slate-900/70 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-sm text-slate-400">Selected Day</div>
            <div className="mt-2 text-xl font-semibold text-white">
              {selectedRow ? formatDate(selectedRow.date) : "No day selected"}
            </div>
          </div>
          {selectedRow ? (
            <div className="flex flex-wrap gap-2">
              <StatusPill
                label={`In ${formatNumber(selectedRow.stocked_in_qty)} ${unit}`}
                tone="emerald"
              />
              <StatusPill
                label={`Out ${formatNumber(selectedRow.stocked_out_qty)} ${unit}`}
                tone="rose"
              />
              <StatusPill
                label={`Net ${formatNumber(selectedRow.net_qty_change)} ${unit}`}
                tone={Number(selectedRow.net_qty_change || 0) >= 0 ? "cyan" : "amber"}
              />
            </div>
          ) : null}
        </div>
      </div>

      <div className="mt-5 overflow-x-auto pb-2">
        <div className="flex min-w-max gap-3">
          {rows.map((row) => {
            const inHeight = `${Math.max((Number(row.stocked_in_qty || 0) / maxMovement) * 100, Number(row.stocked_in_qty || 0) > 0 ? 8 : 0)}%`;
            const outHeight = `${Math.max((Number(row.stocked_out_qty || 0) / maxMovement) * 100, Number(row.stocked_out_qty || 0) > 0 ? 8 : 0)}%`;
            const isSelected = row.date === selectedDate;

            return (
              <button
                key={row.date}
                onClick={() => onSelect(row.date)}
                className={`flex w-[88px] shrink-0 flex-col rounded-[24px] border px-3 py-3 text-left transition ${
                  isSelected
                    ? "border-emerald-400 bg-emerald-500/10"
                    : "border-slate-800 bg-slate-900/60 hover:border-slate-600"
                }`}
              >
                <div className="flex h-32 items-end justify-center gap-2">
                  <div className="flex h-full w-4 items-end">
                    <div
                      className="w-full rounded-t-full bg-emerald-400 shadow-[0_12px_24px_rgba(16,185,129,0.25)]"
                      style={{ height: inHeight }}
                      title={`Stock In: ${formatNumber(row.stocked_in_qty)} ${unit}`}
                    />
                  </div>
                  <div className="flex h-full w-4 items-end">
                    <div
                      className="w-full rounded-t-full bg-rose-400 shadow-[0_12px_24px_rgba(244,63,94,0.22)]"
                      style={{ height: outHeight }}
                      title={`Stock Out: ${formatNumber(row.stocked_out_qty)} ${unit}`}
                    />
                  </div>
                </div>

                <div className="mt-3 text-center text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-300">
                  {formatDateCompact(row.date)}
                </div>
                <div className="mt-2 text-center text-[10px] uppercase tracking-[0.18em] text-slate-500">
                  {formatNumber(Number(row.stocked_in_qty || 0) + Number(row.stocked_out_qty || 0))} {unit}
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </SectionCard>
  );
}

function ConsumptionTimeline({ timeline, unit }) {
  if (!timeline?.length) {
    return (
      <SectionCard
        title="Stock In / Stock Out Timeline"
        eyebrow="Detailed Register"
        description="This register becomes useful once the selected product has activity in the chosen date range."
      >
        <EmptyBlock text="No stock movement events were found for this product in the selected date range." />
      </SectionCard>
    );
  }

  return (
    <SectionCard
      title="Stock In / Stock Out Timeline"
      eyebrow="Detailed Register"
      description="Every purchase confirmation and manual stock-out event for the selected product in the chosen period."
    >
      <div className="space-y-3">
        {timeline.map((event) => (
          <div
            key={event.id}
            className="rounded-[24px] border border-slate-800 bg-slate-900/70 px-4 py-4"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <StatusPill
                    label={event.label}
                    tone={event.event_type === "STOCK_IN" ? "emerald" : "rose"}
                  />
                  <StatusPill label={formatDateTime(event.occurred_at)} tone="slate" />
                </div>
                <div className="mt-3 text-lg font-semibold text-white">
                  {formatNumber(event.quantity)} {unit}
                </div>
                <div className="mt-1 text-sm text-slate-400">
                  {event.reference || "No reference"}
                </div>
              </div>

              <div className="text-right">
                <div className="text-base font-semibold text-white">
                  {formatCurrency(event.value)}
                </div>
                <div className="mt-1 text-sm text-slate-400">
                  {event.unit_price ? `${formatCurrency(event.unit_price)} per ${unit}` : "Cost not recorded"}
                </div>
              </div>
            </div>

            {event.notes ? (
              <div className="mt-3 rounded-2xl border border-slate-800 bg-slate-950/60 px-3 py-3 text-sm text-slate-300">
                {event.notes}
              </div>
            ) : null}
          </div>
        ))}
      </div>
    </SectionCard>
  );
}

function FinancialTimelineChart({
  rows,
  granularity,
  onGranularityChange,
  selectedKey,
  onSelect,
  onBarClick,
}) {
  const selectedRow = rows.find((row) => row.key === selectedKey) || rows[rows.length - 1];
  const maxValue = Math.max(
    1,
    ...rows.flatMap((row) => [Number(row.revenue || 0), Number(row.cogs || 0), Number(row.expenses || 0)]),
  );

  return (
    <SectionCard
      title="Financial Timeline"
      eyebrow="Trend Line"
      description="Each point can represent a day, week, or month. Every point shows three bars: revenue, COGS, and expenses for that chosen time slice."
    >
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div className="rounded-[24px] border border-slate-800 bg-slate-900/70 px-4 py-4">
          <div className="text-[11px] uppercase tracking-[0.24em] text-slate-500">Selected Point</div>
          <div className="mt-2 text-xl font-semibold text-white">
            {selectedRow ? selectedRow.longLabel : "No data point selected"}
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <StatusPill label={`Revenue ${formatCurrency(selectedRow?.revenue)}`} tone="emerald" />
            <StatusPill label={`COGS ${formatCurrency(selectedRow?.cogs)}`} tone="amber" />
            <StatusPill label={`Expenses ${formatCurrency(selectedRow?.expenses)}`} tone="rose" />
            <StatusPill
              label={`Profit ${formatCurrency(selectedRow?.profit)}`}
              tone={Number(selectedRow?.profit || 0) >= 0 ? "cyan" : "rose"}
            />
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {[
            { key: "day", label: "Days" },
            { key: "week", label: "Weeks" },
            { key: "month", label: "Months" },
          ].map((option) => {
            const active = granularity === option.key;
            return (
              <button
                key={option.key}
                onClick={() => onGranularityChange(option.key)}
                className={`rounded-full border px-4 py-2 text-sm font-semibold transition ${
                  active
                    ? "border-cyan-400 bg-cyan-400 text-slate-950"
                    : "border-slate-700 bg-slate-900/70 text-slate-200 hover:border-slate-500"
                }`}
              >
                {option.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="mt-5 mb-5 flex flex-wrap gap-3 text-xs uppercase tracking-[0.22em] text-slate-400">
        {moneyFlowBars.map((bar) => (
          <div key={bar.key} className="flex items-center gap-2 rounded-full border border-slate-800 bg-slate-900/70 px-3 py-2">
            <span className={`inline-flex h-3 w-3 rounded-full ${bar.color}`} />
            {bar.label}
          </div>
        ))}
      </div>

      {rows.length ? (
        <div className="overflow-x-auto pb-2">
          <div className="relative min-w-max px-2 pt-3">
            <div className="absolute left-2 right-2 top-[10.8rem] h-px bg-slate-700/80" />
            <div className="flex items-start gap-4">
              {rows.map((row) => {
                const isSelected = row.key === selectedKey;
                return (
                  <div
                    key={row.key}
                    className={`w-[92px] shrink-0 rounded-[24px] border px-3 py-3 text-center transition ${
                      isSelected
                        ? "border-cyan-400 bg-cyan-500/10"
                        : "border-slate-800 bg-slate-900/60 hover:border-slate-600"
                    }`}
                  >
                    <div className="mx-auto flex h-36 items-end justify-center gap-1">
                      {moneyFlowBars.map((bar) => {
                        const value = Number(row?.[bar.key] || 0);
                        const height = `${Math.max((value / maxValue) * 100, value > 0 ? 7 : 0)}%`;
                        return (
                          <button key={bar.key} type="button" onClick={() => onBarClick(row, bar.key)} className="flex h-full w-4 items-end">
                            <div
                              className={`w-full rounded-t-2xl ${bar.color} shadow-[0_12px_24px_rgba(15,23,42,0.28)] transition hover:brightness-110`}
                              style={{ height }}
                              title={`${bar.label}: ${formatCurrency(value)}`}
                            />
                          </button>
                        );
                      })}
                    </div>
                    <button type="button" onClick={() => onSelect(row.key)} className="mt-4 block w-full">
                      <div className="relative flex justify-center">
                        <span
                          className={`inline-flex h-3.5 w-3.5 rounded-full border-2 ${
                            isSelected
                              ? "border-cyan-200 bg-cyan-400"
                              : "border-slate-500 bg-slate-900"
                          }`}
                        />
                      </div>
                      <div className="mt-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-300">
                        {row.label}
                      </div>
                      <div className="mt-2 text-[10px] uppercase tracking-[0.16em] text-slate-500">
                        {granularity === "day" ? "1 day" : `${formatNumber(row.dayCount)} days`}
                      </div>
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      ) : (
        <EmptyBlock text="There is not enough financial movement in this range to build the timeline yet." />
      )}
    </SectionCard>
  );
}

export default function ReportsTab() {
  const [fromDate, setFromDate] = useState(getMonthStart());
  const [toDate, setToDate] = useState(today);
  const [operationalStartDate, setOperationalStartDate] = useState("");
  const [activePreset, setActivePreset] = useState("month");
  const [activeView, setActiveView] = useState("overview");
  const [dashboard, setDashboard] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [profitUnlocked, setProfitUnlocked] = useState(false);
  const [showProfitUnlockModal, setShowProfitUnlockModal] = useState(false);
  const [profitPassword, setProfitPassword] = useState("");
  const [profitUnlockError, setProfitUnlockError] = useState("");
  const [reportProducts, setReportProducts] = useState([]);
  const [productsLoading, setProductsLoading] = useState(false);
  const [consumptionProductId, setConsumptionProductId] = useState("");
  const [consumptionReport, setConsumptionReport] = useState(null);
  const [consumptionLoading, setConsumptionLoading] = useState(false);
  const [consumptionError, setConsumptionError] = useState("");
  const [selectedMovementDate, setSelectedMovementDate] = useState("");
  const [timelineGranularity, setTimelineGranularity] = useState("week");
  const [selectedTimelineKey, setSelectedTimelineKey] = useState("");
  const [showTimelineDrilldown, setShowTimelineDrilldown] = useState(false);
  const [timelineDrilldownTitle, setTimelineDrilldownTitle] = useState("");
  const [timelineDrilldownLoading, setTimelineDrilldownLoading] = useState(false);
  const [timelineDrilldownError, setTimelineDrilldownError] = useState("");
  const [timelineDrilldownReport, setTimelineDrilldownReport] = useState(null);

  const clearConsumptionAnalysis = () => {
    setConsumptionReport(null);
    setConsumptionError("");
    setSelectedMovementDate("");
  };

  const loadReports = async (from = fromDate, to = toDate, baseline = operationalStartDate) => {
    const nextRange = clampDateRangeToReportingStart(from, to, baseline);

    try {
      setLoading(true);
      setError("");
      setFromDate(nextRange.fromDate);
      setToDate(nextRange.toDate);

      const response = await api.get("reports/dashboard/", {
        params: {
          from_date: nextRange.fromDate,
          to_date: nextRange.toDate,
        },
      });

      setDashboard(response.data);
    } catch (err) {
      setError(getErrorMessage(err, "Unable to load reports right now."));
    } finally {
      setLoading(false);
    }
  };

  const loadProducts = async () => {
    try {
      setProductsLoading(true);
      const response = await api.get("products/");
      const products = response.data || [];

      setReportProducts(products);
      setConsumptionProductId((current) => current || (products[0] ? String(products[0].id) : ""));
    } catch (err) {
      setConsumptionError(getErrorMessage(err, "Unable to load products for consumption analysis."));
    } finally {
      setProductsLoading(false);
    }
  };

  const loadConsumptionReport = async (
    productId = consumptionProductId,
    from = fromDate,
    to = toDate,
    baseline = operationalStartDate,
  ) => {
    if (!productId) {
      setConsumptionError("Select a product first to analyze its consumption.");
      return;
    }

    const nextRange = clampDateRangeToReportingStart(from, to, baseline);

    try {
      setConsumptionLoading(true);
      setConsumptionError("");

      const response = await api.get("reports/inventory-consumption/", {
        params: {
          from_date: nextRange.fromDate,
          to_date: nextRange.toDate,
          product_id: productId,
        },
      });

      setConsumptionReport(response.data);
      setSelectedMovementDate(pickDefaultMovementDate(response.data?.charts?.daily_movements || []));
    } catch (err) {
      setConsumptionError(getErrorMessage(err, "Unable to analyze inventory consumption right now."));
      setConsumptionReport(null);
      setSelectedMovementDate("");
    } finally {
      setConsumptionLoading(false);
    }
  };

  const loadTimelineDrilldown = async (row, barKey) => {
    const metricTitleMap = {
      revenue: "Revenue Orders",
      cogs: "COGS / Stock-Out Register",
      expenses: "Expense Register",
    };

    try {
      setShowTimelineDrilldown(true);
      setTimelineDrilldownLoading(true);
      setTimelineDrilldownError("");
      setTimelineDrilldownReport(null);
      setTimelineDrilldownTitle(
        `${metricTitleMap[barKey] || "Register"} • ${row.longLabel || row.label}`,
      );

      const response = await api.get("reports/financial-drilldown/", {
        params: {
          from_date: toIsoDate(row.rangeStartDate || row.startDate),
          to_date: toIsoDate(row.rangeEndDate || row.endDate),
          metric: barKey,
        },
      });

      setTimelineDrilldownReport(response.data);
    } catch (err) {
      setTimelineDrilldownError(
        getErrorMessage(err, "Unable to load the records behind this timeline bar right now."),
      );
    } finally {
      setTimelineDrilldownLoading(false);
    }
  };

  useEffect(() => {
    const loadInitialWorkspace = async () => {
      let reportingStart = "";

      try {
        const response = await api.get("/system/operational-settings/");
        reportingStart = response.data?.reporting_start_date || "";
        setOperationalStartDate(reportingStart);
      } catch {
        reportingStart = "";
      }

      const initialRange = buildMonthWindowWithReportingStart(today, reportingStart);
      setFromDate(initialRange.fromDate);
      setToDate(initialRange.toDate);

      loadReports(initialRange.fromDate, initialRange.toDate, reportingStart);
      loadProducts();
    };

    loadInitialWorkspace();
  }, []);

  const applyPreset = (preset) => {
    const rawRange = buildPresetRange(preset);
    const range = clampDateRangeToReportingStart(
      rawRange.from,
      rawRange.to,
      operationalStartDate,
    );

    setFromDate(range.fromDate);
    setToDate(range.toDate);
    setActivePreset(preset);
    clearConsumptionAnalysis();
    loadReports(range.fromDate, range.toDate);
  };

  const handleProfitUnlock = (event) => {
    event.preventDefault();

    if (profitPassword !== PROFIT_UNLOCK_PASSWORD) {
      setProfitUnlockError("Incorrect password. Profit summary stays locked.");
      return;
    }

    setProfitUnlocked(true);
    setActiveView("profit");
    setShowProfitUnlockModal(false);
    setProfitPassword("");
    setProfitUnlockError("");
  };

  const handleViewChange = (viewKey) => {
    if (viewKey === "profit" && !profitUnlocked) {
      setShowProfitUnlockModal(true);
      setProfitUnlockError("");
      setProfitPassword("");
      return;
    }

    setActiveView(viewKey);
  };

  const summary = dashboard?.summary || {};
  const snapshot = dashboard?.snapshot || {};
  const charts = dashboard?.charts || {};
  const details = dashboard?.details || {};
  const profit = dashboard?.profit || {};
  const profitSummary = profit.summary || {};
  const profitBreakdown = profit.breakdown || {};
  const foodCostSummary = profitBreakdown.food_cost_summary || {};
  const labourCostSummary = profitBreakdown.labour_cost_summary || {};
  const marketingExpenseSummary = profitBreakdown.marketing_expense_summary || {};

  const consumptionSummary = consumptionReport?.summary || {};
  const consumptionProduct = consumptionReport?.product || {};
  const consumptionCharts = consumptionReport?.charts || {};
  const consumptionDetails = consumptionReport?.details || {};
  const financialTimelineRows = useMemo(
    () => buildFinancialTimelineRows(charts.daily_financials || [], timelineGranularity),
    [charts.daily_financials, timelineGranularity],
  );

  useEffect(() => {
    if (!financialTimelineRows.length) {
      setSelectedTimelineKey("");
      return;
    }

    setSelectedTimelineKey((current) => {
      if (current && financialTimelineRows.some((row) => row.key === current)) {
        return current;
      }
      return financialTimelineRows[financialTimelineRows.length - 1].key;
    });
  }, [financialTimelineRows]);

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

  const profitMix = useMemo(() => {
    const netProfit = Number(profitSummary.net_profit || 0);

    return [
      {
        label: "COGS",
        total_amount: Number(profitSummary.cogs || 0),
      },
      {
        label: "Expenses",
        total_amount: Number(profitSummary.expenses || 0),
      },
      {
        label: netProfit >= 0 ? "Net Profit" : "Net Loss",
        total_amount: Math.abs(netProfit),
      },
    ].filter((row) => row.total_amount > 0);
  }, [profitSummary]);

  const selectedConsumptionProductLabel = useMemo(() => {
    const product = reportProducts.find((item) => String(item.id) === String(consumptionProductId));
    return product ? `${product.name} (${product.unit})` : "Select product";
  }, [consumptionProductId, reportProducts]);

  const overviewContent = (
    <>
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

      <FinancialTimelineChart
        rows={financialTimelineRows}
        granularity={timelineGranularity}
        onGranularityChange={setTimelineGranularity}
        selectedKey={selectedTimelineKey}
        onSelect={setSelectedTimelineKey}
        onBarClick={loadTimelineDrilldown}
      />

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
    </>
  );

  const profitContent = (
    <>
      <SectionCard
        title="Profit Reading"
        eyebrow="Protected Summary"
        description="This section stays hidden until the password is entered. It uses the same selected date range and combines completed sales, COGS, and expenses into a clean owner view."
      >
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-[24px] border border-emerald-500/20 bg-emerald-500/10 px-4 py-4">
          <div>
            <div className="text-sm text-emerald-200">Selected Range</div>
            <div className="mt-2 text-xl font-semibold text-white">
              {formatDate(fromDate)} to {formatDate(toDate)}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <StatusPill label={`${formatNumber(summary.completed_orders)} completed orders`} tone="emerald" />
            <StatusPill label={`${formatNumber(summary.created_orders)} total created`} tone="cyan" />
            <button
              onClick={() => {
                setProfitUnlocked(false);
                setActiveView("overview");
              }}
              className="rounded-full border border-slate-700 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-300 transition hover:border-slate-500"
            >
              Lock Again
            </button>
          </div>
        </div>
      </SectionCard>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <MetricCard title="Revenue" value={formatCurrency(profitSummary.revenue)} hint="Completed-order sales only" tone="emerald" />
        <MetricCard title="Gross Profit" value={formatCurrency(profitSummary.gross_profit)} hint="Revenue minus COGS" tone={Number(profitSummary.gross_profit || 0) >= 0 ? "emerald" : "rose"} />
        <MetricCard title="Net Profit" value={formatCurrency(profitSummary.net_profit)} hint={`${formatNumber(profitSummary.profit_margin)}% margin`} tone={Number(profitSummary.net_profit || 0) >= 0 ? "emerald" : "rose"} />
        <MetricCard
          title="Food Cost %"
          value={`${formatNumber(profitSummary.food_cost_ratio)}%`}
          hint={`${formatCurrency(profitSummary.food_cost_value)} consumed from opening + purchases - closing`}
          tone="amber"
        />
        <MetricCard
          title="Labour Cost %"
          value={`${formatNumber(profitSummary.labour_cost_ratio)}%`}
          hint={`${formatCurrency(profitSummary.labour_cost_value)} matched from labour categories or salary/staff-style expense text`}
          tone="violet"
        />
        <MetricCard
          title="Marketing Expense %"
          value={`${formatNumber(profitSummary.marketing_expense_ratio)}%`}
          hint={`${formatCurrency(profitSummary.marketing_expense_value)} matched from marketing categories or ad/promotion-style expense text`}
          tone="cyan"
        />
        <MetricCard title="COGS Ratio" value={`${formatNumber(profitSummary.cogs_ratio)}%`} hint="How much revenue turned into consumed stock cost" tone="amber" />
        <MetricCard title="Expense Ratio" value={`${formatNumber(profitSummary.expense_ratio)}%`} hint="How much revenue turned into operating expense" tone="rose" />
        <MetricCard title="Refund Pressure" value={formatCurrency(summary.refunds_issued)} hint={`${formatNumber(summary.cooked_cancelled_count)} cooked cancellations in range`} tone="violet" />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.15fr,1fr]">
        <SectionCard
          title="Profit Bridge"
          eyebrow="Money Story"
          description="A simple bridge from revenue to net profit for the currently selected date range."
        >
          <div className="space-y-4">
            {[
              {
                label: "Revenue In",
                value: Number(profitSummary.revenue || 0),
                tone: "emerald",
                hint: "Completed sales flowing into the business",
              },
              {
                label: "Less COGS",
                value: Number(profitSummary.cogs || 0),
                tone: "amber",
                hint: "Manual stock-out cost consumed in operations",
              },
              {
                label: "Less Expenses",
                value: Number(profitSummary.expenses || 0),
                tone: "rose",
                hint: "Logged business expenses in the same range",
              },
              {
                label: "Net Profit",
                value: Number(profitSummary.net_profit || 0),
                tone: Number(profitSummary.net_profit || 0) >= 0 ? "emerald" : "rose",
                hint: "Final profit after stock cost and expenses",
              },
            ].map((row) => (
              <div key={row.label} className="rounded-[24px] border border-slate-800 bg-slate-900/70 px-4 py-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="text-[11px] uppercase tracking-[0.24em] text-slate-500">{row.label}</div>
                    <div className="mt-2 text-2xl font-semibold text-white">{formatCurrency(row.value)}</div>
                    <div className="mt-2 text-sm text-slate-400">{row.hint}</div>
                  </div>
                  <StatusPill label={row.tone === "rose" ? "Pressure" : "Healthy"} tone={row.tone === "amber" ? "amber" : row.tone === "rose" ? "rose" : "emerald"} />
                </div>
              </div>
            ))}
          </div>
        </SectionCard>

        <DonutChart
          title="Profit Composition"
          subtitle="Shows how revenue was absorbed by cost, expense, and the profit or loss left after both."
          data={profitMix}
          valueKey="total_amount"
          centerLabel={formatCurrency(profitSummary.revenue)}
          emptyLabel="There is no revenue in the selected period yet."
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <SectionCard
          title="Sales Breakdown"
          eyebrow="Source Input"
          description="The sales engine feeding this profit view."
        >
          <div className="space-y-3">
            <MetricCard title="Gross Revenue" value={formatCurrency(profitBreakdown.sales_summary?.gross_revenue)} hint={`${formatNumber(profitBreakdown.sales_summary?.total_orders)} completed orders`} tone="emerald" />
            <MetricCard title="Average Order Value" value={formatCurrency(profitBreakdown.sales_summary?.average_order_value)} hint="Average completed-order ticket size" tone="cyan" />
          </div>
        </SectionCard>

        <SectionCard
          title="COGS Breakdown"
          eyebrow="Source Input"
          description="This is coming from manual stock-out logs in Inventory."
        >
          <div className="space-y-3">
            <MetricCard title="Total COGS" value={formatCurrency(profitBreakdown.cogs_summary?.total_cogs)} hint={`${formatNumber(profitBreakdown.cogs_summary?.total_stock_out_logs)} stock-out events`} tone="amber" />
            <MetricCard title="Used Quantity" value={formatNumber(profitBreakdown.cogs_summary?.total_quantity)} hint="Total quantity moved out through manual stock-out logs" tone="cyan" />
          </div>
        </SectionCard>

        <SectionCard
          title="Expense Breakdown"
          eyebrow="Source Input"
          description="These numbers flow from the Expenses app without touching the cash drawer."
        >
          <div className="space-y-3">
            <MetricCard title="Total Expenses" value={formatCurrency(profitBreakdown.expenses_summary?.total_expenses)} hint={`${formatNumber(profitBreakdown.expenses_summary?.expense_count)} expense records`} tone="rose" />
            <MetricCard title="Categories Used" value={formatNumber(profitBreakdown.expenses_summary?.categories_used)} hint={`${formatCurrency(profitBreakdown.expenses_summary?.cash_expenses)} cash and ${formatCurrency(profitBreakdown.expenses_summary?.non_cash_expenses)} non-cash`} tone="violet" />
          </div>
        </SectionCard>
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <SectionCard
          title="Food Cost Formula"
          eyebrow="Stock Math"
          description="Uses the selected date range and reconstructs opening and closing stock value from current inventory plus confirmed stock movement history."
        >
          <div className="space-y-3">
            <MetricCard
              title="Opening Stock"
              value={formatCurrency(foodCostSummary.opening_stock_value)}
              hint="Estimated value at the very start of the selected range"
              tone="cyan"
            />
            <MetricCard
              title="Purchases"
              value={formatCurrency(foodCostSummary.purchases_value)}
              hint={`${formatNumber(foodCostSummary.purchase_event_count)} confirmed purchase events inside the range`}
              tone="emerald"
            />
            <MetricCard
              title="Closing Stock"
              value={formatCurrency(foodCostSummary.closing_stock_value)}
              hint="Estimated value at the end of the selected range"
              tone="amber"
            />
            <div className="rounded-[24px] border border-slate-800 bg-slate-900/70 px-4 py-4">
              <div className="text-[11px] uppercase tracking-[0.24em] text-slate-500">How It Was Read</div>
              <div className="mt-2 text-sm leading-6 text-slate-300">
                {foodCostSummary.calculation_note || "Food cost uses opening stock + purchases - closing stock."}
              </div>
            </div>
          </div>
        </SectionCard>

        <SectionCard
          title="Labour Cost Reading"
          eyebrow="Payroll Pressure"
          description="Shows how much of completed-order sales was absorbed by staff cost in the selected range."
        >
          <div className="space-y-3">
            <MetricCard
              title="Labour Cost"
              value={formatCurrency(labourCostSummary.total_amount)}
              hint={`${formatNumber(labourCostSummary.expense_count)} labour-tagged expense records`}
              tone="violet"
            />
            <MetricCard
              title="Ratio"
              value={`${formatNumber(labourCostSummary.ratio)}%`}
              hint="Calculated as labour cost divided by total sales"
              tone="rose"
            />
            <div className="rounded-[24px] border border-slate-800 bg-slate-900/70 px-4 py-4">
              <div className="text-[11px] uppercase tracking-[0.24em] text-slate-500">Matched Categories</div>
              <div className="mt-2 text-sm leading-6 text-slate-300">
                {labourCostSummary.matched_categories?.length
                  ? labourCostSummary.matched_categories.join(", ")
                  : "No labour category expense was found in this range yet."}
              </div>
              {labourCostSummary.matching_mode === "keyword_fallback" && labourCostSummary.matched_keywords?.length ? (
                <div className="mt-2 text-xs uppercase tracking-[0.18em] text-slate-500">
                  Fallback keywords: {labourCostSummary.matched_keywords.join(", ")}
                </div>
              ) : null}
            </div>
          </div>
        </SectionCard>

        <SectionCard
          title="Marketing Expense Reading"
          eyebrow="Promotion Pressure"
          description="Shows how much of completed-order sales was absorbed by promotion and advertising cost in the selected range."
        >
          <div className="space-y-3">
            <MetricCard
              title="Marketing Spend"
              value={formatCurrency(marketingExpenseSummary.total_amount)}
              hint={`${formatNumber(marketingExpenseSummary.expense_count)} marketing-tagged expense records`}
              tone="cyan"
            />
            <MetricCard
              title="Ratio"
              value={`${formatNumber(marketingExpenseSummary.ratio)}%`}
              hint="Calculated as marketing spend divided by total sales"
              tone="amber"
            />
            <div className="rounded-[24px] border border-slate-800 bg-slate-900/70 px-4 py-4">
              <div className="text-[11px] uppercase tracking-[0.24em] text-slate-500">Matched Categories</div>
              <div className="mt-2 text-sm leading-6 text-slate-300">
                {marketingExpenseSummary.matched_categories?.length
                  ? marketingExpenseSummary.matched_categories.join(", ")
                  : "No marketing category expense was found in this range yet."}
              </div>
              {marketingExpenseSummary.matching_mode === "keyword_fallback" && marketingExpenseSummary.matched_keywords?.length ? (
                <div className="mt-2 text-xs uppercase tracking-[0.18em] text-slate-500">
                  Fallback keywords: {marketingExpenseSummary.matched_keywords.join(", ")}
                </div>
              ) : null}
            </div>
          </div>
        </SectionCard>
      </div>
    </>
  );

  const consumptionContent = (
    <>
      <SectionCard
        title="Inventory Consumption Workspace"
        eyebrow="Product Analysis"
        description="Choose a product and the selected date range above will answer when it was stocked in, when it moved out, how fast it is being consumed, and how long current stock is likely to last."
      >
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr),220px]">
          <div>
            <label className="mb-2 block text-sm text-slate-300">Product</label>
            <select
              value={consumptionProductId}
              onChange={(event) => {
                setConsumptionProductId(event.target.value);
                clearConsumptionAnalysis();
              }}
              className="w-full rounded-2xl border border-slate-700 bg-slate-900 px-4 py-3 text-white outline-none transition focus:border-emerald-500"
            >
              <option value="">{productsLoading ? "Loading products..." : "Select product"}</option>
              {reportProducts.map((product) => (
                <option key={product.id} value={product.id}>
                  {product.name} ({product.unit})
                </option>
              ))}
            </select>
            <div className="mt-3 text-sm text-slate-400">
              Range currently set to {formatDate(fromDate)} to {formatDate(toDate)}.
            </div>
          </div>

          <div>
            <label className="mb-2 block text-sm text-slate-300">Analyze Product</label>
            <button
              onClick={() => loadConsumptionReport()}
              disabled={consumptionLoading || productsLoading}
              className="w-full rounded-2xl bg-emerald-500 px-4 py-3 font-semibold text-slate-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:bg-emerald-500/60"
            >
              <InlineButtonContent busy={consumptionLoading} busyLabel="Analyzing...">
                Run Analysis
              </InlineButtonContent>
            </button>
          </div>
        </div>

        <div className="mt-5 rounded-[24px] border border-slate-800 bg-slate-900/60 px-4 py-4">
          <div className="text-[11px] uppercase tracking-[0.24em] text-slate-500">Selected Product</div>
          <div className="mt-2 text-lg font-semibold text-white">{selectedConsumptionProductLabel}</div>
          <div className="mt-2 text-sm text-slate-400">
            This analysis is product-specific and is designed to answer owner questions around usage rhythm, stock in flow, stock out behaviour, and stock cover.
          </div>
        </div>

        {consumptionError ? (
          <div className="mt-4 rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
            {consumptionError}
          </div>
        ) : null}
      </SectionCard>

      {consumptionReport ? (
        <>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <MetricCard
              title="Stocked In"
              value={`${formatNumber(consumptionSummary.total_stocked_in_qty)} ${consumptionProduct.unit || ""}`}
              hint={formatCurrency(consumptionSummary.total_stocked_in_value)}
              tone="emerald"
            />
            <MetricCard
              title="Stocked Out"
              value={`${formatNumber(consumptionSummary.total_stocked_out_qty)} ${consumptionProduct.unit || ""}`}
              hint={formatCurrency(consumptionSummary.total_stocked_out_value)}
              tone="rose"
            />
            <MetricCard
              title="Average Daily Usage"
              value={`${formatNumber(consumptionSummary.average_daily_usage)} ${consumptionProduct.unit || ""}`}
              hint="Average stock-out quantity per day in this range"
              tone="amber"
            />
            <MetricCard
              title="1 Unit Lasts"
              value={formatDays(consumptionSummary.days_per_unit_used)}
              hint="How many days it takes to consume one unit on average"
              tone="cyan"
            />
            <MetricCard
              title="Current Stock Cover"
              value={formatDays(consumptionSummary.current_stock_cover_days)}
              hint={`${formatNumber(consumptionProduct.current_stock)} ${consumptionProduct.unit} currently on hand`}
              tone="violet"
            />
            <MetricCard
              title="Current Stock Value"
              value={formatCurrency(consumptionProduct.current_value)}
              hint={`Avg ${formatCurrency(consumptionProduct.average_unit_cost)} per ${consumptionProduct.unit}`}
              tone="slate"
            />
          </div>

          <div className="grid gap-6 xl:grid-cols-[1.15fr,1fr]">
            <ConsumptionPulseChart
              data={consumptionCharts.daily_movements || []}
              selectedDate={selectedMovementDate}
              onSelect={setSelectedMovementDate}
              unit={consumptionProduct.unit || "unit"}
            />

            <SectionCard
              title="Consumption Reading"
              eyebrow="Owner Answer"
              description="A quick spoken-style reading of what the selected product is doing inside the chosen range."
            >
              <div className="space-y-4">
                <div className="rounded-[24px] border border-slate-800 bg-slate-900/70 px-4 py-4">
                  <div className="text-[11px] uppercase tracking-[0.24em] text-slate-500">Usage Direction</div>
                  <div className="mt-2 text-lg font-semibold text-white">
                    {Number(consumptionSummary.total_stocked_out_qty || 0) > Number(consumptionSummary.total_stocked_in_qty || 0)
                      ? "Consumption is running ahead of fresh stock-in."
                      : "Stock-in is keeping pace with consumption."}
                  </div>
                  <div className="mt-2 text-sm leading-6 text-slate-400">
                    {Number(consumptionSummary.total_stocked_out_qty || 0) > 0
                      ? `${consumptionProduct.name} moved out by ${formatNumber(consumptionSummary.total_stocked_out_qty)} ${consumptionProduct.unit} in this range, which works out to ${formatNumber(consumptionSummary.average_daily_usage)} ${consumptionProduct.unit} per day on average.`
                      : `${consumptionProduct.name} has no stock-out activity in this range yet, so the current stock cover cannot be judged from real usage.`}
                  </div>
                </div>

                <div className="rounded-[24px] border border-slate-800 bg-slate-900/70 px-4 py-4">
                  <div className="text-[11px] uppercase tracking-[0.24em] text-slate-500">Stock Life</div>
                  <div className="mt-2 text-lg font-semibold text-white">
                    {consumptionSummary.current_stock_cover_days
                      ? `Current stock can cover roughly ${formatDays(consumptionSummary.current_stock_cover_days)}`
                      : "Stock cover cannot be estimated yet"}
                  </div>
                  <div className="mt-2 text-sm leading-6 text-slate-400">
                    This estimate is based on actual stock-out logs within the chosen range, not recipe assumptions.
                  </div>
                </div>

                <div className="rounded-[24px] border border-slate-800 bg-slate-900/70 px-4 py-4">
                  <div className="text-[11px] uppercase tracking-[0.24em] text-slate-500">Event Density</div>
                  <div className="mt-2 text-lg font-semibold text-white">
                    {formatNumber(consumptionSummary.stock_in_events_count)} stock-in events and {formatNumber(consumptionSummary.stock_out_events_count)} stock-out events
                  </div>
                  <div className="mt-2 text-sm leading-6 text-slate-400">
                    This helps you judge whether usage is smooth, bursty, or dependent on occasional heavy restocking.
                  </div>
                </div>
              </div>
            </SectionCard>
          </div>

          <div className="grid gap-6 xl:grid-cols-2">
            <GroupedBarChart
              title="Daily Quantity Movement"
              subtitle="Quantity coming in versus quantity going out for the selected product."
              data={consumptionCharts.daily_movements || []}
              bars={consumptionQuantityBars}
              xKey="date"
              sliceFromEnd
              labelFormatter={(value) => formatDateCompact(value)}
              valueFormatter={(value) => `${formatNumber(value)} ${consumptionProduct.unit}`}
            />

            <GroupedBarChart
              title="Daily Value Movement"
              subtitle="Rupee value added versus consumed for the same product over the selected period."
              data={consumptionCharts.daily_movements || []}
              bars={consumptionValueBars}
              xKey="date"
              sliceFromEnd
              labelFormatter={(value) => formatDateCompact(value)}
            />
          </div>

          <ConsumptionTimeline
            timeline={consumptionDetails.timeline}
            unit={consumptionProduct.unit || "unit"}
          />
        </>
      ) : (
        <EmptyBlock text="Choose a product and run the analysis to open the inventory-consumption workspace." />
      )}
    </>
  );

  return (
    <div className="space-y-6 text-white">
      <ProfitUnlockModal
        open={showProfitUnlockModal}
        password={profitPassword}
        error={profitUnlockError}
        onClose={() => {
          setShowProfitUnlockModal(false);
          setProfitPassword("");
          setProfitUnlockError("");
        }}
        onChange={(value) => {
          setProfitPassword(value);
          if (profitUnlockError) {
            setProfitUnlockError("");
          }
        }}
        onSubmit={handleProfitUnlock}
      />

      <FinancialDrilldownModal
        open={showTimelineDrilldown}
        title={timelineDrilldownTitle}
        loading={timelineDrilldownLoading}
        error={timelineDrilldownError}
        report={timelineDrilldownReport}
        onClose={() => {
          setShowTimelineDrilldown(false);
          setTimelineDrilldownTitle("");
          setTimelineDrilldownLoading(false);
          setTimelineDrilldownError("");
          setTimelineDrilldownReport(null);
        }}
      />

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
            {profitUnlocked ? (
              <MetricCard
                title="Net Profit"
                value={formatCurrency(summary.net_profit)}
                hint={`${formatNumber(summary.profit_margin)}% margin`}
                tone={Number(summary.net_profit || 0) >= 0 ? "emerald" : "rose"}
              />
            ) : (
              <div className="rounded-[26px] border border-amber-500/25 bg-amber-500/10 p-4 text-amber-100">
                <div className="text-[11px] uppercase tracking-[0.28em] text-amber-200/80">
                  Profit Summary
                </div>
                <div className="mt-3 text-2xl font-semibold">Locked</div>
                <div className="mt-2 text-sm text-amber-100/80">
                  Profit figures stay hidden until you unlock the protected summary tab.
                </div>
                <button
                  onClick={() => setShowProfitUnlockModal(true)}
                  className="mt-4 rounded-full bg-amber-300 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-amber-200"
                >
                  Unlock Profit Summary
                </button>
              </div>
            )}
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
                  clearConsumptionAnalysis();
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
                  clearConsumptionAnalysis();
                }}
                className="w-full rounded-2xl border border-slate-700 bg-slate-900 px-4 py-3 text-white outline-none transition focus:border-emerald-500"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm text-slate-300">Load Snapshot</label>
              <button
                onClick={() => {
                  const nextRange = clampDateRangeToReportingStart(
                    fromDate,
                    toDate,
                    operationalStartDate,
                  );
                  setFromDate(nextRange.fromDate);
                  setToDate(nextRange.toDate);
                  setActivePreset("custom");
                  clearConsumptionAnalysis();
                  loadReports(nextRange.fromDate, nextRange.toDate);
                }}
                disabled={loading}
                className="w-full rounded-2xl bg-emerald-500 px-4 py-3 font-semibold text-slate-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:bg-emerald-500/60"
              >
                <InlineButtonContent busy={loading} busyLabel="Refreshing...">
                  Generate Reports
                </InlineButtonContent>
              </button>
            </div>
          </div>
        </div>

        {error ? (
          <div className="mt-4 rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
            {error}
          </div>
        ) : null}

        {operationalStartDate ? (
          <div className="mt-4 rounded-2xl border border-violet-500/25 bg-violet-500/10 px-4 py-3 text-sm text-violet-100">
            System reporting start date is <span className="font-semibold text-white">{formatDate(operationalStartDate)}</span>.
            Earlier date picks are automatically moved forward to this baseline.
          </div>
        ) : null}
      </SectionCard>

      <SectionCard
        title="Report Views"
        eyebrow="Switchboard"
        description="Overview stays broad, Profit Summary stays protected, and Inventory Consumption goes deep on one product at a time."
      >
        <ViewTabs
          activeView={activeView}
          profitUnlocked={profitUnlocked}
          onChange={handleViewChange}
        />
      </SectionCard>

      {activeView === "overview" ? overviewContent : null}
      {activeView === "profit" ? profitContent : null}
      {activeView === "consumption" ? consumptionContent : null}
    </div>
  );
}
