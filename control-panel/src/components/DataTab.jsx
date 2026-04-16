import { useEffect, useMemo, useState } from "react";

import api from "../services/api";


const today = new Date().toISOString().split("T")[0];
const browserTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || "";


function getMonthStart() {
  const date = new Date();
  date.setDate(1);
  return date.toISOString().split("T")[0];
}


function buildPresetRange(preset) {
  const end = new Date();
  const start = new Date();

  if (preset === "today") {
    return { from: today, to: today };
  }

  if (preset === "week") {
    start.setDate(end.getDate() - 6);
  } else if (preset === "30d") {
    start.setDate(end.getDate() - 29);
  } else if (preset === "90d") {
    start.setDate(end.getDate() - 89);
  } else {
    start.setDate(1);
  }

  return {
    from: start.toISOString().split("T")[0],
    to: end.toISOString().split("T")[0],
  };
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


function formatDateTime(value) {
  if (!value) {
    return "-";
  }

  return new Date(value).toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
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


function SectionCard({ title, eyebrow, description, children, className = "" }) {
  return (
    <div className={`rounded-[30px] border border-slate-800 bg-slate-950/90 p-5 shadow-[0_25px_70px_rgba(15,23,42,0.28)] ${className}`}>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          {eyebrow ? (
            <div className="text-[11px] uppercase tracking-[0.34em] text-cyan-300">
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


function EmptyBlock({ text }) {
  return (
    <div className="rounded-[24px] border border-dashed border-slate-700 bg-slate-900/50 px-5 py-10 text-center text-sm text-slate-400">
      {text}
    </div>
  );
}


function DateField({ label, value, onChange }) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm text-slate-300">{label}</span>
      <input
        type="date"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-2xl border border-slate-700 bg-slate-900 px-4 py-3 text-white outline-none transition focus:border-cyan-400"
      />
    </label>
  );
}


function PresetButton({ active, onClick, children }) {
  return (
    <button
      onClick={onClick}
      className={`rounded-full border px-4 py-2 text-sm font-medium transition ${
        active
          ? "border-cyan-400 bg-cyan-400 text-slate-950"
          : "border-slate-700 bg-slate-900/70 text-slate-200 hover:border-slate-500"
      }`}
    >
      {children}
    </button>
  );
}


function ActionButton({ onClick, busy, children }) {
  return (
    <button
      onClick={onClick}
      disabled={busy}
      className={`rounded-2xl px-5 py-3 font-semibold transition ${
        busy
          ? "cursor-not-allowed bg-slate-700 text-slate-300"
          : "bg-cyan-400 text-slate-950 hover:bg-cyan-300"
      }`}
    >
      {busy ? "Loading..." : children}
    </button>
  );
}


function InsightGrid({ title, items, tone = "emerald" }) {
  const toneMap = {
    emerald: "text-emerald-300",
    amber: "text-amber-300",
    rose: "text-rose-300",
    cyan: "text-cyan-300",
  };

  if (!items?.length) {
    return <EmptyBlock text={`No ${title.toLowerCase()} available in this range yet.`} />;
  }

  return (
    <div className="grid gap-3 lg:grid-cols-3">
      {items.map((item, index) => (
        <div
          key={`${item.title}-${index}`}
          className="rounded-[24px] border border-slate-800 bg-slate-900/70 px-4 py-4"
        >
          <div className={`text-[10px] uppercase tracking-[0.3em] ${toneMap[tone] || toneMap.emerald}`}>
            {item.title}
          </div>
          <div className="mt-2 text-sm leading-6 text-slate-200">{item.body}</div>
        </div>
      ))}
    </div>
  );
}


function DonutChart({ title, description, data }) {
  const palette = ["#22c55e", "#06b6d4", "#f97316"];
  const safeData = (data || []).filter((item) => Number(item.order_count || 0) > 0);
  const total = safeData.reduce((sum, item) => sum + Number(item.order_count || 0), 0);

  if (!total) {
    return (
      <SectionCard title={title} description={description}>
        <EmptyBlock text="No order type mix found in this range." />
      </SectionCard>
    );
  }

  let cursor = 0;
  const stops = safeData.map((item, index) => {
    const start = cursor;
    const end = cursor + (Number(item.order_count || 0) / total) * 100;
    cursor = end;
    return `${palette[index % palette.length]} ${start}% ${end}%`;
  });

  return (
    <SectionCard title={title} description={description}>
      <div className="grid gap-6 xl:grid-cols-[220px,minmax(0,1fr)] xl:items-center">
        <div className="mx-auto flex h-[220px] w-[220px] items-center justify-center rounded-full border border-slate-800 bg-slate-950 shadow-inner">
          <div
            className="relative flex h-[180px] w-[180px] items-center justify-center rounded-full"
            style={{ background: `conic-gradient(${stops.join(", ")})` }}
          >
            <div className="flex h-[112px] w-[112px] flex-col items-center justify-center rounded-full border border-slate-800 bg-slate-950 text-center shadow-[0_0_0_14px_rgba(2,6,23,0.75)]">
              <div className="text-[10px] uppercase tracking-[0.28em] text-slate-400">Orders</div>
              <div className="mt-2 text-lg font-semibold text-white">{formatNumber(total)}</div>
            </div>
          </div>
        </div>

        <div className="grid gap-3">
          {safeData.map((item, index) => (
            <div
              key={item.order_type}
              className="rounded-[22px] border border-slate-800 bg-slate-900/70 px-4 py-3"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-center gap-3">
                  <span
                    className="mt-1 inline-flex h-3 w-3 rounded-full"
                    style={{ backgroundColor: palette[index % palette.length] }}
                  />
                  <div>
                    <div className="text-sm font-medium text-white">{item.label}</div>
                    <div className="mt-1 text-xs uppercase tracking-[0.22em] text-slate-500">
                      {formatCurrency(item.total_amount)}
                    </div>
                  </div>
                </div>
                <div className="text-right text-sm font-semibold text-white">
                  {formatNumber(item.order_count)}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </SectionCard>
  );
}


function GroupedBarChart({
  title,
  description,
  data,
  bars,
  xKey,
  labelFormatter,
  valueFormatter = formatCurrency,
  maxItems = 12,
}) {
  const rows = (data || []).slice(0, maxItems);
  const maxValue = Math.max(
    1,
    ...rows.flatMap((row) => bars.map((bar) => Number(row?.[bar.key] || 0))),
  );

  if (!rows.length) {
    return (
      <SectionCard title={title} description={description}>
        <EmptyBlock text="Nothing to chart in this range yet." />
      </SectionCard>
    );
  }

  return (
    <SectionCard title={title} description={description}>
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
            {rows.map((row, rowIndex) => (
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


function HeatmapCard({ title, description, data }) {
  const maxCount = Math.max(
    1,
    ...(data || []).flatMap((row) => row.hours.map((hour) => Number(hour.order_count || 0))),
  );

  if (!data?.length) {
    return (
      <SectionCard title={title} description={description}>
        <EmptyBlock text="No timing map available yet." />
      </SectionCard>
    );
  }

  return (
    <SectionCard title={title} description={description}>
      <div className="overflow-x-auto">
        <div className="min-w-[1040px]">
          <div className="grid grid-cols-[110px_repeat(24,minmax(32px,1fr))] gap-2">
            <div />
            {data[0].hours.map((hour) => (
              <div key={hour.hour} className="text-center text-[10px] uppercase tracking-[0.18em] text-slate-500">
                {hour.hour_label}
              </div>
            ))}

            {data.map((row) => (
              <div key={row.weekday} className="contents">
                <div
                  className="flex items-center text-sm font-semibold text-white"
                >
                  {row.weekday_label}
                </div>
                {row.hours.map((hour) => {
                  const intensity = Number(hour.order_count || 0) / maxCount;
                  const background =
                    hour.order_count > 0
                      ? `rgba(34, 197, 94, ${Math.max(0.12, intensity)})`
                      : "rgba(15, 23, 42, 0.55)";

                  return (
                    <div
                      key={`${row.weekday}-${hour.hour}`}
                      className="flex h-10 items-center justify-center rounded-xl border border-slate-800 text-xs font-semibold text-white"
                      style={{ background }}
                      title={`${row.weekday}: ${hour.hour_label} • ${hour.order_count} orders • ${formatCurrency(hour.revenue)}`}
                    >
                      {hour.order_count || ""}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>
    </SectionCard>
  );
}


function HotspotList({ title, description, rows, onSelectArea }) {
  const maxOrders = Math.max(1, ...(rows || []).map((row) => Number(row.order_count || 0)));

  return (
    <SectionCard title={title} description={description}>
      {rows?.length ? (
        <div className="space-y-3">
          {rows.map((row, index) => (
            <button
              key={`${row.location_label}-${index}`}
              type="button"
              onClick={() => onSelectArea?.(row)}
              className="w-full rounded-[24px] border border-slate-800 bg-slate-900/70 px-4 py-4 text-left transition hover:border-cyan-400/60 hover:bg-slate-900"
            >
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="text-sm font-semibold text-white">{row.location_label}</div>
                  <div className="mt-1 text-xs uppercase tracking-[0.22em] text-slate-500">
                    {row.order_count} orders • {row.customer_count} customers
                  </div>
                </div>
                <div className="text-right text-sm font-semibold text-cyan-200">
                  {formatCurrency(row.total_amount)}
                </div>
              </div>

              <div className="mt-4 h-3 overflow-hidden rounded-full bg-slate-950">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-cyan-400 via-emerald-400 to-amber-300"
                  style={{ width: `${Math.max((Number(row.order_count || 0) / maxOrders) * 100, 8)}%` }}
                />
              </div>

              <div className="mt-3 text-xs text-slate-400">
                Avg order value {formatCurrency(row.average_order_value)} • Click to inspect orders
              </div>
            </button>
          ))}
        </div>
      ) : (
        <EmptyBlock text="No delivery location trend is available in this range yet." />
      )}
    </SectionCard>
  );
}


function AreaOrdersModal({ area, onClose, onViewOrder }) {
  if (!area) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm">
      <div className="max-h-[90vh] w-full max-w-5xl overflow-hidden rounded-[32px] border border-slate-800 bg-slate-950 shadow-[0_30px_120px_rgba(2,6,23,0.75)]">
        <div className="flex items-start justify-between gap-4 border-b border-slate-800 px-6 py-5">
          <div>
            <div className="text-[11px] uppercase tracking-[0.3em] text-cyan-300">Delivery Area Drilldown</div>
            <h3 className="mt-2 text-2xl font-semibold text-white">{area.location_label}</h3>
            <p className="mt-2 text-sm text-slate-400">
              {area.order_count} orders • {area.customer_count} customers • {formatCurrency(area.total_amount)}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-2xl border border-slate-700 bg-slate-900 px-4 py-2 text-sm text-slate-200 transition hover:border-slate-500"
          >
            Close
          </button>
        </div>

        <div className="max-h-[72vh] overflow-auto px-6 py-5">
          {area.orders?.length ? (
            <div className="space-y-3">
              {area.orders.map((order) => (
                <div
                  key={order.id}
                  className="rounded-[24px] border border-slate-800 bg-slate-900/70 px-4 py-4"
                >
                  <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
                    <div className="space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-full border border-cyan-400/40 bg-cyan-400/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.24em] text-cyan-200">
                          {order.order_type}
                        </span>
                        <span className="rounded-full border border-slate-700 bg-slate-950 px-3 py-1 text-[11px] uppercase tracking-[0.2em] text-slate-300">
                          {order.order_status}
                        </span>
                        <span className="rounded-full border border-slate-700 bg-slate-950 px-3 py-1 text-[11px] uppercase tracking-[0.2em] text-slate-300">
                          {order.payment_status}
                        </span>
                      </div>
                      <div className="text-sm font-semibold text-white">
                        #{order.id} • {formatDateTime(order.created_at_local || order.created_at)}
                      </div>
                      <div className="text-sm text-slate-300">{order.highlight}</div>
                      <div className="text-sm text-slate-400">{order.items_preview}</div>
                    </div>

                    <div className="flex flex-col items-start gap-3 xl:items-end">
                      <div className="text-lg font-semibold text-emerald-300">
                        {formatCurrency(order.total_amount)}
                      </div>
                      <button
                        type="button"
                        onClick={() => onViewOrder(order)}
                        className="rounded-2xl bg-cyan-400 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-cyan-300"
                      >
                        View
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <EmptyBlock text="No delivery orders are available for this area in the selected range." />
          )}
        </div>
      </div>
    </div>
  );
}


function OrderDetailsModal({ order, onClose }) {
  if (!order) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/85 p-4 backdrop-blur-sm">
      <div className="max-h-[90vh] w-full max-w-3xl overflow-auto rounded-[32px] border border-slate-800 bg-slate-950 shadow-[0_30px_120px_rgba(2,6,23,0.78)]">
        <div className="flex items-start justify-between gap-4 border-b border-slate-800 px-6 py-5">
          <div>
            <div className="text-[11px] uppercase tracking-[0.3em] text-cyan-300">Order Details</div>
            <h3 className="mt-2 text-2xl font-semibold text-white">Order #{order.id}</h3>
            <p className="mt-2 text-sm text-slate-400">
              {formatDateTime(order.created_at_local || order.created_at)}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-2xl border border-slate-700 bg-slate-900 px-4 py-2 text-sm text-slate-200 transition hover:border-slate-500"
          >
            Close
          </button>
        </div>

        <div className="space-y-5 px-6 py-5">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-[24px] border border-slate-800 bg-slate-900/70 px-4 py-4">
              <div className="text-[11px] uppercase tracking-[0.24em] text-slate-500">Order Meta</div>
              <div className="mt-3 space-y-2 text-sm text-slate-200">
                <div>Type: {order.order_type}</div>
                <div>Status: {order.order_status}</div>
                <div>Payment: {order.payment_status}</div>
                <div>Total: {formatCurrency(order.total_amount)}</div>
              </div>
            </div>

            <div className="rounded-[24px] border border-slate-800 bg-slate-900/70 px-4 py-4">
              <div className="text-[11px] uppercase tracking-[0.24em] text-slate-500">Customer</div>
              <div className="mt-3 space-y-2 text-sm text-slate-200">
                <div>Name: {order.customer_name || "-"}</div>
                <div>Phone: {order.customer_phone || "-"}</div>
                <div>Highlight: {order.highlight || "-"}</div>
              </div>
            </div>
          </div>

          <div className="rounded-[24px] border border-slate-800 bg-slate-900/70 px-4 py-4">
            <div className="text-[11px] uppercase tracking-[0.24em] text-slate-500">Delivery / Table Info</div>
            <div className="mt-3 space-y-2 text-sm text-slate-200">
              <div>Address: {order.delivery_address || "-"}</div>
              <div>Table: {order.table_number || "-"}</div>
              <div>Order Note: {order.order_note || "-"}</div>
            </div>
          </div>

          <div className="rounded-[24px] border border-slate-800 bg-slate-900/70 px-4 py-4">
            <div className="text-[11px] uppercase tracking-[0.24em] text-slate-500">Items</div>
            {order.items?.length ? (
              <div className="mt-4 overflow-x-auto">
                <table className="min-w-full text-left text-sm text-slate-200">
                  <thead>
                    <tr className="border-b border-slate-800 text-slate-400">
                      <th className="pb-3">Item</th>
                      <th className="pb-3">Qty</th>
                      <th className="pb-3">Price</th>
                      <th className="pb-3">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {order.items.map((item, index) => (
                      <tr key={`${item.item_name}-${index}`} className="border-b border-slate-900">
                        <td className="py-3">{item.item_name}</td>
                        <td className="py-3">{formatNumber(item.quantity)}</td>
                        <td className="py-3">{formatCurrency(item.price)}</td>
                        <td className="py-3">{formatCurrency(item.total_price)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="mt-3 text-sm text-slate-400">No item details available.</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}


function TopCustomersTable({ rows }) {
  return (
    <SectionCard
      title="Top 10 Customers"
      eyebrow="Customer Ranking"
      description="Ranked by how often they ordered, with spend and favorite items visible in one place."
    >
      {rows?.length ? (
        <div className="overflow-x-auto">
          <table className="min-w-[900px] w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-800 text-slate-400">
                <th className="pb-3">Rank</th>
                <th className="pb-3">Customer</th>
                <th className="pb-3">Phone</th>
                <th className="pb-3">Orders</th>
                <th className="pb-3">Spent</th>
                <th className="pb-3">Average</th>
                <th className="pb-3">Mostly Orders</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => (
                <tr key={`${row.phone}-${index}`} className="border-b border-slate-900 text-slate-200">
                  <td className="py-3 font-semibold text-cyan-300">#{index + 1}</td>
                  <td className="py-3 font-medium text-white">{row.customer_name}</td>
                  <td className="py-3 text-slate-300">{row.phone}</td>
                  <td className="py-3">{formatNumber(row.order_count)}</td>
                  <td className="py-3 font-semibold text-emerald-300">{formatCurrency(row.total_spent)}</td>
                  <td className="py-3">{formatCurrency(row.average_order_value)}</td>
                  <td className="py-3 text-slate-300">{row.favorite_items}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyBlock text="Not enough phone-tagged orders yet to rank customers." />
      )}
    </SectionCard>
  );
}


function FavoriteItemsGrid({ rows }) {
  return (
    <SectionCard
      title="What Customers Mostly Order"
      eyebrow="Taste Pattern"
      description="Shows the items that appear across the most customers, not just the biggest raw quantity."
    >
      {rows?.length ? (
        <div className="grid gap-3 lg:grid-cols-2 xl:grid-cols-3">
          {rows.map((row, index) => (
            <div
              key={`${row.item_name}-${index}`}
              className="rounded-[24px] border border-slate-800 bg-slate-900/70 px-4 py-4"
            >
              <div className="text-sm font-semibold text-white">{row.item_name}</div>
              <div className="mt-2 text-xs uppercase tracking-[0.22em] text-slate-500">
                {row.customer_count} customers • {row.order_count} order lines
              </div>
              <div className="mt-4 flex items-center justify-between">
                <div>
                  <div className="text-[11px] uppercase tracking-[0.22em] text-slate-500">Quantity</div>
                  <div className="mt-1 text-lg font-semibold text-cyan-200">
                    {formatNumber(row.total_quantity)}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-[11px] uppercase tracking-[0.22em] text-slate-500">Revenue</div>
                  <div className="mt-1 text-lg font-semibold text-emerald-300">
                    {formatCurrency(row.total_revenue)}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <EmptyBlock text="No repeated item pattern has formed in this range yet." />
      )}
    </SectionCard>
  );
}


export default function DataTab() {
  const [fromDate, setFromDate] = useState(getMonthStart());
  const [toDate, setToDate] = useState(today);
  const [loading, setLoading] = useState(true);
  const [loadingSeconds, setLoadingSeconds] = useState(0);
  const [error, setError] = useState("");
  const [activePreset, setActivePreset] = useState("month");
  const [report, setReport] = useState(null);
  const [selectedArea, setSelectedArea] = useState(null);
  const [selectedOrder, setSelectedOrder] = useState(null);

  const loadData = async (from = fromDate, to = toDate) => {
    setLoading(true);
    setError("");
    setSelectedArea(null);
    setSelectedOrder(null);

    try {
      const response = await api.get("/reports/data-insights/", {
        params: {
          from_date: from,
          to_date: to,
          timezone: browserTimeZone,
        },
      });

      setReport(response.data);
    } catch (requestError) {
      setError(getErrorMessage(requestError, "Unable to load data insights right now."));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData(getMonthStart(), today);
  }, []);

  useEffect(() => {
    if (!loading) {
      setLoadingSeconds(0);
      return undefined;
    }

    setLoadingSeconds(0);
    const intervalId = window.setInterval(() => {
      setLoadingSeconds((current) => current + 1);
    }, 1000);

    return () => window.clearInterval(intervalId);
  }, [loading]);

  const summary = report?.summary || {};
  const charts = report?.charts || {};
  const rankings = report?.rankings || {};
  const insights = report?.insights || {};
  const loadingMessage = useMemo(() => {
    if (loadingSeconds >= 12) {
      return "Still building the data intelligence view. If it takes more than about 15 seconds, retry once. The delivery-location grouping is the slowest part on first run.";
    }

    if (loadingSeconds >= 5) {
      return "Building the data intelligence view. First runs usually take around 5 to 15 seconds while delivery areas are grouped from live location data.";
    }

    return "Building the data intelligence view...";
  }, [loadingSeconds]);

  const spotlightMetrics = useMemo(
    () => [
      {
        title: "Tracked Orders",
        value: formatNumber(summary.total_orders || 0),
        hint: `${formatNumber(summary.fulfilled_orders || 0)} active/fulfilled • ${formatNumber(summary.cancelled_orders || 0)} cancelled`,
        tone: "cyan",
      },
      {
        title: "Demand Revenue",
        value: formatCurrency(summary.gross_revenue || 0),
        hint: `Average order ${formatCurrency(summary.average_order_value || 0)}`,
        tone: "emerald",
      },
      {
        title: "Repeat Customers",
        value: formatNumber(summary.repeat_customer_count || 0),
        hint: `${formatNumber(summary.repeat_customer_share || 0)}% of tracked customer revenue`,
        tone: "violet",
      },
      {
        title: "Peak Time",
        value: summary.peak_hour_label || "-",
        hint: summary.peak_weekday_label
          ? `${summary.peak_weekday_label} is your busiest day`
          : "Waiting for more order timing data",
        tone: "amber",
      },
      {
        title: "Phone Capture",
        value: `${formatNumber(summary.phone_capture_rate || 0)}%`,
        hint: `${formatNumber(summary.orders_without_phone || 0)} orders still missing a usable phone`,
        tone: "slate",
      },
      {
        title: "Delivery Address Capture",
        value: `${formatNumber(summary.delivery_address_capture_rate || 0)}%`,
        hint: `${formatNumber(summary.unknown_delivery_location_orders || 0)} delivery orders still lack a clear location`,
        tone: "rose",
      },
    ],
    [summary],
  );

  return (
    <div className="space-y-6">
      <SectionCard
        eyebrow="Business Data"
        title="Owner-Level Order Intelligence"
        description="Use this tab to understand when orders arrive, what customers keep buying, which locations are strongest, and what the business should improve next."
      >
        <div className="grid gap-4 xl:grid-cols-[1.1fr,1fr,auto] xl:items-end">
          <DateField label="From" value={fromDate} onChange={setFromDate} />
          <DateField label="To" value={toDate} onChange={setToDate} />
          <ActionButton onClick={() => loadData()} busy={loading}>
            Generate Data View
          </ActionButton>
        </div>

        <div className="mt-4 flex flex-wrap gap-3">
          <PresetButton
            active={activePreset === "today"}
            onClick={() => {
              const range = buildPresetRange("today");
              setActivePreset("today");
              setFromDate(range.from);
              setToDate(range.to);
              loadData(range.from, range.to);
            }}
          >
            Today
          </PresetButton>
          <PresetButton
            active={activePreset === "week"}
            onClick={() => {
              const range = buildPresetRange("week");
              setActivePreset("week");
              setFromDate(range.from);
              setToDate(range.to);
              loadData(range.from, range.to);
            }}
          >
            Last 7 Days
          </PresetButton>
          <PresetButton
            active={activePreset === "month"}
            onClick={() => {
              const range = buildPresetRange("month");
              setActivePreset("month");
              setFromDate(range.from);
              setToDate(range.to);
              loadData(range.from, range.to);
            }}
          >
            This Month
          </PresetButton>
          <PresetButton
            active={activePreset === "30d"}
            onClick={() => {
              const range = buildPresetRange("30d");
              setActivePreset("30d");
              setFromDate(range.from);
              setToDate(range.to);
              loadData(range.from, range.to);
            }}
          >
            Last 30 Days
          </PresetButton>
          <PresetButton
            active={activePreset === "90d"}
            onClick={() => {
              const range = buildPresetRange("90d");
              setActivePreset("90d");
              setFromDate(range.from);
              setToDate(range.to);
              loadData(range.from, range.to);
            }}
          >
            Last 90 Days
          </PresetButton>
        </div>

        {error ? (
          <div className="mt-4 rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
            {error}
          </div>
        ) : null}
      </SectionCard>

      {loading ? (
        <EmptyBlock text={loadingMessage} />
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {spotlightMetrics.map((metric) => (
              <MetricCard
                key={metric.title}
                title={metric.title}
                value={metric.value}
                hint={metric.hint}
                tone={metric.tone}
              />
            ))}
          </div>

          <SectionCard
            eyebrow="What This Range Says"
            title="Business Signals"
            description="These are the strongest patterns the system can see from your current order data."
          >
            <InsightGrid title="Strengths" items={insights.strengths || []} tone="cyan" />
          </SectionCard>

          <div className="grid gap-6 xl:grid-cols-[1.4fr,1fr]">
            <GroupedBarChart
              title="Daily Demand Trend"
              description="See order count and revenue together day by day so growth and weak patches show up quickly."
              data={charts.daily_orders || []}
              bars={[
                { key: "order_count", label: "Orders", color: "bg-cyan-400" },
                { key: "revenue", label: "Revenue", color: "bg-emerald-400" },
              ]}
              xKey="date"
              maxItems={12}
              labelFormatter={(value) => new Date(value).toLocaleDateString("en-IN", { month: "short", day: "numeric" })}
              valueFormatter={formatNumber}
            />

            <DonutChart
              title="Order Type Mix"
              description="Quick mix of dine-in, takeaway, and delivery orders in the selected range."
              data={charts.order_type_mix || []}
            />
          </div>

          <div className="grid gap-6 xl:grid-cols-[1.2fr,1fr]">
            <GroupedBarChart
              title="Usual Ordering Hours"
              description="This reveals the hours when orders usually hit the restaurant."
              data={charts.hourly_demand || []}
              bars={[
                { key: "order_count", label: "Orders", color: "bg-violet-400" },
                { key: "revenue", label: "Revenue", color: "bg-amber-400" },
              ]}
              xKey="hour_label"
              maxItems={24}
              valueFormatter={formatNumber}
            />

            <HotspotList
              title="Delivery Location Strength List"
              description="This ranked list shows which grouped delivery areas are pulling the most demand in the selected range."
              rows={charts.location_hotspots || []}
              onSelectArea={setSelectedArea}
            />
          </div>

          <HeatmapCard
            title="Weekday + Hour Heatmap"
            description="This gives you the usual timing pattern of orders across the full week."
            data={charts.weekday_heatmap || []}
          />

          <TopCustomersTable rows={rankings.top_customers || []} />

          <FavoriteItemsGrid rows={charts.customer_favorite_items || []} />

          <div className="grid gap-6 xl:grid-cols-2">
            <SectionCard
              eyebrow="Improve"
              title="What To Improve"
              description="These are the most practical business moves suggested by the current data."
            >
              <InsightGrid title="Improvements" items={insights.improvements || []} tone="amber" />
            </SectionCard>

            <SectionCard
              eyebrow="Missing"
              title="What The Business Is Still Not Measuring"
              description="These missing signals are the blind spots stopping even better owner decisions."
            >
              <InsightGrid title="Missing Signals" items={insights.missing_signals || []} tone="rose" />
            </SectionCard>
          </div>
        </>
      )}

      <AreaOrdersModal
        area={selectedArea}
        onClose={() => {
          setSelectedArea(null);
          setSelectedOrder(null);
        }}
        onViewOrder={setSelectedOrder}
      />

      <OrderDetailsModal
        order={selectedOrder}
        onClose={() => setSelectedOrder(null)}
      />
    </div>
  );
}
