import { useEffect, useMemo, useRef, useState } from "react";

import LoginScreen from "./components/LoginScreen";
import CustomerDisplay from "./pages/CustomerDisplay";
import api, { buildApiUrl, clearAuthToken, getAuthToken } from "./services/api";
import { TAB_DEFINITIONS } from "./constants/tabConfig";
import { getThemeConfig, isLightThemePreference } from "./constants/themeOptions";
import { InlineLoaderLabel, ScreenLoader } from "./components/SystemLoader";


const isDisplay = window.location.pathname === "/display";
const ROOT_FONT_SIZES = {
  SMALL: "15px",
  MEDIUM: "16px",
  BIG: "18px",
};
const FONT_OPTIONS = [
  { value: "SMALL", label: "Small" },
  { value: "MEDIUM", label: "Medium" },
  { value: "BIG", label: "Big" },
];


function WelcomeOverlay({ message }) {
  const [phase, setPhase] = useState("enter");

  useEffect(() => {
    const settleTimer = window.setTimeout(() => setPhase("settle"), 350);
    const exitTimer = window.setTimeout(() => setPhase("exit"), 1750);

    return () => {
      window.clearTimeout(settleTimer);
      window.clearTimeout(exitTimer);
    };
  }, []);

  return (
    <div className={`welcome-screen ${phase}`}>
      <div className="welcome-screen__veil" />
      <div className="welcome-screen__beam" />
      <div className="welcome-screen__content">
        <div className="welcome-screen__eyebrow">System Access Granted</div>
        <div className="welcome-screen__title">{message}</div>
        <div className="welcome-screen__subtitle">
          Entering the live restaurant control environment...
        </div>
      </div>
    </div>
  );
}

function formatMoney(value) {
  return Number(value || 0).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function ExternalOrderPrompt({ order, onAccept, onDecline, onDismiss, busy }) {
  if (!order) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/75 px-4 backdrop-blur-sm">
      <div className="w-full max-w-2xl rounded-[30px] border border-amber-400/25 bg-slate-950/95 p-6 shadow-[0_30px_90px_rgba(15,23,42,0.6)]">
        <div className="text-[11px] font-semibold uppercase tracking-[0.34em] text-amber-300">
          New Order Received
        </div>
        <h2 className="mt-3 text-2xl font-semibold text-white">Order #{order.id}</h2>

        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <div className="rounded-2xl border border-slate-800 bg-slate-900/70 px-4 py-4">
            <div className="text-xs uppercase tracking-[0.24em] text-slate-500">Submitted By</div>
            <div className="mt-2 text-lg font-semibold text-white">
              {order.submitted_by_name || order.submitted_by_username || "Unknown user"}
            </div>
          </div>
          <div className="rounded-2xl border border-slate-800 bg-slate-900/70 px-4 py-4">
            <div className="text-xs uppercase tracking-[0.24em] text-slate-500">Order Type</div>
            <div className="mt-2 text-lg font-semibold text-white">
              {order.order_type_display || order.order_type}
            </div>
          </div>
          <div className="rounded-2xl border border-slate-800 bg-slate-900/70 px-4 py-4">
            <div className="text-xs uppercase tracking-[0.24em] text-slate-500">Customer</div>
            <div className="mt-2 text-lg font-semibold text-white">
              {order.customer_name || "Unnamed customer"}
            </div>
            <div className="mt-1 text-sm text-slate-400">{order.customer_phone || "No phone"}</div>
          </div>
          <div className="rounded-2xl border border-slate-800 bg-slate-900/70 px-4 py-4">
            <div className="text-xs uppercase tracking-[0.24em] text-slate-500">Amount</div>
            <div className="mt-2 text-lg font-semibold text-amber-200">
              Rs {formatMoney(order.total_amount)}
            </div>
          </div>
        </div>

        <div className="mt-4 rounded-2xl border border-slate-800 bg-slate-900/70 px-4 py-4">
          <div className="text-xs uppercase tracking-[0.24em] text-slate-500">Items</div>
          <div className="mt-2 text-sm leading-7 text-slate-200">
            {(order.items || []).map((item) => `${item.item_name} x${item.quantity}`).join(", ") || "No items"}
          </div>
        </div>

        {order.order_note ? (
          <div className="mt-4 rounded-2xl border border-slate-800 bg-slate-900/70 px-4 py-4">
            <div className="text-xs uppercase tracking-[0.24em] text-slate-500">Order Note</div>
            <div className="mt-2 text-sm leading-7 text-slate-200">{order.order_note}</div>
          </div>
        ) : null}

        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
          <button
            onClick={onDecline}
            disabled={busy}
            className="flex-1 rounded-2xl bg-rose-600 px-4 py-3 font-semibold text-white transition hover:bg-rose-500 disabled:opacity-60"
          >
            Decline
          </button>
          <button
            onClick={onAccept}
            disabled={busy}
            className="flex-1 rounded-2xl bg-emerald-500 px-4 py-3 font-semibold text-slate-950 transition hover:bg-emerald-400 disabled:opacity-60"
          >
            Accept
          </button>
        </div>

        <button
          onClick={onDismiss}
          className="mt-4 w-full rounded-2xl border border-slate-700 px-4 py-3 text-sm font-semibold text-slate-300 transition hover:border-slate-500"
        >
          View Later
        </button>
      </div>
    </div>
  );
}


function AppearanceControls({ user, onPreferenceChange, preferenceSaving, onLogout }) {
  const themeConfig = getThemeConfig(user?.theme_preference);
  const isDayTheme = themeConfig.family === "light";
  const nextQuickTheme = isDayTheme ? "NIGHT" : "DAY";

  return (
    <div className="flex flex-wrap items-center justify-end gap-3">
      <div className="rounded-[24px] border border-slate-700/70 bg-slate-950/50 px-4 py-3 backdrop-blur-sm">
        <div className="text-[10px] font-semibold uppercase tracking-[0.28em] text-slate-400">
          Quick Mode
        </div>
        <div className={`mt-1 text-xs ${isDayTheme ? "text-slate-600" : "text-slate-400"}`}>
          {themeConfig.label}
        </div>
        <button
          type="button"
          onClick={() =>
            onPreferenceChange({
              theme_preference: nextQuickTheme,
            })
          }
          className="mt-2 flex items-center gap-3"
        >
          <span className={`text-xs font-semibold ${isDayTheme ? "text-slate-500" : "text-white"}`}>
            Dark
          </span>
          <span className={`relative flex h-9 w-20 items-center rounded-full border transition ${
            isDayTheme
              ? "border-amber-300/40 bg-amber-400/15"
              : "border-cyan-400/30 bg-cyan-400/12"
          }`}>
            <span
              className={`absolute top-1 h-7 w-9 rounded-full shadow-lg transition-all duration-300 ${
                isDayTheme
                  ? "left-10 bg-amber-300"
                  : "left-1 bg-cyan-300"
              }`}
            />
          </span>
          <span className={`text-xs font-semibold ${isDayTheme ? "text-slate-950" : "text-slate-300"}`}>
            Light
          </span>
        </button>
      </div>

      <div className="rounded-[24px] border border-slate-700/70 bg-slate-950/50 px-4 py-3 backdrop-blur-sm">
        <div className="text-[10px] font-semibold uppercase tracking-[0.28em] text-slate-400">
          Font
        </div>
        <div className="mt-2 flex flex-wrap gap-2">
          {FONT_OPTIONS.map((option) => {
            const selected = user?.font_preference === option.value;

            return (
              <button
                key={option.value}
                type="button"
                onClick={() => onPreferenceChange({ font_preference: option.value })}
                className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                  selected
                    ? "bg-emerald-400 text-slate-950"
                    : "border border-slate-600 bg-slate-900/70 text-slate-200 hover:border-slate-400"
                }`}
              >
                {option.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="rounded-full border border-slate-700 bg-slate-900/70 px-4 py-2 text-sm text-slate-200">
        {user.role === "ADMIN" ? "Admin Access" : `${user.display_name} • Staff`}
      </div>
      <button
        onClick={onLogout}
        className="rounded-full border border-rose-500/30 bg-rose-500/10 px-4 py-2 text-sm font-semibold text-rose-200 transition hover:border-rose-400/50 hover:bg-rose-500/20"
      >
        Logout
      </button>

      {preferenceSaving ? (
        <div className="w-full text-right text-[11px] font-semibold uppercase tracking-[0.26em] text-emerald-300">
          <InlineLoaderLabel label="Saving Preferences" className="justify-end gap-2" />
        </div>
      ) : null}
    </div>
  );
}


function AuthenticatedShell({ user, onLogout, onPreferenceChange, preferenceSaving }) {
  const themeConfig = getThemeConfig(user?.theme_preference);
  const isDayTheme = themeConfig.family === "light";
  const availableTabs = useMemo(() => {
    const allowed = new Set(user?.allowed_tabs || []);
    return TAB_DEFINITIONS.filter((tab) => allowed.has(tab.key));
  }, [user]);

  const [activeTab, setActiveTab] = useState(availableTabs[0]?.key || null);
  const [navigationIntent, setNavigationIntent] = useState(null);
  const [pendingExternalCount, setPendingExternalCount] = useState(0);
  const [notificationQueue, setNotificationQueue] = useState([]);
  const [activeNotification, setActiveNotification] = useState(null);
  const [decisionBusy, setDecisionBusy] = useState(false);
  const [externalRefreshKey, setExternalRefreshKey] = useState(0);
  const knownPendingIdsRef = useRef(new Set());
  const hasPrimedNotificationsRef = useRef(false);
  const canManageExternalOrders = availableTabs.some((tab) => tab.key === "MANAGE_ORDERS");

  useEffect(() => {
    if (!availableTabs.length) {
      setActiveTab(null);
      return;
    }

    const hasCurrent = availableTabs.some((tab) => tab.key === activeTab);
    if (!hasCurrent) {
      setActiveTab(availableTabs[0].key);
    }
  }, [activeTab, availableTabs]);

  useEffect(() => {
    if (!notificationQueue.length || activeNotification) {
      return;
    }

    setActiveNotification(notificationQueue[0]);
    setNotificationQueue((queue) => queue.slice(1));
  }, [notificationQueue, activeNotification]);

  useEffect(() => {
    if (!canManageExternalOrders) {
      setPendingExternalCount(0);
      setNotificationQueue([]);
      setActiveNotification(null);
      knownPendingIdsRef.current = new Set();
      hasPrimedNotificationsRef.current = false;
      return undefined;
    }

    let cancelled = false;

    const pollExternalOrders = async () => {
      try {
        const response = await fetch(buildApiUrl("orders/external-requests/?decision=PENDING"));
        const data = await response.json();

        if (!response.ok || cancelled) {
          return;
        }

        setPendingExternalCount(data.length);

        const pendingIds = new Set(data.map((order) => order.id));

        if (!hasPrimedNotificationsRef.current) {
          knownPendingIdsRef.current = pendingIds;
          hasPrimedNotificationsRef.current = true;
          return;
        }

        const newOrders = data.filter((order) => !knownPendingIdsRef.current.has(order.id));
        knownPendingIdsRef.current = pendingIds;

        if (newOrders.length) {
          setNotificationQueue((queue) => {
            const blockedIds = new Set(queue.map((item) => item.id));

            if (activeNotification) {
              blockedIds.add(activeNotification.id);
            }

            const nextQueue = [...queue];

            newOrders.forEach((order) => {
              if (!blockedIds.has(order.id)) {
                nextQueue.push(order);
              }
            });

            return nextQueue;
          });
        }
      } catch {
        // Keep the control panel stable if polling fails momentarily.
      }
    };

    pollExternalOrders();
    const intervalId = window.setInterval(pollExternalOrders, 8000);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [canManageExternalOrders, activeNotification]);

  const handleExternalDecision = async (orderId, action) => {
    setDecisionBusy(true);

    try {
      const response = await fetch(buildApiUrl(`orders/${orderId}/external-decision/`), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });

      const data = await response.json();

      if (!response.ok) {
        alert(data.error || "Failed to update external order");
        return;
      }

      setActiveNotification(null);
      setNotificationQueue((queue) => queue.filter((order) => order.id !== orderId));
      knownPendingIdsRef.current.delete(orderId);
      setPendingExternalCount((count) => Math.max(0, count - 1));
      setExternalRefreshKey((value) => value + 1);
    } finally {
      setDecisionBusy(false);
    }
  };

  const activeTabDefinition = availableTabs.find((tab) => tab.key === activeTab) || availableTabs[0];
  const ActiveComponent = activeTabDefinition?.component || null;

  const handleNavigate = (intent) => {
    if (!intent?.tab) {
      return;
    }

    setNavigationIntent({
      ...intent,
      intentId: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    });
    setActiveTab(intent.tab);
  };

  const handleNavigationHandled = (intentId) => {
    setNavigationIntent((current) => {
      if (!current || current.intentId !== intentId) {
        return current;
      }

      return null;
    });
  };

  return (
    <div
      className={`system-shell min-h-screen transition-colors duration-300 ${themeConfig.rootClass}`}
    >
      <ExternalOrderPrompt
        order={activeNotification}
        busy={decisionBusy}
        onAccept={() => handleExternalDecision(activeNotification.id, "ACCEPT")}
        onDecline={() => handleExternalDecision(activeNotification.id, "DECLINE")}
        onDismiss={() => setActiveNotification(null)}
      />

      <div className="mx-auto max-w-[95vw] p-6">
        <div
          className={`overflow-hidden rounded-[32px] px-6 py-6 shadow-[0_35px_90px_rgba(15,23,42,0.18)] ${themeConfig.heroClass}`}
        >
          <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
            <div>
              <div className={`text-[11px] uppercase tracking-[0.34em] ${themeConfig.eyebrowClass}`}>
                Al-Maidah Control System
              </div>
              <h1 className="mt-3 text-3xl font-semibold tracking-tight">
                Restaurant operations, finance, and reporting in one place
              </h1>
              <p className={`mt-3 max-w-3xl text-sm leading-7 ${isDayTheme ? "text-slate-600" : "text-slate-300"}`}>
                Logged in as {user.display_name}. Your visible tabs are controlled by your account access rules.
              </p>
            </div>

            <AppearanceControls
              user={user}
              onPreferenceChange={onPreferenceChange}
              onLogout={onLogout}
              preferenceSaving={preferenceSaving}
            />
          </div>
        </div>

        <div className="mt-6 flex flex-wrap gap-3">
          {availableTabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`rounded-full px-5 py-2.5 text-sm font-medium transition ${
                tab.key === activeTab
                  ? isDayTheme
                    ? "bg-sky-700 text-white shadow-[0_18px_36px_rgba(14,116,144,0.22)]"
                    : "bg-emerald-500 text-slate-950 shadow-[0_18px_36px_rgba(16,185,129,0.25)]"
                  : isDayTheme
                    ? "border border-slate-300 bg-white text-slate-700 hover:border-sky-400 hover:text-sky-700"
                    : "border border-slate-700 bg-slate-900 text-slate-200 hover:border-slate-500 hover:text-white"
              }`}
            >
              {tab.label}
            </button>
          ))}
          {canManageExternalOrders ? (
            <div className={`rounded-full px-4 py-2.5 text-sm font-semibold ${
              pendingExternalCount
                ? isDayTheme
                  ? "border border-amber-300 bg-amber-50 text-amber-900"
                  : "border border-amber-500/30 bg-amber-500/10 text-amber-100"
                : isDayTheme
                  ? "border border-slate-300 bg-white text-slate-600"
                  : "border border-slate-700 bg-slate-900 text-slate-400"
            }`}>
              Pending External: {pendingExternalCount}
            </div>
          ) : null}
        </div>

        <div className={`mt-6 rounded-[30px] p-6 shadow-[0_25px_70px_rgba(15,23,42,0.12)] ${
          isDayTheme
            ? "border border-slate-200 bg-white/92"
            : "border border-slate-800 bg-slate-900/90"
        }`}>
          {ActiveComponent ? (
            <ActiveComponent
              currentUser={user}
              externalRefreshKey={externalRefreshKey}
              onPreferenceChange={onPreferenceChange}
              preferenceSaving={preferenceSaving}
              onNavigate={handleNavigate}
              navigationIntent={navigationIntent}
              onNavigationHandled={handleNavigationHandled}
            />
          ) : (
            <div className={`rounded-[22px] border border-dashed px-5 py-12 text-center text-sm ${
              isDayTheme
                ? "border-slate-300 bg-slate-50 text-slate-500"
                : "border-slate-700 bg-slate-950/60 text-slate-400"
            }`}>
              No tabs are assigned to this account yet. Ask the admin to enable access.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}


export default function App() {
  const [authLoading, setAuthLoading] = useState(true);
  const [user, setUser] = useState(null);
  const [welcomeMessage, setWelcomeMessage] = useState("");
  const [showWelcome, setShowWelcome] = useState(false);
  const [preferenceSaving, setPreferenceSaving] = useState(false);

  useEffect(() => {
    const themeConfig = getThemeConfig(user?.theme_preference);
    const theme = themeConfig.value;
    const font = user?.font_preference || "MEDIUM";
    const root = document.documentElement;
    const body = document.body;

    root.style.fontSize = ROOT_FONT_SIZES[font] || ROOT_FONT_SIZES.MEDIUM;
    body.classList.remove(
      "system-theme-day",
      "system-theme-night",
      "system-theme-scheme-night",
      "system-theme-scheme-day",
      "system-theme-scheme-stone",
      "system-theme-scheme-charcoal"
    );
    body.classList.add(isLightThemePreference(theme) ? "system-theme-day" : "system-theme-night");
    body.classList.add(`system-theme-scheme-${theme.toLowerCase()}`);
    body.style.backgroundColor = themeConfig.bodyColor;
  }, [user?.theme_preference, user?.font_preference]);

  useEffect(() => {
    if (isDisplay) {
      setAuthLoading(false);
      return;
    }

    const token = getAuthToken();

    if (!token) {
      setAuthLoading(false);
      return;
    }

    let isMounted = true;

    api
      .get("auth/me/")
      .then((response) => {
        if (!isMounted) {
          return;
        }
        setUser(response.data);
      })
      .catch(() => {
        clearAuthToken();
        if (isMounted) {
          setUser(null);
        }
      })
      .finally(() => {
        if (isMounted) {
          setAuthLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, []);

  if (isDisplay) {
    return <CustomerDisplay />;
  }

  const handleAuthenticated = (authenticatedUser) => {
    const message =
      authenticatedUser.role === "ADMIN"
        ? "Welcome, Admin!"
        : `Welcome, ${authenticatedUser.display_name}!`;

    setUser(authenticatedUser);
    setWelcomeMessage(message);
    setShowWelcome(true);

    window.setTimeout(() => {
      setShowWelcome(false);
    }, 2300);
  };

  const handleLogout = async () => {
    try {
      await api.post("auth/logout/");
    } catch (_error) {
      // Token cleanup still happens locally.
    }

    clearAuthToken();
    setUser(null);
  };

  const handlePreferenceChange = async (updates) => {
    if (!user) {
      return;
    }

    const previousUser = user;
    setUser({ ...user, ...updates });

    try {
      setPreferenceSaving(true);
      const response = await api.patch("auth/me/", updates);
      setUser((currentUser) => ({
        ...currentUser,
        ...response.data,
      }));
    } catch (_error) {
      setUser(previousUser);
    } finally {
      setPreferenceSaving(false);
    }
  };

  if (authLoading) {
    return (
      <ScreenLoader
        eyebrow="System Boot"
        label="Loading System"
        description="Preparing your live restaurant control environment and restoring your last authenticated session."
      />
    );
  }

  return (
    <>
      {user ? (
        <AuthenticatedShell
          user={user}
          onLogout={handleLogout}
          onPreferenceChange={handlePreferenceChange}
          preferenceSaving={preferenceSaving}
        />
      ) : (
        <LoginScreen onAuthenticated={handleAuthenticated} />
      )}

      {showWelcome ? <WelcomeOverlay message={welcomeMessage} /> : null}
    </>
  );
}
