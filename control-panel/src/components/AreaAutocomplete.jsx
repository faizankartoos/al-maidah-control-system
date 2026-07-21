import { useEffect, useMemo, useRef, useState } from "react";

import api from "../services/api";
import { formatDeliveryChargeLabel } from "../utils/orderPricing";


export default function AreaAutocomplete({
  label = "Area",
  selectedAreaId,
  selectedAreaName,
  onSelectArea,
  onClearArea,
  error,
  helperText,
  disabled = false,
  compact = false,
}) {
  const [query, setQuery] = useState(selectedAreaName || "");
  const [results, setResults] = useState([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [fetchError, setFetchError] = useState("");
  const blurTimeoutRef = useRef(null);

  useEffect(() => {
    if (selectedAreaName && selectedAreaName !== query) {
      setQuery(selectedAreaName);
    }

    if (!selectedAreaName && !selectedAreaId) {
      setQuery("");
    }
  }, [selectedAreaId, selectedAreaName]);

  useEffect(() => {
    if (!open || disabled) {
      return undefined;
    }

    const timeoutId = window.setTimeout(async () => {
      try {
        setLoading(true);
        setFetchError("");
        const response = await api.get("/orders/areas/", {
          params: { q: query.trim() },
        });
        setResults(response.data || []);
      } catch {
        setFetchError("Unable to load areas right now.");
      } finally {
        setLoading(false);
      }
    }, query.trim() ? 160 : 0);

    return () => window.clearTimeout(timeoutId);
  }, [disabled, open, query]);

  useEffect(() => {
    return () => {
      if (blurTimeoutRef.current) {
        window.clearTimeout(blurTimeoutRef.current);
      }
    };
  }, []);

  const statusText = useMemo(() => {
    if (fetchError) {
      return fetchError;
    }

    if (loading) {
      return "Searching areas...";
    }

    if (!results.length) {
      return query.trim()
        ? "No matching area found. Add it in Django admin first."
        : "Start typing to search saved areas.";
    }

    return `${results.length} area${results.length === 1 ? "" : "s"} found`;
  }, [fetchError, loading, query, results.length]);

  const inputClassName = compact
    ? "w-full rounded-2xl border border-slate-700 bg-slate-900 px-4 py-3 text-sm text-white outline-none transition focus:border-emerald-500"
    : "w-full rounded-xl border border-slate-700 bg-slate-800 p-3 text-white outline-none transition-all duration-200 focus:border-green-500 focus:ring-2 focus:ring-green-500";

  return (
    <div className="relative">
      <label className="mb-2 block text-sm font-medium text-slate-300">{label}</label>
      <div className="relative">
        <input
          value={query}
          disabled={disabled}
          onFocus={() => setOpen(true)}
          onBlur={() => {
            blurTimeoutRef.current = window.setTimeout(() => setOpen(false), 140);
          }}
          onChange={(event) => {
            const nextValue = event.target.value;
            setQuery(nextValue);
            setOpen(true);

            if (!nextValue.trim() && selectedAreaId && onClearArea) {
              onClearArea();
            }
          }}
          placeholder="Type area name, even one letter works"
          className={inputClassName}
        />

        {selectedAreaId ? (
          <button
            type="button"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => {
              setQuery("");
              if (onClearArea) {
                onClearArea();
              }
              setOpen(true);
            }}
            className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full border border-slate-600 px-2 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-300 transition hover:border-slate-400 hover:text-white"
          >
            Clear
          </button>
        ) : null}
      </div>

      {helperText ? <p className="mt-2 text-xs text-slate-400">{helperText}</p> : null}
      {error ? <div className="mt-1 text-xs text-red-400">{error}</div> : null}

      {open ? (
        <div className="absolute z-40 mt-2 w-full overflow-hidden rounded-2xl border border-slate-700 bg-slate-950 shadow-[0_20px_50px_rgba(2,6,23,0.45)]">
          <div className="border-b border-slate-800 px-4 py-3 text-xs uppercase tracking-[0.22em] text-slate-500">
            {statusText}
          </div>

          <div className="max-h-64 overflow-y-auto p-2">
            {results.map((area) => {
              const active = String(selectedAreaId) === String(area.id);

              return (
                <button
                  key={area.id}
                  type="button"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => {
                    setQuery(area.name);
                    setOpen(false);
                    onSelectArea(area);
                  }}
                  className={`mb-2 flex w-full items-center justify-between rounded-2xl px-4 py-3 text-left transition ${
                    active
                      ? "border border-emerald-500/30 bg-emerald-500/10 text-white"
                      : "border border-slate-800 bg-slate-900/80 text-slate-200 hover:border-slate-600"
                  }`}
                >
                  <div>
                    <div className="font-medium">{area.name}</div>
                    <div className="mt-1 text-xs text-slate-400">
                      Delivery: {formatDeliveryChargeLabel("DELIVERY", area.delivery_charge)}
                    </div>
                  </div>
                  <div className="text-right">
                    {active ? (
                      <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-emerald-300">
                        Selected
                      </span>
                    ) : null}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}
