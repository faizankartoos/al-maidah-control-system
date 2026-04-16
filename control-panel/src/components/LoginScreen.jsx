import { useState } from "react";

import api, { setAuthToken } from "../services/api";
import { InlineButtonContent } from "./SystemLoader";


function RestaurantMark() {
  return (
    <div className="relative mx-auto flex h-28 w-28 items-center justify-center rounded-[32px] border border-amber-300/30 bg-slate-950/80 shadow-[0_20px_60px_rgba(15,23,42,0.55)] login-logo-float">
      <div className="absolute inset-0 rounded-[32px] bg-[radial-gradient(circle_at_top,_rgba(251,191,36,0.16),_transparent_55%)]" />
      <svg viewBox="0 0 120 120" className="relative h-20 w-20 text-amber-300">
        <path
          d="M25 68h70l-4 18H29l-4-18Zm11-7c0-15 10-28 24-32v-5h10v5c14 4 24 17 24 32H36Z"
          fill="currentColor"
          opacity="0.95"
        />
        <path
          d="M40 93h40"
          stroke="currentColor"
          strokeWidth="5"
          strokeLinecap="round"
        />
        <circle cx="60" cy="20" r="8" fill="currentColor" />
      </svg>
    </div>
  );
}

function getErrorMessage(error, fallback) {
  const data = error?.response?.data;

  if (!data) {
    return fallback;
  }

  if (typeof data === "string") {
    return data;
  }

  if (data.error) {
    return data.error;
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

export default function LoginScreen({ onAuthenticated }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (event) => {
    event.preventDefault();

    try {
      setLoading(true);
      setError("");

      const response = await api.post("auth/login/", {
        username,
        password,
      });

      setAuthToken(response.data.token);
      onAuthenticated(response.data.user);
    } catch (err) {
      setError(getErrorMessage(err, "Unable to sign in right now."));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative min-h-screen overflow-x-hidden overflow-y-hidden bg-slate-950 px-4 py-8 text-white sm:px-6 sm:py-10">
      <div className="login-aurora absolute inset-0" />
      <div className="pointer-events-none absolute -left-24 top-16 h-72 w-72 rounded-full bg-emerald-400/10 blur-3xl" />
      <div className="pointer-events-none absolute bottom-0 right-0 h-80 w-80 rounded-full bg-cyan-400/10 blur-3xl" />

      <div className="relative mx-auto flex min-h-[calc(100vh-5rem)] max-w-3xl items-center justify-center">
        <div className="w-full max-w-xl text-center">
          <RestaurantMark />

          <div className="mt-8">
            <h1 className="text-4xl font-semibold tracking-tight text-white sm:text-5xl lg:text-6xl">
              Al-Maidah System Access
            </h1>
          </div>

          <div className="relative mt-10">
            <div className="rounded-[34px] border border-slate-800 bg-slate-950/90 p-7 text-left shadow-[0_35px_90px_rgba(15,23,42,0.55)] backdrop-blur-xl">
              <div className="text-center text-[11px] uppercase tracking-[0.34em] text-emerald-300">
                Login
              </div>

              <form className="mt-6 space-y-5" onSubmit={handleSubmit}>
                <div>
                  <label className="mb-2 block text-sm text-slate-300">Username</label>
                  <input
                    type="text"
                    value={username}
                    onChange={(event) => setUsername(event.target.value)}
                    className="w-full rounded-[22px] border border-slate-700 bg-slate-900 px-4 py-4 text-white outline-none transition focus:border-emerald-500"
                    placeholder="Enter username"
                    autoComplete="username"
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm text-slate-300">Password</label>
                  <input
                    type="password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    className="w-full rounded-[22px] border border-slate-700 bg-slate-900 px-4 py-4 text-white outline-none transition focus:border-emerald-500"
                    placeholder="Enter password"
                    autoComplete="current-password"
                  />
                </div>

                {error ? (
                  <div className="rounded-[22px] border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
                    {error}
                  </div>
                ) : null}

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full rounded-[24px] bg-[linear-gradient(135deg,_#10b981,_#14b8a6)] px-4 py-4 text-base font-semibold text-slate-950 shadow-[0_20px_40px_rgba(16,185,129,0.28)] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-70"
                >
                  <InlineButtonContent busy={loading} busyLabel="Authenticating...">
                    Enter Control Panel
                  </InlineButtonContent>
                </button>
              </form>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
