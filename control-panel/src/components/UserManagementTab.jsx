import { useEffect, useMemo, useState } from "react";

import api from "../services/api";
import { InlineButtonContent, PanelLoader } from "./SystemLoader";

const assignableTabs = [
  { key: "MENU", label: "Menu" },
  { key: "ORDERS", label: "Orders" },
  { key: "MANAGE_ORDERS", label: "Manage Orders" },
  { key: "INVENTORY", label: "Inventory" },
  { key: "LEDGER", label: "Ledger" },
  { key: "EXPENSES", label: "Expenses" },
  { key: "REPORTS", label: "Reports" },
  { key: "DATA", label: "Data" },
];

const TAB_LABELS = assignableTabs.reduce((acc, tab) => {
  acc[tab.key] = tab.label;
  return acc;
}, { USER_MANAGEMENT: "Access" });

const defaultSpecialAccessOptions = [
  { value: "COLLECT_PAYMENTS", label: "Collect Payments" },
];

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

function UserModal({ user, onClose, onSave, saving, tabOptions, specialAccessOptions }) {
  const [form, setForm] = useState({
    username: user?.username || "",
    display_name: user?.display_name || "",
    password: "",
    role: user?.role || "STAFF",
    allowed_tabs: user?.allowed_tabs?.filter((tab) => tab !== "USER_MANAGEMENT") || [],
    special_access: user?.special_access || [],
    is_active: user?.is_active ?? true,
  });

  const toggleTab = (tabKey) => {
    setForm((current) => {
      if (current.allowed_tabs.includes(tabKey)) {
        return {
          ...current,
          allowed_tabs: current.allowed_tabs.filter((tab) => tab !== tabKey),
        };
      }

      return {
        ...current,
        allowed_tabs: [...current.allowed_tabs, tabKey],
      };
    });
  };

  const toggleSpecialAccess = (permission) => {
    setForm((current) => {
      if (current.special_access.includes(permission)) {
        return {
          ...current,
          special_access: current.special_access.filter((value) => value !== permission),
        };
      }

      return {
        ...current,
        special_access: [...current.special_access, permission],
      };
    });
  };

  const handleSubmit = async () => {
    const payload = {
      username: form.username,
      display_name: form.display_name,
      role: form.role,
      is_active: form.is_active,
      allowed_tabs: form.role === "ADMIN" ? ["MENU", "ORDERS", "MANAGE_ORDERS", "INVENTORY", "LEDGER", "EXPENSES", "REPORTS", "DATA", "USER_MANAGEMENT"] : form.allowed_tabs,
      special_access: form.role === "ADMIN" ? ["COLLECT_PAYMENTS"] : form.special_access,
    };

    if (form.password) {
      payload.password = form.password;
    }

    await onSave(payload);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/85 px-4 backdrop-blur-sm">
      <div className="w-full max-w-3xl rounded-[32px] border border-slate-800 bg-slate-950 p-6 shadow-[0_35px_90px_rgba(15,23,42,0.55)]">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="text-[11px] uppercase tracking-[0.34em] text-emerald-300">
              Access Manager
            </div>
            <h3 className="mt-3 text-2xl font-semibold">
              {user ? `Edit ${user.display_name}` : "Create New Account"}
            </h3>
            <p className="mt-2 text-sm leading-6 text-slate-400">
              Admin accounts always get full access. Staff accounts can be locked to the exact tabs you want.
            </p>
          </div>

          <button
            onClick={onClose}
            className="rounded-2xl border border-slate-800 px-4 py-2 text-sm text-slate-200 transition hover:border-slate-600 hover:text-white"
          >
            Close
          </button>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <div>
            <label className="mb-2 block text-sm text-slate-300">Username</label>
            <input
              type="text"
              value={form.username}
              onChange={(event) => setForm((current) => ({ ...current, username: event.target.value }))}
              className="w-full rounded-[22px] border border-slate-700 bg-slate-900 px-4 py-3 text-white outline-none transition focus:border-emerald-500"
              placeholder="staff.cashier"
            />
          </div>

          <div>
            <label className="mb-2 block text-sm text-slate-300">Display Name</label>
            <input
              type="text"
              value={form.display_name}
              onChange={(event) => setForm((current) => ({ ...current, display_name: event.target.value }))}
              className="w-full rounded-[22px] border border-slate-700 bg-slate-900 px-4 py-3 text-white outline-none transition focus:border-emerald-500"
              placeholder="Adnan / Cashier 1 / Manager"
            />
          </div>

          <div>
            <label className="mb-2 block text-sm text-slate-300">
              {user ? "New Password (optional)" : "Password"}
            </label>
            <input
              type="password"
              value={form.password}
              onChange={(event) => setForm((current) => ({ ...current, password: event.target.value }))}
              className="w-full rounded-[22px] border border-slate-700 bg-slate-900 px-4 py-3 text-white outline-none transition focus:border-emerald-500"
              placeholder={user ? "Leave blank to keep current password" : "Set password"}
            />
          </div>

          <div>
            <label className="mb-2 block text-sm text-slate-300">Role</label>
            <select
              value={form.role}
              onChange={(event) => setForm((current) => ({ ...current, role: event.target.value }))}
              className="w-full rounded-[22px] border border-slate-700 bg-slate-900 px-4 py-3 text-white outline-none transition focus:border-emerald-500"
            >
              <option value="ADMIN">Admin</option>
              <option value="STAFF">Staff</option>
            </select>
          </div>
        </div>

        <div className="mt-4 rounded-[22px] border border-slate-800 bg-slate-900/70 p-4">
          <label className="flex items-center justify-between gap-4">
            <div>
              <div className="text-sm font-medium text-white">Account Status</div>
              <div className="mt-1 text-sm text-slate-400">
                Inactive accounts cannot log in until re-enabled.
              </div>
            </div>
            <button
              type="button"
              onClick={() => setForm((current) => ({ ...current, is_active: !current.is_active }))}
              className={`rounded-full px-4 py-2 text-xs font-semibold uppercase tracking-[0.22em] ${
                form.is_active ? "bg-emerald-500/15 text-emerald-200" : "bg-rose-500/15 text-rose-200"
              }`}
            >
              {form.is_active ? "Active" : "Inactive"}
            </button>
          </label>
        </div>

        <div className="mt-5 rounded-[24px] border border-slate-800 bg-slate-900/60 p-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="text-sm font-medium text-white">Tab Access</div>
              <div className="mt-1 text-sm text-slate-400">
                {form.role === "ADMIN"
                  ? "Admin gets all tabs automatically."
                  : "Choose exactly which parts of the control panel this staff account can access."}
              </div>
            </div>
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {tabOptions.map((tab) => {
              const selected = form.role === "ADMIN" || form.allowed_tabs.includes(tab.value);

              return (
                <button
                  key={tab.value}
                  type="button"
                  disabled={form.role === "ADMIN"}
                  onClick={() => toggleTab(tab.value)}
                  className={`rounded-[20px] border px-4 py-3 text-left text-sm transition ${
                    selected
                      ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-100"
                      : "border-slate-800 bg-slate-950 text-slate-300 hover:border-slate-600"
                  } ${form.role === "ADMIN" ? "cursor-default" : ""}`}
                >
                  <div className="font-medium">{tab.label}</div>
                  <div className="mt-1 text-xs uppercase tracking-[0.22em] text-slate-500">
                    {selected ? "Granted" : "Locked"}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        <div className="mt-5 rounded-[24px] border border-slate-800 bg-slate-900/60 p-4">
          <div>
            <div className="text-sm font-medium text-white">Sensitive Actions</div>
            <div className="mt-1 text-sm text-slate-400">
              Keep finance-related actions separate even when staff can still open Manage Orders.
            </div>
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {specialAccessOptions.map((permission) => {
              const selected = form.role === "ADMIN" || form.special_access.includes(permission.value);

              return (
                <button
                  key={permission.value}
                  type="button"
                  disabled={form.role === "ADMIN"}
                  onClick={() => toggleSpecialAccess(permission.value)}
                  className={`rounded-[20px] border px-4 py-4 text-left text-sm transition ${
                    selected
                      ? "border-amber-500/30 bg-amber-500/10 text-amber-100"
                      : "border-slate-800 bg-slate-950 text-slate-300 hover:border-slate-600"
                  } ${form.role === "ADMIN" ? "cursor-default" : ""}`}
                >
                  <div className="font-medium">{permission.label}</div>
                  <div className="mt-1 text-xs uppercase tracking-[0.22em] text-slate-500">
                    {selected ? "Granted" : "Locked"}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
          <button
            onClick={handleSubmit}
            disabled={saving}
            className="flex-1 rounded-[22px] bg-emerald-500 px-4 py-3 font-semibold text-slate-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:bg-emerald-500/60"
          >
            <InlineButtonContent
              busy={saving}
              busyLabel="Saving..."
            >
              {user ? "Save Changes" : "Create Account"}
            </InlineButtonContent>
          </button>
          <button
            onClick={onClose}
            className="rounded-[22px] border border-slate-700 px-4 py-3 font-semibold text-slate-200 transition hover:border-slate-500 hover:text-white"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

export default function UserManagementTab({ currentUser }) {
  const [users, setUsers] = useState([]);
  const [tabOptions, setTabOptions] = useState(assignableTabs.map((tab) => ({ value: tab.key, label: tab.label })));
  const [specialAccessOptions, setSpecialAccessOptions] = useState(defaultSpecialAccessOptions);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [editingUser, setEditingUser] = useState(null);

  const loadUsers = async () => {
    try {
      setLoading(true);
      setError("");

      const response = await api.get("auth/users/");
      setUsers(response.data.users || []);
      setTabOptions(response.data.tab_options || tabOptions);
      setSpecialAccessOptions(response.data.special_access_options || defaultSpecialAccessOptions);
    } catch (err) {
      setError(getErrorMessage(err, "Unable to load system users."));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadUsers();
  }, []);

  const summary = useMemo(() => {
    const activeUsers = users.filter((user) => user.is_active).length;
    const staffUsers = users.filter((user) => user.role === "STAFF").length;
    const adminUsers = users.filter((user) => user.role === "ADMIN").length;

    return {
      total: users.length,
      active: activeUsers,
      staff: staffUsers,
      admin: adminUsers,
    };
  }, [users]);

  const renderedTabOptions = useMemo(
    () => (tabOptions || []).filter((tab) => tab.value !== "USER_MANAGEMENT"),
    [tabOptions],
  );

  const handleDelete = async (user) => {
    const confirmed = window.confirm(`Delete account "${user.display_name}"? This cannot be undone.`);

    if (!confirmed) {
      return;
    }

    try {
      setError("");
      setSuccess("");
      await api.delete(`auth/users/${user.id}/`);
      setSuccess("Account deleted successfully.");
      await loadUsers();
    } catch (err) {
      setError(getErrorMessage(err, "Unable to delete this account."));
    }
  };

  const handleSave = async (payload) => {
    try {
      setSaving(true);
      setError("");
      setSuccess("");

      if (editingUser?.id) {
        await api.patch(`auth/users/${editingUser.id}/`, payload);
        setSuccess("Account updated successfully.");
      } else {
        await api.post("auth/users/", payload);
        setSuccess("Account created successfully.");
      }

      setEditingUser(null);
      await loadUsers();
    } catch (err) {
      setError(getErrorMessage(err, "Unable to save this account."));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6 text-white">
      <div className="rounded-[32px] border border-slate-800 bg-[radial-gradient(circle_at_top_left,_rgba(16,185,129,0.18),_transparent_30%),linear-gradient(135deg,_#020617_0%,_#0f172a_60%,_#111827_100%)] p-6">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
          <div className="max-w-3xl">
            <div className="text-[11px] uppercase tracking-[0.34em] text-emerald-300">
              Access Control
            </div>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight">Manage staff logins and tab permissions</h2>
            <p className="mt-3 max-w-2xl text-sm leading-7 text-slate-300">
              Create accounts, decide who can enter which tab, and control the active/inactive state of every login from one place.
            </p>
          </div>

          <button
            onClick={() => {
              setSuccess("");
              setError("");
              setEditingUser({});
            }}
            className="rounded-[22px] bg-emerald-500 px-5 py-3 font-semibold text-slate-950 transition hover:bg-emerald-400"
          >
            Create New Login
          </button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-[24px] border border-slate-800 bg-slate-900/70 p-4">
          <div className="text-[11px] uppercase tracking-[0.28em] text-slate-400">Total Accounts</div>
          <div className="mt-3 text-3xl font-semibold">{summary.total}</div>
        </div>
        <div className="rounded-[24px] border border-slate-800 bg-slate-900/70 p-4">
          <div className="text-[11px] uppercase tracking-[0.28em] text-slate-400">Active Accounts</div>
          <div className="mt-3 text-3xl font-semibold">{summary.active}</div>
        </div>
        <div className="rounded-[24px] border border-slate-800 bg-slate-900/70 p-4">
          <div className="text-[11px] uppercase tracking-[0.28em] text-slate-400">Admin Accounts</div>
          <div className="mt-3 text-3xl font-semibold">{summary.admin}</div>
        </div>
        <div className="rounded-[24px] border border-slate-800 bg-slate-900/70 p-4">
          <div className="text-[11px] uppercase tracking-[0.28em] text-slate-400">Staff Accounts</div>
          <div className="mt-3 text-3xl font-semibold">{summary.staff}</div>
        </div>
      </div>

      {error ? (
        <div className="rounded-[22px] border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
          {error}
        </div>
      ) : null}

      {success ? (
        <div className="rounded-[22px] border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
          {success}
        </div>
      ) : null}

      <div className="rounded-[30px] border border-slate-800 bg-slate-950/90 p-5">
        <div className="flex items-center justify-between gap-4">
          <div>
            <div className="text-[11px] uppercase tracking-[0.34em] text-cyan-300">Current Access Map</div>
            <h3 className="mt-2 text-xl font-semibold">Accounts Directory</h3>
          </div>
        </div>

        {loading ? (
          <PanelLoader
            className="mt-5"
            eyebrow="Access"
            label="Loading user accounts..."
            description="Pulling current staff access, roles, and permissions from the live system."
          />
        ) : users.length ? (
          <div className="mt-5 grid gap-4">
            {users.map((user) => (
              <div
                key={user.id}
                className="rounded-[24px] border border-slate-800 bg-slate-900/70 p-4"
              >
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-3">
                      <h4 className="text-lg font-semibold text-white">{user.display_name}</h4>
                      <span className={`rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] ${
                        user.role === "ADMIN" ? "bg-amber-500/15 text-amber-200" : "bg-cyan-500/15 text-cyan-200"
                      }`}>
                        {user.role}
                      </span>
                      <span className={`rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] ${
                        user.is_active ? "bg-emerald-500/15 text-emerald-200" : "bg-rose-500/15 text-rose-200"
                      }`}>
                        {user.is_active ? "Active" : "Inactive"}
                      </span>
                    </div>
                    <div className="mt-2 text-sm text-slate-400">@{user.username}</div>

                    <div className="mt-4 flex flex-wrap gap-2">
                      {(user.allowed_tabs || []).map((tab) => (
                        <span
                          key={`${user.id}-${tab}`}
                          className="rounded-full border border-slate-700 bg-slate-950 px-3 py-1 text-xs uppercase tracking-[0.2em] text-slate-300"
                        >
                          {TAB_LABELS[tab] || tab}
                        </span>
                      ))}
                      {(user.special_access || []).map((permission) => (
                        <span
                          key={`${user.id}-${permission}`}
                          className="rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-xs uppercase tracking-[0.2em] text-amber-200"
                        >
                          {specialAccessOptions.find((option) => option.value === permission)?.label || permission}
                        </span>
                      ))}
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-3">
                    <button
                      onClick={() => {
                        setSuccess("");
                        setError("");
                        setEditingUser(user);
                      }}
                      className="rounded-[20px] border border-slate-700 px-4 py-2 text-sm font-medium text-slate-200 transition hover:border-slate-500 hover:text-white"
                    >
                      Edit Access
                    </button>

                    {currentUser?.id !== user.id ? (
                      <button
                        onClick={() => handleDelete(user)}
                        className="rounded-[20px] border border-rose-500/30 bg-rose-500/10 px-4 py-2 text-sm font-medium text-rose-200 transition hover:border-rose-400/50 hover:bg-rose-500/20"
                      >
                        Delete Account
                      </button>
                    ) : null}
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="mt-5 rounded-[22px] border border-dashed border-slate-700 bg-slate-900/60 px-5 py-10 text-center text-sm text-slate-400">
            No users found yet. Create the first staff login from the button above.
          </div>
        )}
      </div>

      {editingUser !== null ? (
        <UserModal
          user={editingUser.id ? editingUser : null}
          onClose={() => setEditingUser(null)}
          onSave={handleSave}
          saving={saving}
          tabOptions={renderedTabOptions}
          specialAccessOptions={specialAccessOptions}
        />
      ) : null}
    </div>
  );
}
