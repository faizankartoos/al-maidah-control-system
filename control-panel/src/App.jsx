import { useEffect, useMemo, useState } from "react";

import LoginScreen from "./components/LoginScreen";
import CustomerDisplay from "./pages/CustomerDisplay";
import api, { clearAuthToken, getAuthToken } from "./services/api";
import { TAB_DEFINITIONS } from "./constants/tabConfig";


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


function AppearanceControls({ user, onPreferenceChange, preferenceSaving, onLogout }) {
  const isDayTheme = user?.theme_preference === "DAY";

  return (
    <div className="flex flex-wrap items-center justify-end gap-3">
      <div className="rounded-[24px] border border-slate-700/70 bg-slate-950/50 px-4 py-3 backdrop-blur-sm">
        <div className="text-[10px] font-semibold uppercase tracking-[0.28em] text-slate-400">
          Theme
        </div>
        <button
          type="button"
          onClick={() =>
            onPreferenceChange({
              theme_preference: isDayTheme ? "NIGHT" : "DAY",
            })
          }
          className="mt-2 flex items-center gap-3"
        >
          <span className={`text-xs font-semibold ${isDayTheme ? "text-slate-500" : "text-white"}`}>
            Night
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
            Day
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
          Saving Preferences
        </div>
      ) : null}
    </div>
  );
}


function AuthenticatedShell({ user, onLogout, onPreferenceChange, preferenceSaving }) {
  const isDayTheme = user?.theme_preference === "DAY";
  const availableTabs = useMemo(() => {
    const allowed = new Set(user?.allowed_tabs || []);
    return TAB_DEFINITIONS.filter((tab) => allowed.has(tab.key));
  }, [user]);

  const [activeTab, setActiveTab] = useState(availableTabs[0]?.key || null);

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

  const activeTabDefinition = availableTabs.find((tab) => tab.key === activeTab) || availableTabs[0];
  const ActiveComponent = activeTabDefinition?.component || null;

  return (
    <div
      className={`system-shell min-h-screen transition-colors duration-300 ${
        isDayTheme
          ? "system-theme-day bg-[radial-gradient(circle_at_top_left,_rgba(14,116,144,0.12),_transparent_28%),radial-gradient(circle_at_top_right,_rgba(245,158,11,0.12),_transparent_26%),linear-gradient(135deg,_#eff6ff_0%,_#f8fafc_48%,_#e2e8f0_100%)] text-slate-950"
          : "system-theme-night bg-slate-950 text-white"
      }`}
    >
      <div className="mx-auto max-w-[95vw] p-6">
        <div
          className={`overflow-hidden rounded-[32px] px-6 py-6 shadow-[0_35px_90px_rgba(15,23,42,0.18)] ${
            isDayTheme
              ? "border border-slate-200 bg-[radial-gradient(circle_at_top_left,_rgba(14,116,144,0.12),_transparent_24%),radial-gradient(circle_at_top_right,_rgba(245,158,11,0.14),_transparent_22%),linear-gradient(135deg,_#ffffff_0%,_#eff6ff_48%,_#e2e8f0_100%)]"
              : "border border-slate-800 bg-[radial-gradient(circle_at_top_left,_rgba(16,185,129,0.18),_transparent_24%),radial-gradient(circle_at_top_right,_rgba(56,189,248,0.12),_transparent_22%),linear-gradient(135deg,_#020617_0%,_#0f172a_48%,_#111827_100%)]"
          }`}
        >
          <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
            <div>
              <div className={`text-[11px] uppercase tracking-[0.34em] ${isDayTheme ? "text-sky-700" : "text-emerald-300"}`}>
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
        </div>

        <div className={`mt-6 rounded-[30px] p-6 shadow-[0_25px_70px_rgba(15,23,42,0.12)] ${
          isDayTheme
            ? "border border-slate-200 bg-white/92"
            : "border border-slate-800 bg-slate-900/90"
        }`}>
          {ActiveComponent ? (
            <ActiveComponent currentUser={user} />
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
    const theme = user?.theme_preference || "NIGHT";
    const font = user?.font_preference || "MEDIUM";
    const root = document.documentElement;
    const body = document.body;

    root.style.fontSize = ROOT_FONT_SIZES[font] || ROOT_FONT_SIZES.MEDIUM;
    body.classList.remove("system-theme-day", "system-theme-night");
    body.classList.add(`system-theme-${theme.toLowerCase()}`);
    body.style.backgroundColor = theme === "DAY" ? "#eff6ff" : "#020617";
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
      <div className="flex min-h-screen items-center justify-center bg-slate-950 text-white">
        <div className="rounded-[28px] border border-slate-800 bg-slate-900/80 px-8 py-6 text-sm uppercase tracking-[0.34em] text-emerald-300 shadow-[0_25px_70px_rgba(15,23,42,0.35)]">
          Loading System
        </div>
      </div>
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
