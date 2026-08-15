import { useEffect, useMemo, useRef, useState } from "react";

import api from "../services/api";

export default function CustomerPhoneAutocomplete({
  value,
  onChange,
  onSelectCustomer,
  onExactMatchChange,
  label = "Phone Number",
  error,
  helperText,
  disabled = false,
}) {
  const [query, setQuery] = useState(value || "");
  const [results, setResults] = useState([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [fetchError, setFetchError] = useState("");
  const blurTimeoutRef = useRef(null);

  useEffect(() => {
    if (value !== query) {
      setQuery(value || "");
    }
  }, [value]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!open || disabled) {
      return undefined;
    }

    const timeoutId = window.setTimeout(async () => {
      const nextQuery = query.trim();

      if (!nextQuery) {
        setResults([]);
        setLoading(false);
        setFetchError("");
        return;
      }

      try {
        setLoading(true);
        setFetchError("");
        const response = await api.get("/orders/customers/", {
          params: { q: nextQuery },
        });
        setResults(response.data || []);
      } catch {
        setFetchError("Unable to load phone matches right now.");
      } finally {
        setLoading(false);
      }
    }, 160);

    return () => window.clearTimeout(timeoutId);
  }, [disabled, open, query]);

  useEffect(() => {
    if (!onExactMatchChange) {
      return;
    }

    const normalizedQuery = query.trim();

    if (!normalizedQuery) {
      onExactMatchChange(null);
      return;
    }

    const exactMatch = results.find((row) => row.phone === normalizedQuery);
    onExactMatchChange(exactMatch || null);
  }, [onExactMatchChange, query, results]);

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
      return "Searching phone numbers...";
    }

    if (!query.trim()) {
      return "Start typing a phone number to match existing customers.";
    }

    if (!results.length) {
      return "No matching phone found. This will be treated as a new number.";
    }

    return `${results.length} matching phone${results.length === 1 ? "" : "s"} found`;
  }, [fetchError, loading, query, results.length]);

  return (
    <div className="relative">
      <label className="mb-2 block text-sm font-medium text-slate-300">{label}</label>
      <input
        type="text"
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
          onChange(nextValue);
        }}
        placeholder="Type phone number"
        className="w-full rounded-xl border border-slate-700 bg-slate-800 p-3 text-white outline-none transition-all duration-200 focus:border-green-500 focus:ring-2 focus:ring-green-500"
      />

      {helperText ? <p className="mt-2 text-xs text-slate-400">{helperText}</p> : null}
      {error ? <div className="mt-1 text-xs text-red-400">{error}</div> : null}

      {open ? (
        <div className="absolute z-40 mt-2 w-full overflow-hidden rounded-2xl border border-slate-700 bg-slate-950 shadow-[0_20px_50px_rgba(2,6,23,0.45)]">
          <div className="border-b border-slate-800 px-4 py-3 text-xs uppercase tracking-[0.22em] text-slate-500">
            {statusText}
          </div>

          <div className="max-h-64 overflow-y-auto p-2">
            {results.map((customer) => (
              <button
                key={`${customer.phone}-${customer.account_id || "order"}`}
                type="button"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => {
                  setQuery(customer.phone);
                  onChange(customer.phone);
                  onSelectCustomer(customer);
                  setOpen(false);
                }}
                className="mb-2 w-full rounded-2xl border border-slate-800 bg-slate-900/80 px-4 py-3 text-left text-slate-200 transition hover:border-slate-600"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="font-medium">{customer.phone}</div>
                    <div className="mt-1 text-sm text-slate-400">
                      {customer.name || "Unnamed customer"}
                    </div>
                    {customer.address ? (
                      <div className="mt-1 text-xs text-slate-500">{customer.address}</div>
                    ) : null}
                  </div>

                  <div className="text-right">
                    {customer.has_advance ? (
                      <div className="rounded-full bg-emerald-500/15 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-emerald-200">
                        Advance {Number(customer.advance_available || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </div>
                    ) : Number(customer.previous_due_available || 0) > 0 ? (
                      <div className="rounded-full bg-amber-500/15 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-amber-200">
                        Due {Number(customer.previous_due_available || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </div>
                    ) : customer.has_outstanding ? (
                      <div className="rounded-full bg-orange-500/15 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-orange-200">
                        Ledger {Number(customer.current_balance || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </div>
                    ) : (
                      <div className="rounded-full bg-slate-800 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-300">
                        Existing
                      </div>
                    )}
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
