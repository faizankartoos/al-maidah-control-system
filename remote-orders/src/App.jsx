import { useEffect, useMemo, useState } from "react";

import LoginScreen from "../../control-panel/src/components/LoginScreen";
import CreateOrderTab from "../../control-panel/src/components/CreateOrderTab";
import ManageOrdersTab from "../../control-panel/src/components/ManageOrdersTab";
import api, { clearAuthToken, getAuthToken } from "../../control-panel/src/services/api";

const ROOT_FONT_SIZES = {
  SMALL: "15px",
  MEDIUM: "16px",
  BIG: "18px",
};

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
        <div className="welcome-screen__eyebrow">Remote Access Granted</div>
        <div className="welcome-screen__title">{message}</div>
        <div className="welcome-screen__subtitle">
          Entering the live remote order desk...
        </div>
      </div>
    </div>
  );
}

function RemoteShell({ user, onLogout }) {
  const [activeTab, setActiveTab] = useState("ORDERS");

  const availableTabs = useMemo(() => {
    const allowed = new Set(user?.allowed_tabs || []);
    return [
      allowed.has("ORDERS") ? { key: "ORDERS", label: "Orders" } : null,
      allowed.has("MANAGE_ORDERS") ? { key: "MANAGE_ORDERS", label: "Manage Orders" } : null,
    ].filter(Boolean);
  }, [user]);

  useEffect(() => {
    if (!availableTabs.some((tab) => tab.key === activeTab)) {
      setActiveTab(availableTabs[0]?.key || null);
    }
  }, [activeTab, availableTabs]);

  useEffect(() => {
    const theme = user?.theme_preference || "NIGHT";
    const font = user?.font_preference || "MEDIUM";
    const root = document.documentElement;
    const body = document.body;

    root.style.fontSize = ROOT_FONT_SIZES[font] || ROOT_FONT_SIZES.MEDIUM;
    body.classList.remove("system-theme-day", "system-theme-night");
    body.classList.add(`system-theme-${theme.toLowerCase()}`);
    body.style.backgroundColor = theme === "DAY" ? "#eff6ff" : "#020617";
  }, [user?.theme_preference, user?.font_preference]);

  return (
    <div className="min-h-screen overflow-x-hidden bg-slate-950 text-white">
      <div className="mx-auto flex min-h-screen w-full max-w-6xl flex-col px-4 py-5 sm:px-6">
        <div className="rounded-[30px] border border-slate-800 bg-[radial-gradient(circle_at_top_left,_rgba(16,185,129,0.18),_transparent_26%),linear-gradient(135deg,_#020617_0%,_#0f172a_52%,_#111827_100%)] px-5 py-5 shadow-[0_24px_60px_rgba(15,23,42,0.32)]">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <div className="text-[11px] uppercase tracking-[0.34em] text-emerald-300">
                Al-Maidah Remote Desk
              </div>
              <h1 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">
                Remote Orders & Manage Orders
              </h1>
              <p className="mt-2 text-sm leading-6 text-slate-300">
                Logged in as {user.display_name}. This app is optimized for mobile-friendly remote order creation and live order follow-up.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <div className="rounded-full border border-slate-700 bg-slate-900/70 px-4 py-2 text-sm text-slate-200">
                {user.role === "ADMIN" ? "Admin Access" : `${user.display_name} • Staff`}
              </div>
              <button
                onClick={onLogout}
                className="rounded-full border border-rose-500/30 bg-rose-500/10 px-4 py-2 text-sm font-semibold text-rose-200 transition hover:bg-rose-500/20"
              >
                Logout
              </button>
            </div>
          </div>
        </div>

        <div className="mt-5 flex flex-wrap gap-3">
          {availableTabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`rounded-full px-5 py-2.5 text-sm font-medium transition ${
                tab.key === activeTab
                  ? "bg-emerald-500 text-slate-950 shadow-[0_18px_36px_rgba(16,185,129,0.25)]"
                  : "border border-slate-700 bg-slate-900 text-slate-200 hover:border-slate-500 hover:text-white"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="mt-5 flex-1 rounded-[30px] border border-slate-800 bg-slate-900/90 p-4 shadow-[0_25px_70px_rgba(15,23,42,0.12)] sm:p-6">
          {activeTab === "ORDERS" ? <CreateOrderTab currentUser={user} externalMode /> : null}
          {activeTab === "MANAGE_ORDERS" ? (
            <ManageOrdersTab currentUser={user} compactMode showExternalQueue={false} allowExternalDecisions={false} />
          ) : null}
          {!activeTab ? (
            <div className="rounded-[22px] border border-dashed border-slate-700 bg-slate-950/60 px-5 py-12 text-center text-sm text-slate-400">
              No remote tabs are assigned to this account yet.
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export default function RemoteOrdersApp() {
  const [authLoading, setAuthLoading] = useState(true);
  const [user, setUser] = useState(null);
  const [showWelcome, setShowWelcome] = useState(false);
  const [welcomeMessage, setWelcomeMessage] = useState("");

  useEffect(() => {
    const bootstrap = async () => {
      const token = getAuthToken();

      if (!token) {
        setAuthLoading(false);
        return;
      }

      try {
        const response = await api.get("auth/me/");
        setUser(response.data);
      } catch {
        clearAuthToken();
        setUser(null);
      } finally {
        setAuthLoading(false);
      }
    };

    bootstrap();
  }, []);

  const handleAuthenticated = (nextUser) => {
    setUser(nextUser);
    setWelcomeMessage(nextUser.role === "ADMIN" ? "Welcome, Admin!" : `Welcome, ${nextUser.display_name}!`);
    setShowWelcome(true);
    window.setTimeout(() => setShowWelcome(false), 2400);
  };

  const handleLogout = () => {
    clearAuthToken();
    setUser(null);
  };

  if (authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 text-slate-300">
        Loading remote desk...
      </div>
    );
  }

  if (!user) {
    return <LoginScreen onAuthenticated={handleAuthenticated} />;
  }

  return (
    <>
      {showWelcome ? <WelcomeOverlay message={welcomeMessage} /> : null}
      <RemoteShell user={user} onLogout={handleLogout} />
    </>
  );
}
