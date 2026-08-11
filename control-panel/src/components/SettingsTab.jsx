import { useEffect, useMemo, useState } from "react";

import api from "../services/api";
import { getThemeConfig, THEME_OPTIONS } from "../constants/themeOptions";
import { InlineButtonContent, PanelLoader } from "./SystemLoader";
import { formatDeliveryChargeLabel } from "../utils/orderPricing";

const today = new Date().toISOString().split("T")[0];

function formatMoney(value) {
  return Number(value || 0).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatDateLabel(value) {
  if (!value) {
    return "Not set";
  }

  return new Date(`${value}T00:00:00`).toLocaleDateString("en-IN", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function formatDateTimeLabel(value) {
  if (!value) {
    return "Never";
  }

  return new Date(value).toLocaleString("en-IN", {
    year: "numeric",
    month: "short",
    day: "numeric",
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

  if (typeof data.error === "string") {
    return data.error;
  }

  if (typeof data.detail === "string") {
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

function emptyDeliveryBoyForm() {
  return {
    name: "",
    contact_number: "",
    address: "",
    opening_balance: "0.00",
  };
}

export default function SettingsTab({ currentUser, onPreferenceChange, preferenceSaving = false }) {
  const [loading, setLoading] = useState(true);
  const [areas, setAreas] = useState([]);
  const [areaDrafts, setAreaDrafts] = useState({});
  const [areaSearch, setAreaSearch] = useState("");
  const [newAreaName, setNewAreaName] = useState("");
  const [newAreaCharge, setNewAreaCharge] = useState("0.00");
  const [savingAreaId, setSavingAreaId] = useState(null);
  const [creatingArea, setCreatingArea] = useState(false);

  const [deliveryBoys, setDeliveryBoys] = useState([]);
  const [boyDrafts, setBoyDrafts] = useState({});
  const [savingBoyId, setSavingBoyId] = useState(null);
  const [creatingBoy, setCreatingBoy] = useState(false);
  const [newDeliveryBoy, setNewDeliveryBoy] = useState(emptyDeliveryBoyForm());
  const [activeWindow, setActiveWindow] = useState(null);
  const [bulkCollectFromDate, setBulkCollectFromDate] = useState(today);
  const [bulkCollectToDate, setBulkCollectToDate] = useState(today);
  const [bulkCollectPaymentType, setBulkCollectPaymentType] = useState("CASH");
  const [bulkCollecting, setBulkCollecting] = useState(false);
  const [bulkCollectSummary, setBulkCollectSummary] = useState(null);
  const [operationalSettings, setOperationalSettings] = useState({
    reporting_start_date: "",
    inventory_last_zeroed_at: null,
    inventory_last_zeroed_by_name: "",
  });
  const [operationalDateDraft, setOperationalDateDraft] = useState(today);
  const [savingOperationalDate, setSavingOperationalDate] = useState(false);
  const [resettingOperationalBaseline, setResettingOperationalBaseline] = useState(false);
  const [confirmingOperationalReset, setConfirmingOperationalReset] = useState(false);
  const [operationalResetSummary, setOperationalResetSummary] = useState(null);

  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const isAdmin = currentUser?.role === "ADMIN";

  useEffect(() => {
    loadSettings();
  }, []);

  function primeAreaDrafts(nextAreas) {
    const drafts = {};

    nextAreas.forEach((area) => {
      drafts[area.id] = {
        name: area.name,
        delivery_charge: String(area.delivery_charge ?? "0.00"),
      };
    });

    setAreaDrafts(drafts);
  }

  function primeBoyDrafts(nextBoys) {
    const drafts = {};

    nextBoys.forEach((boy) => {
      drafts[boy.id] = {
        name: boy.name || "",
        contact_number: boy.contact_number || "",
        address: boy.address || "",
        opening_balance: String(boy.opening_balance ?? "0.00"),
      };
    });

    setBoyDrafts(drafts);
  }

  function syncOperationalSettings(nextSettings) {
    const normalized = {
      reporting_start_date: nextSettings?.reporting_start_date || "",
      inventory_last_zeroed_at: nextSettings?.inventory_last_zeroed_at || null,
      inventory_last_zeroed_by_name: nextSettings?.inventory_last_zeroed_by_name || "",
    };

    setOperationalSettings(normalized);
    setOperationalDateDraft(normalized.reporting_start_date || today);
  }

  async function loadSettings() {
    try {
      setLoading(true);
      setError("");

      const [areasResponse, boysResponse, operationalResponse] = await Promise.all([
        api.get("/settings/delivery-areas/"),
        api.get("/settings/delivery-boys/"),
        api.get("/system/operational-settings/"),
      ]);

      const nextAreas = areasResponse.data || [];
      const nextBoys = boysResponse.data || [];

      setAreas(nextAreas);
      setDeliveryBoys(nextBoys);
      primeAreaDrafts(nextAreas);
      primeBoyDrafts(nextBoys);
      syncOperationalSettings(operationalResponse.data || {});
    } catch (err) {
      setError(err?.response?.data?.error || "Unable to load settings right now.");
    } finally {
      setLoading(false);
    }
  }

  const filteredAreas = useMemo(() => {
    const query = areaSearch.trim().toLowerCase();
    if (!query) {
      return areas;
    }

    return areas.filter((area) => area.name.toLowerCase().includes(query));
  }, [areaSearch, areas]);

  const activeTheme = getThemeConfig(currentUser?.theme_preference);

  async function createArea() {
    try {
      setCreatingArea(true);
      setError("");
      setSuccess("");

      const response = await api.post("/settings/delivery-areas/", {
        name: newAreaName,
        delivery_charge: newAreaCharge,
      });

      const nextAreas = [...areas, response.data].sort((left, right) =>
        left.name.localeCompare(right.name, undefined, { sensitivity: "base" })
      );
      setAreas(nextAreas);
      primeAreaDrafts(nextAreas);
      setNewAreaName("");
      setNewAreaCharge("0.00");
      setSuccess("Delivery area added.");
    } catch (err) {
      setError(err?.response?.data?.error || "Unable to add area.");
    } finally {
      setCreatingArea(false);
    }
  }

  async function saveArea(areaId) {
    try {
      setSavingAreaId(areaId);
      setError("");
      setSuccess("");

      const draft = areaDrafts[areaId];
      const response = await api.patch(`/settings/delivery-areas/${areaId}/`, draft);
      const nextAreas = areas.map((area) => (area.id === areaId ? response.data : area));
      setAreas(nextAreas);
      primeAreaDrafts(nextAreas);
      setSuccess("Delivery area updated.");
    } catch (err) {
      setError(err?.response?.data?.error || "Unable to update area.");
    } finally {
      setSavingAreaId(null);
    }
  }

  async function createDeliveryBoy() {
    try {
      setCreatingBoy(true);
      setError("");
      setSuccess("");

      const response = await api.post("/settings/delivery-boys/", newDeliveryBoy);
      const nextBoys = [...deliveryBoys, response.data].sort(
        (left, right) => left.name.localeCompare(right.name, undefined, { sensitivity: "base" })
      );
      setDeliveryBoys(nextBoys);
      primeBoyDrafts(nextBoys);
      setNewDeliveryBoy(emptyDeliveryBoyForm());
      setSuccess("Delivery boy added.");
    } catch (err) {
      setError(err?.response?.data?.error || "Unable to add delivery boy.");
    } finally {
      setCreatingBoy(false);
    }
  }

  async function saveDeliveryBoy(accountId) {
    try {
      setSavingBoyId(accountId);
      setError("");
      setSuccess("");

      const response = await api.patch(`/settings/delivery-boys/${accountId}/`, boyDrafts[accountId]);
      const nextBoys = deliveryBoys.map((boy) => (boy.id === accountId ? response.data : boy));
      setDeliveryBoys(nextBoys);
      primeBoyDrafts(nextBoys);
      setSuccess("Delivery boy updated.");
    } catch (err) {
      setError(err?.response?.data?.error || "Unable to update delivery boy.");
    } finally {
      setSavingBoyId(null);
    }
  }

  async function deleteDeliveryBoy(accountId) {
    const confirmed = window.confirm("Delete this delivery boy completely?");
    if (!confirmed) {
      return;
    }

    try {
      setSavingBoyId(accountId);
      setError("");
      setSuccess("");

      const response = await api.delete(`/settings/delivery-boys/${accountId}/`);
      const action = response.data?.action;

      if (action === "deleted") {
        const nextBoys = deliveryBoys.filter((boy) => boy.id !== accountId);
        setDeliveryBoys(nextBoys);
        primeBoyDrafts(nextBoys);
      } else {
        await loadSettings();
      }

      setSuccess(response.data?.message || "Delivery boy updated.");
    } catch (err) {
      setError(err?.response?.data?.error || "Unable to remove delivery boy.");
    } finally {
      setSavingBoyId(null);
    }
  }

  async function submitBulkCollect() {
    try {
      setBulkCollecting(true);
      setError("");
      setSuccess("");
      setBulkCollectSummary(null);

      const response = await api.post("/settings/collect-orders/", {
        from_date: bulkCollectFromDate,
        to_date: bulkCollectToDate,
        payment_type: bulkCollectPaymentType,
      });

      setBulkCollectSummary(response.data);
      setSuccess("Bulk collect finished.");
    } catch (err) {
      setError(err?.response?.data?.error || "Unable to collect these orders right now.");
    } finally {
      setBulkCollecting(false);
    }
  }

  async function saveOperationalReportingDate() {
    if (!isAdmin) {
      setError("Admin access is required for operational reset controls.");
      return;
    }

    try {
      setSavingOperationalDate(true);
      setError("");
      setSuccess("");
      setOperationalResetSummary(null);

      const response = await api.patch("/system/operational-settings/", {
        reporting_start_date: operationalDateDraft || null,
      });

      syncOperationalSettings(response.data || {});
      setConfirmingOperationalReset(false);
      setSuccess("System reporting start date updated.");
    } catch (err) {
      setError(err?.response?.data?.error || "Unable to update the reporting start date.");
    } finally {
      setSavingOperationalDate(false);
    }
  }

  async function runOperationalBaselineReset() {
    if (!isAdmin) {
      setError("Admin access is required for operational reset controls.");
      return;
    }

    if (!operationalDateDraft) {
      setError("Choose the new reporting start date first.");
      return;
    }

    try {
      setResettingOperationalBaseline(true);
      setError("");
      setSuccess("");

      const response = await api.post("/system/operational-baseline-reset/", {
        reporting_start_date: operationalDateDraft,
      });

      syncOperationalSettings(response.data?.settings || {});
      setOperationalResetSummary(response.data?.summary || null);
      setConfirmingOperationalReset(false);
      setSuccess(
        response.data?.message ||
          "Live inventory was reset to zero and the reporting start date was updated.",
      );
    } catch (err) {
      try {
        const verificationResponse = await api.get("/system/operational-settings/");
        const verifiedSettings = verificationResponse.data || {};
        const baselineWasUpdated =
          verifiedSettings.reporting_start_date === operationalDateDraft &&
          Boolean(verifiedSettings.inventory_last_zeroed_at);

        if (baselineWasUpdated) {
          syncOperationalSettings(verifiedSettings);
          setConfirmingOperationalReset(false);
          setOperationalResetSummary((current) => current || {
            inventory_items_count: 0,
            reset_items_count: 0,
          });
          setError("");
          setSuccess(
            "Live inventory reset completed. The original response did not finish cleanly, but the new system baseline is saved.",
          );
          return;
        }
      } catch {
        // Fall through to the original error message below.
      }

      setError(getErrorMessage(err, "Unable to reset the live inventory right now."));
    } finally {
      setResettingOperationalBaseline(false);
    }
  }

  if (loading) {
    return (
      <PanelLoader
        eyebrow="Settings"
        label="Loading operational settings..."
        description="Pulling delivery areas, charges, and rider controls."
      />
    );
  }

  return (
    <div className="space-y-6">
      <div className="rounded-3xl border border-slate-800 bg-slate-950/70 p-6">
        <div className="text-xs font-semibold uppercase tracking-[0.3em] text-emerald-300">
          Settings
        </div>
        <h2 className="mt-3 text-2xl font-semibold text-white">Operational controls</h2>
        <p className="mt-2 max-w-3xl text-sm leading-7 text-slate-400">
          Update delivery rates by area, manage delivery boys, and keep the ordering flow consistent without touching code.
          This page now stays compact so we have enough room to add more settings cleanly.
        </p>

        <SettingsFeedback error={error} success={success} />
      </div>

      <div className="rounded-3xl border border-slate-800 bg-slate-950/70 p-6">
        <div className="text-xs font-semibold uppercase tracking-[0.3em] text-sky-300">
          Appearance
        </div>
        <div className="mt-3 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h3 className="text-2xl font-semibold text-white">Color schemes</h3>
            <p className="mt-2 max-w-3xl text-sm leading-7 text-slate-400">
              Switch the full control panel vibe without hurting readability. Status colors stay meaningful across every scheme.
            </p>
          </div>
          <div className="rounded-2xl border border-slate-800 bg-slate-900/70 px-4 py-3 text-sm text-slate-300">
            Active scheme: <span className="font-semibold text-white">{activeTheme.label}</span>
          </div>
        </div>

        <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {THEME_OPTIONS.map((theme) => {
            const isActive = activeTheme.value === theme.value;

            return (
              <button
                key={theme.value}
                type="button"
                onClick={() => onPreferenceChange?.({ theme_preference: theme.value })}
                disabled={preferenceSaving}
                className={`text-left rounded-[28px] border p-4 transition ${
                  isActive
                    ? "border-amber-300/60 bg-amber-200/10 shadow-[0_0_0_1px_rgba(253,224,71,0.22),0_18px_45px_rgba(251,191,36,0.14)]"
                    : "border-slate-800 bg-slate-900/60 hover:border-slate-600 hover:bg-slate-900/85"
                } disabled:cursor-not-allowed disabled:opacity-70`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-lg font-semibold text-white">{theme.label}</div>
                    <div className="mt-1 text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">
                      {theme.quickLabel} Scheme
                    </div>
                  </div>
                  <div className={`rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] ${
                    isActive
                      ? "border border-amber-300/40 bg-amber-300/15 text-amber-100"
                      : "border border-slate-700 bg-slate-950/70 text-slate-300"
                  }`}>
                    {isActive ? "Active" : "Select"}
                  </div>
                </div>

                <div className="mt-4 rounded-[22px] border border-white/10 p-3" style={{ backgroundColor: theme.preview.shell }}>
                  <div className="grid gap-2">
                    <div className="h-4 rounded-full" style={{ backgroundColor: theme.preview.accent, width: "42%" }} />
                    <div className="rounded-2xl border p-3" style={{ backgroundColor: theme.preview.card, borderColor: theme.preview.border }}>
                      <div className="flex gap-2">
                        <div className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: theme.preview.accent }} />
                        <div className="h-2.5 w-16 rounded-full bg-white/20" />
                      </div>
                      <div className="mt-3 grid grid-cols-3 gap-2">
                        <div className="h-10 rounded-xl" style={{ backgroundColor: theme.preview.card, border: `1px solid ${theme.preview.border}` }} />
                        <div className="h-10 rounded-xl" style={{ backgroundColor: theme.preview.card, border: `1px solid ${theme.preview.border}` }} />
                        <div className="h-10 rounded-xl" style={{ backgroundColor: theme.preview.card, border: `1px solid ${theme.preview.border}` }} />
                      </div>
                    </div>
                  </div>
                </div>

                <p className="mt-4 text-sm leading-6 text-slate-400">
                  {theme.description}
                </p>
              </button>
            );
          })}
        </div>

        {preferenceSaving ? (
          <div className="mt-4 text-[11px] font-semibold uppercase tracking-[0.26em] text-emerald-300">
            Saving scheme...
          </div>
        ) : null}
      </div>

      <div className="grid gap-5 xl:grid-cols-4">
        <SettingsLauncherCard
          eyebrow="Delivery Rates"
          title="Delivery charges"
          description="Open a separate window to add areas, adjust rates, and maintain the delivery charge sheet."
          stats={`${areas.length} area${areas.length === 1 ? "" : "s"} configured`}
          actionLabel="Open delivery charges"
          accent="emerald"
          onClick={() => setActiveWindow("areas")}
        />

        <SettingsLauncherCard
          eyebrow="Rider Access"
          title="Delivery boys"
          description="Open a separate window to add, edit, or delete delivery boys without crowding this page."
          stats={`${deliveryBoys.length} delivery boy${deliveryBoys.length === 1 ? "" : "s"}`}
          actionLabel="Open delivery boys"
          accent="sky"
          onClick={() => setActiveWindow("boys")}
        />

        <SettingsLauncherCard
          eyebrow="Collections"
          title="Collect all orders"
          description="Open a quick settlement window to collect every eligible unpaid order for a day or date range in one go."
          stats="Choose date range + one payment mode"
          actionLabel="Open bulk collect"
          accent="amber"
          onClick={() => setActiveWindow("collect")}
        />

        <SettingsLauncherCard
          eyebrow="Operational Reset"
          title="Reporting baseline"
          description="Choose the system-wide reporting start date and, when needed, reset the live inventory snapshot to zero without deleting products or order history."
          stats={
            operationalSettings.reporting_start_date
              ? `Starts from ${formatDateLabel(operationalSettings.reporting_start_date)}`
              : "Not set yet"
          }
          actionLabel="Open baseline controls"
          accent="violet"
          onClick={() => setActiveWindow("operations")}
        />
      </div>

      {activeWindow === "areas" ? (
        <SettingsModal title="Delivery Areas & Charges" onClose={() => setActiveWindow(null)}>
          <SettingsFeedback error={error} success={success} />

          <div className="mt-5 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <div className="text-lg font-semibold text-white">Delivery Areas & Charges</div>
              <div className="mt-1 text-sm text-slate-400">
                This behaves like a simple rate sheet. Every delivery order pulls its charge directly from the selected area here.
              </div>
            </div>

            <div className="w-full max-w-sm">
              <label className="mb-2 block text-xs uppercase tracking-[0.22em] text-slate-500">Search Area</label>
              <input
                value={areaSearch}
                onChange={(event) => setAreaSearch(event.target.value)}
                className="w-full rounded-2xl border border-slate-700 bg-slate-900 px-4 py-3 text-white outline-none transition focus:border-emerald-500"
                placeholder="Chadoora, Buchroo..."
              />
            </div>
          </div>

          <div className="mt-5 rounded-3xl border border-slate-800 bg-slate-900/70 p-4">
            <div className="grid gap-3 md:grid-cols-[minmax(0,1.4fr)_200px_160px]">
              <input
                value={newAreaName}
                onChange={(event) => setNewAreaName(event.target.value)}
                className="rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-white outline-none transition focus:border-emerald-500"
                placeholder="Add new area name"
              />
              <input
                type="number"
                min="0"
                step="0.01"
                value={newAreaCharge}
                onChange={(event) => setNewAreaCharge(event.target.value)}
                className="rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-white outline-none transition focus:border-emerald-500"
                placeholder="Delivery charge"
              />
              <button
                onClick={createArea}
                disabled={creatingArea}
                className="rounded-2xl bg-emerald-500 px-4 py-3 font-semibold text-slate-950 transition hover:brightness-105 disabled:opacity-70"
              >
                <InlineButtonContent busy={creatingArea} busyLabel="Adding...">
                  Add Area
                </InlineButtonContent>
              </button>
            </div>
          </div>

          <div className="mt-5 overflow-hidden rounded-3xl border border-slate-800">
            <div className="grid grid-cols-[minmax(0,1.4fr)_220px_150px] gap-3 bg-slate-900 px-4 py-4 text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">
              <div>Area</div>
              <div>Delivery Charge</div>
              <div>Action</div>
            </div>

            <div className="divide-y divide-slate-800">
              {filteredAreas.map((area) => {
                const draft = areaDrafts[area.id] || {
                  name: area.name,
                  delivery_charge: String(area.delivery_charge ?? "0.00"),
                };

                return (
                  <div key={area.id} className="grid grid-cols-[minmax(0,1.4fr)_220px_150px] gap-3 bg-slate-950/70 px-4 py-4">
                    <input
                      value={draft.name}
                      onChange={(event) =>
                        setAreaDrafts((current) => ({
                          ...current,
                          [area.id]: {
                            ...draft,
                            name: event.target.value,
                          },
                        }))
                      }
                      className="rounded-2xl border border-slate-700 bg-slate-900 px-4 py-3 text-white outline-none transition focus:border-emerald-500"
                    />
                    <div className="space-y-2">
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={draft.delivery_charge}
                        onChange={(event) =>
                          setAreaDrafts((current) => ({
                            ...current,
                            [area.id]: {
                              ...draft,
                              delivery_charge: event.target.value,
                            },
                          }))
                        }
                        className="w-full rounded-2xl border border-slate-700 bg-slate-900 px-4 py-3 text-white outline-none transition focus:border-emerald-500"
                      />
                      <div className="text-xs text-slate-400">
                        Prints as {formatDeliveryChargeLabel("DELIVERY", draft.delivery_charge)}
                      </div>
                    </div>
                    <button
                      onClick={() => saveArea(area.id)}
                      disabled={savingAreaId === area.id}
                      className="rounded-2xl border border-slate-700 bg-slate-900 px-4 py-3 font-semibold text-white transition hover:border-slate-500 disabled:opacity-70"
                    >
                      <InlineButtonContent busy={savingAreaId === area.id} busyLabel="Saving...">
                        Save
                      </InlineButtonContent>
                    </button>
                  </div>
                );
              })}

              {!filteredAreas.length ? (
                <div className="px-4 py-10 text-center text-sm text-slate-400">
                  No delivery areas match this search yet.
                </div>
              ) : null}
            </div>
          </div>
        </SettingsModal>
      ) : null}

      {activeWindow === "boys" ? (
        <SettingsModal title="Delivery Boys" onClose={() => setActiveWindow(null)}>
          <SettingsFeedback error={error} success={success} />

          <div className="mt-5">
            <div className="text-lg font-semibold text-white">Delivery Boys</div>
            <div className="mt-1 text-sm text-slate-400">
              Add, edit, or delete riders from one simple place. There is no archive layer now, so what you see here is the full rider list.
            </div>
          </div>

          <div className="mt-5 rounded-3xl border border-slate-800 bg-slate-900/70 p-4">
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
              <input
                value={newDeliveryBoy.name}
                onChange={(event) => setNewDeliveryBoy((current) => ({ ...current, name: event.target.value }))}
                className="rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-white outline-none transition focus:border-emerald-500"
                placeholder="Delivery boy name"
              />
              <input
                value={newDeliveryBoy.contact_number}
                onChange={(event) => setNewDeliveryBoy((current) => ({ ...current, contact_number: event.target.value }))}
                className="rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-white outline-none transition focus:border-emerald-500"
                placeholder="Phone number"
              />
              <input
                value={newDeliveryBoy.address}
                onChange={(event) => setNewDeliveryBoy((current) => ({ ...current, address: event.target.value }))}
                className="rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-white outline-none transition focus:border-emerald-500"
                placeholder="Address (optional)"
              />
              <input
                type="number"
                step="0.01"
                value={newDeliveryBoy.opening_balance}
                onChange={(event) => setNewDeliveryBoy((current) => ({ ...current, opening_balance: event.target.value }))}
                className="rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-white outline-none transition focus:border-emerald-500"
                placeholder="Opening balance"
              />
              <button
                onClick={createDeliveryBoy}
                disabled={creatingBoy}
                className="rounded-2xl bg-sky-500 px-4 py-3 font-semibold text-slate-950 transition hover:brightness-105 disabled:opacity-70"
              >
                <InlineButtonContent busy={creatingBoy} busyLabel="Adding...">
                  Add Delivery Boy
                </InlineButtonContent>
              </button>
            </div>
          </div>

          <div className="mt-5 grid gap-4 xl:grid-cols-2">
            {deliveryBoys.map((boy) => {
              const draft = boyDrafts[boy.id] || emptyDeliveryBoyForm();

              return (
                <div key={boy.id} className="rounded-3xl border border-slate-800 bg-slate-900/70 p-5">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className="text-lg font-semibold text-white">{boy.name}</div>
                      <div className="mt-1 text-sm text-slate-400">
                        {boy.contact_number || "No phone"} • Balance {formatMoney(boy.balance)}
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 grid gap-3">
                    <input
                      value={draft.name}
                      onChange={(event) =>
                        setBoyDrafts((current) => ({
                          ...current,
                          [boy.id]: {
                            ...draft,
                            name: event.target.value,
                          },
                        }))
                      }
                      className="rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-white outline-none transition focus:border-emerald-500"
                      placeholder="Name"
                    />
                    <input
                      value={draft.contact_number}
                      onChange={(event) =>
                        setBoyDrafts((current) => ({
                          ...current,
                          [boy.id]: {
                            ...draft,
                            contact_number: event.target.value,
                          },
                        }))
                      }
                      className="rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-white outline-none transition focus:border-emerald-500"
                      placeholder="Phone"
                    />
                    <input
                      value={draft.address}
                      onChange={(event) =>
                        setBoyDrafts((current) => ({
                          ...current,
                          [boy.id]: {
                            ...draft,
                            address: event.target.value,
                          },
                        }))
                      }
                      className="rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-white outline-none transition focus:border-emerald-500"
                      placeholder="Address"
                    />
                    <div className="grid gap-3 md:grid-cols-2">
                      <input
                        type="number"
                        step="0.01"
                        value={draft.opening_balance}
                        onChange={(event) =>
                          setBoyDrafts((current) => ({
                            ...current,
                            [boy.id]: {
                              ...draft,
                              opening_balance: event.target.value,
                            },
                          }))
                        }
                        className="rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-white outline-none transition focus:border-emerald-500"
                        placeholder="Opening balance"
                      />
                    </div>
                  </div>

                  <div className="mt-4 flex flex-wrap gap-3">
                    <button
                      onClick={() => saveDeliveryBoy(boy.id)}
                      disabled={savingBoyId === boy.id}
                      className="rounded-2xl bg-emerald-500 px-4 py-3 font-semibold text-slate-950 transition hover:brightness-105 disabled:opacity-70"
                    >
                      <InlineButtonContent busy={savingBoyId === boy.id} busyLabel="Saving...">
                        Save Changes
                      </InlineButtonContent>
                    </button>
                    <button
                      onClick={() => deleteDeliveryBoy(boy.id)}
                      disabled={savingBoyId === boy.id}
                      className="rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 font-semibold text-rose-200 transition hover:bg-rose-500/20 disabled:opacity-70"
                    >
                      Remove
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </SettingsModal>
      ) : null}

      {activeWindow === "collect" ? (
        <SettingsModal title="Collect All Orders" onClose={() => setActiveWindow(null)}>
          <SettingsFeedback error={error} success={success} />

          <div className="mt-5 space-y-5">
            <div>
              <div className="text-lg font-semibold text-white">Bulk order collection</div>
              <div className="mt-1 text-sm text-slate-400">
                This collects every eligible unpaid order in the selected date range with one payment mode.
                Completed unpaid orders already assigned to customer ledger stay untouched and will be skipped safely.
              </div>
            </div>

            <div className="rounded-3xl border border-slate-800 bg-slate-900/70 p-4">
              <div className="grid gap-3 md:grid-cols-3">
                <div>
                  <label className="mb-2 block text-xs uppercase tracking-[0.22em] text-slate-500">From</label>
                  <input
                    type="date"
                    value={bulkCollectFromDate}
                    onChange={(event) => setBulkCollectFromDate(event.target.value)}
                    className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-white outline-none transition focus:border-amber-400"
                  />
                </div>

                <div>
                  <label className="mb-2 block text-xs uppercase tracking-[0.22em] text-slate-500">To</label>
                  <input
                    type="date"
                    value={bulkCollectToDate}
                    onChange={(event) => setBulkCollectToDate(event.target.value)}
                    className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-white outline-none transition focus:border-amber-400"
                  />
                </div>

                <div>
                  <label className="mb-2 block text-xs uppercase tracking-[0.22em] text-slate-500">Payment Mode</label>
                  <select
                    value={bulkCollectPaymentType}
                    onChange={(event) => setBulkCollectPaymentType(event.target.value)}
                    className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-white outline-none transition focus:border-amber-400"
                  >
                    <option value="CASH">Cash</option>
                    <option value="ONLINE">Online</option>
                  </select>
                </div>
              </div>

              <button
                onClick={submitBulkCollect}
                disabled={bulkCollecting}
                className="mt-4 rounded-2xl bg-amber-400 px-5 py-3 font-semibold text-slate-950 transition hover:brightness-105 disabled:opacity-70"
              >
                <InlineButtonContent busy={bulkCollecting} busyLabel="Collecting...">
                  Collect matching orders
                </InlineButtonContent>
              </button>
            </div>

            {bulkCollectSummary?.summary ? (
              <div className="space-y-4">
                <div className="grid gap-3 md:grid-cols-4">
                  <MiniSummaryCard label="Eligible" value={bulkCollectSummary.summary.eligible_orders} />
                  <MiniSummaryCard label="Collected" value={bulkCollectSummary.summary.collected_count} tone="success" />
                  <MiniSummaryCard label="Skipped" value={bulkCollectSummary.summary.skipped_count} tone="warning" />
                  <MiniSummaryCard label="Failed" value={bulkCollectSummary.summary.failed_count} tone="danger" />
                </div>

                <div className="rounded-3xl border border-slate-800 bg-slate-900/70 p-4">
                  <div className="text-xs uppercase tracking-[0.22em] text-slate-500">Total Collected</div>
                  <div className="mt-2 text-3xl font-semibold text-white">
                    Rs {formatMoney(bulkCollectSummary.summary.total_collected_amount)}
                  </div>
                  <div className="mt-2 text-sm text-slate-400">
                    Mode used: {bulkCollectSummary.summary.payment_type}
                  </div>
                </div>

                {bulkCollectSummary.skipped_orders?.length ? (
                  <div className="rounded-3xl border border-slate-800 bg-slate-900/70 p-4">
                    <div className="text-sm font-semibold text-white">Skipped orders</div>
                    <div className="mt-3 space-y-2">
                      {bulkCollectSummary.skipped_orders.map((row) => (
                        <div key={`skipped-${row.id}`} className="rounded-2xl border border-slate-800 bg-slate-950/70 px-4 py-3 text-sm text-slate-300">
                          Order #{row.id}: {row.reason}
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}

                {bulkCollectSummary.failed_orders?.length ? (
                  <div className="rounded-3xl border border-rose-500/20 bg-rose-500/10 p-4">
                    <div className="text-sm font-semibold text-rose-100">Failed orders</div>
                    <div className="mt-3 space-y-2">
                      {bulkCollectSummary.failed_orders.map((row) => (
                        <div key={`failed-${row.id}`} className="rounded-2xl border border-rose-500/20 bg-slate-950/60 px-4 py-3 text-sm text-rose-100">
                          Order #{row.id}: {row.reason}
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        </SettingsModal>
      ) : null}

      {activeWindow === "operations" ? (
        <SettingsModal title="Operational Reset & Reporting Baseline" onClose={() => setActiveWindow(null)}>
          <SettingsFeedback error={error} success={success} />

          <div className="space-y-5">
            <div>
              <div className="text-lg font-semibold text-white">System-wide reporting baseline</div>
              <div className="mt-1 text-sm text-slate-400">
                Use this when you want reporting to start fresh from a chosen date while keeping orders,
                customers, products, purchase history, and expense history intact.
              </div>
            </div>

            <div className="grid gap-4 lg:grid-cols-3">
              <MiniSummaryCard
                label="Current Start Date"
                value={operationalSettings.reporting_start_date ? formatDateLabel(operationalSettings.reporting_start_date) : "Not set"}
              />
              <MiniSummaryCard
                label="Inventory Last Zeroed"
                value={formatDateTimeLabel(operationalSettings.inventory_last_zeroed_at)}
                tone="warning"
              />
              <MiniSummaryCard
                label="Last Zeroed By"
                value={operationalSettings.inventory_last_zeroed_by_name || "Not recorded"}
                tone="neutral"
              />
            </div>

            <div className="rounded-3xl border border-violet-500/20 bg-violet-500/10 p-4">
              <div className="text-xs font-semibold uppercase tracking-[0.24em] text-violet-200">
                What This Changes
              </div>
              <div className="mt-3 space-y-2 text-sm leading-7 text-slate-200">
                <div>Changing the reporting start date makes reports and data views calculate from that date onward.</div>
                <div>Resetting live inventory sets current quantity and current stock value to zero for every inventory item.</div>
                <div>Products, units, alert thresholds, purchase bills, old orders, ledgers, and expenses stay preserved.</div>
              </div>
            </div>

            <div className="rounded-3xl border border-slate-800 bg-slate-900/70 p-4">
              <div className="grid gap-4 lg:grid-cols-[minmax(0,280px)_1fr] lg:items-end">
                <div>
                  <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">
                    Reporting Start Date
                  </label>
                  <input
                    type="date"
                    value={operationalDateDraft}
                    onChange={(event) => {
                      setOperationalDateDraft(event.target.value);
                      setConfirmingOperationalReset(false);
                    }}
                    className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-white outline-none transition focus:border-violet-400"
                  />
                </div>

                <div className="rounded-2xl border border-slate-800 bg-slate-950/70 px-4 py-3 text-sm text-slate-300">
                  {operationalDateDraft
                    ? `Every report will start from ${formatDateLabel(operationalDateDraft)} until you change it again.`
                    : "Choose a date to start a fresh reporting window."}
                </div>
              </div>

              <div className="mt-4 flex flex-col gap-3 lg:flex-row">
                <button
                  onClick={saveOperationalReportingDate}
                  disabled={savingOperationalDate || !isAdmin}
                  className="rounded-2xl bg-violet-400 px-5 py-3 font-semibold text-slate-950 transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <InlineButtonContent busy={savingOperationalDate} busyLabel="Saving...">
                    Save start date only
                  </InlineButtonContent>
                </button>

                <button
                  onClick={() => setConfirmingOperationalReset((current) => !current)}
                  disabled={resettingOperationalBaseline || !isAdmin}
                  className="rounded-2xl border border-rose-500/30 bg-rose-500/10 px-5 py-3 font-semibold text-rose-100 transition hover:bg-rose-500/20 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Reset live inventory to zero
                </button>
              </div>

              {!isAdmin ? (
                <div className="mt-4 rounded-2xl border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
                  Admin access is required to change the baseline or reset live inventory.
                </div>
              ) : null}

              {confirmingOperationalReset ? (
                <div className="mt-4 rounded-3xl border border-rose-500/25 bg-rose-500/10 p-4">
                  <div className="text-sm font-semibold text-rose-100">Confirm inventory reset</div>
                  <div className="mt-2 text-sm leading-7 text-slate-200">
                    This will set every current inventory quantity and current stock value to zero, then start
                    reports from <span className="font-semibold text-white">{formatDateLabel(operationalDateDraft || today)}</span>.
                  </div>
                  <div className="mt-4 flex flex-col gap-3 sm:flex-row">
                    <button
                      onClick={runOperationalBaselineReset}
                      disabled={resettingOperationalBaseline}
                      className="rounded-2xl bg-rose-500 px-5 py-3 font-semibold text-white transition hover:bg-rose-400 disabled:opacity-60"
                    >
                      <InlineButtonContent busy={resettingOperationalBaseline} busyLabel="Resetting...">
                        Yes, reset inventory now
                      </InlineButtonContent>
                    </button>
                    <button
                      onClick={() => setConfirmingOperationalReset(false)}
                      disabled={resettingOperationalBaseline}
                      className="rounded-2xl border border-slate-700 px-5 py-3 font-semibold text-slate-200 transition hover:border-slate-500"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : null}
            </div>

            {operationalResetSummary ? (
              <div className="rounded-3xl border border-emerald-500/20 bg-emerald-500/10 p-4">
                <div className="text-sm font-semibold text-emerald-100">Last reset summary</div>
                <div className="mt-3 grid gap-3 md:grid-cols-2">
                  <MiniSummaryCard
                    label="Inventory Items Found"
                    value={operationalResetSummary.inventory_items_count ?? 0}
                    tone="success"
                  />
                  <MiniSummaryCard
                    label="Items Reset"
                    value={operationalResetSummary.reset_items_count ?? 0}
                    tone="success"
                  />
                </div>
              </div>
            ) : null}
          </div>
        </SettingsModal>
      ) : null}
    </div>
  );
}

function SettingsFeedback({ error, success }) {
  if (!error && !success) {
    return null;
  }

  return (
    <div className="mt-4 space-y-3">
      {error ? (
        <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
          {error}
        </div>
      ) : null}

      {success ? (
        <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
          {success}
        </div>
      ) : null}
    </div>
  );
}

function SettingsLauncherCard({ eyebrow, title, description, stats, actionLabel, accent, onClick }) {
  const accentClasses = {
    emerald: "border-emerald-500/20 bg-emerald-500/10 text-emerald-200",
    sky: "border-sky-500/20 bg-sky-500/10 text-sky-200",
    amber: "border-amber-500/20 bg-amber-500/10 text-amber-200",
    violet: "border-violet-500/20 bg-violet-500/10 text-violet-200",
  };

  return (
    <div className="rounded-3xl border border-slate-800 bg-slate-950/70 p-6">
      <div className={`inline-flex rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.24em] ${accentClasses[accent] || accentClasses.emerald}`}>
        {eyebrow}
      </div>
      <div className="mt-4 text-xl font-semibold text-white">{title}</div>
      <p className="mt-2 text-sm leading-7 text-slate-400">{description}</p>
      <div className="mt-5 text-sm font-medium text-slate-300">{stats}</div>
      <button
        onClick={onClick}
        className="mt-6 rounded-2xl border border-slate-700 bg-slate-900 px-4 py-3 font-semibold text-white transition hover:border-slate-500 hover:bg-slate-800"
      >
        {actionLabel}
      </button>
    </div>
  );
}

function MiniSummaryCard({ label, value, tone = "neutral" }) {
  const toneClasses = {
    neutral: "border-slate-800 bg-slate-900/70 text-white",
    success: "border-emerald-500/20 bg-emerald-500/10 text-emerald-100",
    warning: "border-amber-500/20 bg-amber-500/10 text-amber-100",
    danger: "border-rose-500/20 bg-rose-500/10 text-rose-100",
  };

  return (
    <div className={`rounded-3xl border p-4 ${toneClasses[tone] || toneClasses.neutral}`}>
      <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-400">{label}</div>
      <div className="mt-2 text-2xl font-semibold">{value}</div>
    </div>
  );
}

function SettingsModal({ title, children, onClose }) {
  useEffect(() => {
    function handleKeyDown(event) {
      if (event.key === "Escape") {
        onClose();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 bg-black/75 px-4 py-6 backdrop-blur-sm">
      <div className="mx-auto flex h-full w-full max-w-7xl flex-col overflow-hidden rounded-[2rem] border border-slate-800 bg-slate-950 shadow-2xl">
        <div className="flex items-center justify-between gap-4 border-b border-slate-800 px-6 py-5">
          <div>
            <div className="text-lg font-semibold text-white">{title}</div>
            <div className="mt-1 text-sm text-slate-400">
              Press Esc or use Close when you are done here.
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-2xl border border-slate-700 bg-slate-900 px-4 py-2 font-semibold text-white transition hover:border-slate-500 hover:bg-slate-800"
          >
            Close
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-6">
          {children}
        </div>
      </div>
    </div>
  );
}
