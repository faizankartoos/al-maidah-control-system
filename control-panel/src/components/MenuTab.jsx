import { useEffect, useMemo, useState } from "react";
import api from "../services/api";
import { PanelLoader } from "./SystemLoader";

function emptyForm() {
  return {
    name: "",
    category: "",
    price: "",
    is_available: true,
  };
}

function formatMoney(value) {
  return Number(value || 0).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatDateTime(value) {
  if (!value) return "-";
  return new Date(value).toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function extractError(err, fallback) {
  const data = err?.response?.data;

  if (!data) return fallback;
  if (typeof data.error === "string") return data.error;
  if (typeof data.detail === "string") return data.detail;

  const firstList = Object.values(data).find((value) => Array.isArray(value) && value.length);
  if (firstList) return firstList[0];

  return fallback;
}

export default function MenuTab({ currentUser }) {
  const isDayTheme = currentUser?.theme_preference === "DAY";
  const [menuItems, setMenuItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyAction, setBusyAction] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("ALL");
  const [availabilityFilter, setAvailabilityFilter] = useState("ALL");
  const [formData, setFormData] = useState(emptyForm);
  const [editingItem, setEditingItem] = useState(null);
  const [editFormData, setEditFormData] = useState(emptyForm);

  useEffect(() => {
    fetchMenu();
  }, []);

  const categories = useMemo(
    () => [...new Set(menuItems.map((item) => item.category))],
    [menuItems]
  );

  const filteredItems = useMemo(() => {
    const searchValue = search.trim().toLowerCase();

    return menuItems.filter((item) => {
      const matchesSearch =
        !searchValue ||
        item.name.toLowerCase().includes(searchValue) ||
        item.category.toLowerCase().includes(searchValue);

      const matchesCategory =
        categoryFilter === "ALL" || item.category === categoryFilter;

      const matchesAvailability =
        availabilityFilter === "ALL" ||
        (availabilityFilter === "AVAILABLE" && item.is_available) ||
        (availabilityFilter === "UNAVAILABLE" && !item.is_available);

      return matchesSearch && matchesCategory && matchesAvailability;
    });
  }, [menuItems, search, categoryFilter, availabilityFilter]);

  const summary = useMemo(() => {
    const availableItems = menuItems.filter((item) => item.is_available).length;
    const unavailableItems = menuItems.length - availableItems;
    const averagePrice =
      menuItems.length > 0
        ? menuItems.reduce((sum, item) => sum + Number(item.price || 0), 0) / menuItems.length
        : 0;

    return {
      total: menuItems.length,
      available: availableItems,
      unavailable: unavailableItems,
      categories: categories.length,
      averagePrice,
    };
  }, [menuItems, categories.length]);

  const resetMessages = () => {
    setError("");
    setSuccess("");
  };

  const resetForm = () => {
    setFormData(emptyForm());
  };

  const fetchMenu = async () => {
    try {
      setLoading(true);
      const response = await api.get("/menu/");
      setMenuItems(response.data);
    } catch {
      setError("Failed to fetch menu items.");
    } finally {
      setLoading(false);
    }
  };

  const handleFieldChange = (name, value) => {
    setFormData((current) => ({
      ...current,
      [name]: value,
    }));
  };

  const handleSubmit = async () => {
    resetMessages();

    if (!formData.name.trim() || !formData.category.trim() || !formData.price) {
      setError("Enter item name, category, and price.");
      return;
    }

    const payload = {
      ...formData,
      name: formData.name.trim(),
      category: formData.category.trim(),
      price: formData.price,
    };

    try {
      setBusyAction("create-item");
      await api.post("/menu/", payload);

      await fetchMenu();
      setSuccess("Menu item created.");
      resetForm();
    } catch (err) {
      setError(extractError(err, "Failed to create menu item."));
    } finally {
      setBusyAction("");
    }
  };

  const handleEdit = (item) => {
    setEditingItem(item);
    setEditFormData({
      name: item.name,
      category: item.category,
      price: item.price,
      is_available: item.is_available,
    });
    resetMessages();
  };

  const closeEditModal = () => {
    setEditingItem(null);
    setEditFormData(emptyForm());
  };

  const handleSaveEdit = async () => {
    if (!editingItem) {
      return;
    }

    resetMessages();

    if (!editFormData.name.trim() || !editFormData.category.trim() || !editFormData.price) {
      setError("Enter item name, category, and price.");
      return;
    }

    try {
      setBusyAction("save-edit");
      await api.patch(`/menu/${editingItem.id}/`, {
        ...editFormData,
        name: editFormData.name.trim(),
        category: editFormData.category.trim(),
        price: editFormData.price,
      });
      await fetchMenu();
      closeEditModal();
      setSuccess("Menu item updated.");
    } catch (err) {
      setError(extractError(err, "Failed to update menu item."));
    } finally {
      setBusyAction("");
    }
  };

  const handleToggleAvailability = async (item) => {
    resetMessages();

    try {
      setBusyAction(`toggle-${item.id}`);
      await api.patch(`/menu/${item.id}/`, {
        is_available: !item.is_available,
      });
      await fetchMenu();
      setSuccess(
        `${item.name} is now ${item.is_available ? "unavailable" : "available"}.`
      );
    } catch (err) {
      setError(extractError(err, "Failed to update availability."));
    } finally {
      setBusyAction("");
    }
  };

  const handleDelete = async (item) => {
    resetMessages();

    if (!window.confirm(`Delete "${item.name}" from the menu?`)) {
      return;
    }

    try {
      setBusyAction(`delete-${item.id}`);
      await api.delete(`/menu/${item.id}/`);
      await fetchMenu();
      if (editingItem?.id === item.id) {
        closeEditModal();
      }
      setSuccess(`${item.name} deleted.`);
    } catch (err) {
      setError(extractError(err, "Failed to delete menu item."));
    } finally {
      setBusyAction("");
    }
  };

  if (loading) {
    return (
      <PanelLoader
        eyebrow="Menu"
        label="Loading menu dashboard..."
        description="Bringing in categories, pricing, and availability so the menu stays ready for staff."
        className={isDayTheme ? "text-slate-700" : ""}
      />
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
        <div>
          <h2 className={`text-2xl font-semibold ${isDayTheme ? "text-slate-900" : "text-white"}`}>Menu Management</h2>
          <p className={`text-sm ${isDayTheme ? "text-slate-600" : "text-gray-400"}`}>
            Keep the menu clean for staff: create items, edit prices, and control availability quickly.
          </p>
        </div>
        <div className={`text-sm ${isDayTheme ? "text-slate-600" : "text-gray-400"}`}>
          Showing <span className={`font-semibold ${isDayTheme ? "text-slate-900" : "text-white"}`}>{filteredItems.length}</span> of{" "}
          <span className={`font-semibold ${isDayTheme ? "text-slate-900" : "text-white"}`}>{menuItems.length}</span> items
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <SummaryCard label="Total Items" value={summary.total} accent="blue" isDayTheme={isDayTheme} />
        <SummaryCard label="Available" value={summary.available} accent="emerald" isDayTheme={isDayTheme} />
        <SummaryCard label="Unavailable" value={summary.unavailable} accent="rose" isDayTheme={isDayTheme} />
        <SummaryCard label="Categories" value={summary.categories} accent="amber" isDayTheme={isDayTheme} />
        <SummaryCard
          label="Average Price"
          value={`Rs ${formatMoney(summary.averagePrice)}`}
          accent="slate"
          isDayTheme={isDayTheme}
        />
      </div>

      {error && <Alert tone="error">{error}</Alert>}
      {success && <Alert tone="success">{success}</Alert>}

      <div className="grid gap-6">
        <Section
          id="menu-form-card"
          title="Create Menu Item"
          description="Add new menu items here. Editing now opens in a direct popup from the list."
          isDayTheme={isDayTheme}
        >
          <div className="grid gap-4 md:grid-cols-2">
            <Field
              label="Item Name"
              value={formData.name}
              onChange={(value) => handleFieldChange("name", value)}
              placeholder="Example: Chicken Burger"
              isDayTheme={isDayTheme}
            />
            <Field
              label="Category"
              value={formData.category}
              onChange={(value) => handleFieldChange("category", value)}
              placeholder="Example: Burgers"
              listId="menu-categories"
              isDayTheme={isDayTheme}
            />
          </div>

          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <Field
              label="Price"
              type="number"
              value={formData.price}
              onChange={(value) => handleFieldChange("price", value)}
              placeholder="0.00"
              isDayTheme={isDayTheme}
            />
            <ToggleField
              label="Available"
              checked={formData.is_available}
              onChange={(value) => handleFieldChange("is_available", value)}
              description="Unavailable items will disappear from cashier ordering screens."
              isDayTheme={isDayTheme}
            />
          </div>

          <datalist id="menu-categories">
            {categories.map((category) => (
              <option key={category} value={category} />
            ))}
          </datalist>

          <div className="mt-5 flex flex-col gap-3 md:flex-row">
            <ActionButton
              onClick={handleSubmit}
              busy={busyAction === "create-item"}
            >
              Create Item
            </ActionButton>
          </div>
        </Section>
      </div>

      <Section
        title="Menu List"
        description="Search, filter, edit, hide, or delete items from one place."
        isDayTheme={isDayTheme}
      >
        <div className="grid gap-4 lg:grid-cols-[1.4fr,1fr,1fr]">
          <Field
            label="Search"
            value={search}
            onChange={setSearch}
            placeholder="Search by item name or category"
            isDayTheme={isDayTheme}
          />
          <SelectField
            label="Category"
            value={categoryFilter}
            onChange={setCategoryFilter}
            options={[
              { value: "ALL", label: "All Categories" },
              ...categories.map((category) => ({
                value: category,
                label: category,
              })),
            ]}
            isDayTheme={isDayTheme}
          />
          <SelectField
            label="Availability"
            value={availabilityFilter}
            onChange={setAvailabilityFilter}
            options={[
              { value: "ALL", label: "All Items" },
              { value: "AVAILABLE", label: "Available Only" },
              { value: "UNAVAILABLE", label: "Unavailable Only" },
            ]}
            isDayTheme={isDayTheme}
          />
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <Chip
            active={categoryFilter === "ALL"}
            onClick={() => setCategoryFilter("ALL")}
            isDayTheme={isDayTheme}
          >
            All
          </Chip>
          {categories.map((category) => (
            <Chip
              key={category}
              active={categoryFilter === category}
              onClick={() => setCategoryFilter(category)}
              isDayTheme={isDayTheme}
            >
              {category}
            </Chip>
          ))}
        </div>

        {filteredItems.length ? (
          <div className="mt-5 overflow-x-auto">
            <table className="w-full min-w-[860px] text-left text-base">
              <thead>
                <tr className={`border-b text-sm ${isDayTheme ? "border-slate-300 text-slate-600" : "border-gray-800 text-gray-400"}`}>
                  <th className="pb-3">Item</th>
                  <th className="pb-3">Category</th>
                  <th className="pb-3">Price</th>
                  <th className="pb-3">Status</th>
                  <th className="pb-3">Updated</th>
                  <th className="pb-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredItems.map((item) => (
                  <tr
                    key={item.id}
                    className={`border-b ${
                      isDayTheme
                        ? item.is_available
                          ? "border-slate-200 text-slate-800"
                          : "border-rose-200 bg-rose-50/80 text-slate-700"
                        : item.is_available
                          ? "border-gray-900 text-gray-200"
                          : "border-gray-900 bg-rose-500/5 text-gray-300"
                    }`}
                  >
                    <td className="py-3">
                      <div className={`text-lg font-medium ${isDayTheme ? "text-slate-900" : "text-white"}`}>{item.name}</div>
                    </td>
                    <td className="py-3">{item.category}</td>
                    <td className="py-3">Rs {formatMoney(item.price)}</td>
                    <td className="py-3">
                      <span
                        className={`rounded-full px-3 py-1 text-xs font-medium ${
                          item.is_available
                            ? "bg-emerald-500/15 text-emerald-300"
                            : "bg-rose-500/15 text-rose-300"
                        }`}
                      >
                        {item.is_available ? "Available" : "Unavailable"}
                      </span>
                    </td>
                    <td className={`py-3 ${isDayTheme ? "text-slate-500" : "text-gray-400"}`}>{formatDateTime(item.updated_at)}</td>
                    <td className="py-3">
                      <div className="flex justify-end gap-2">
                        <SmallButton onClick={() => handleEdit(item)}>Edit</SmallButton>
                        <SmallButton
                          onClick={() => handleToggleAvailability(item)}
                          tone={item.is_available ? "warning" : "success"}
                          busy={busyAction === `toggle-${item.id}`}
                        >
                          {item.is_available ? "Hide" : "Show"}
                        </SmallButton>
                        <SmallButton
                          onClick={() => handleDelete(item)}
                          tone="danger"
                          busy={busyAction === `delete-${item.id}`}
                        >
                          Delete
                        </SmallButton>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="mt-5">
            <EmptyState text="No menu items match the current search or filters." isDayTheme={isDayTheme} />
          </div>
        )}
      </Section>

      {editingItem && (
        <ModalShell title={`Edit: ${editingItem.name}`} isDayTheme={isDayTheme}>
          <div className="grid gap-4 md:grid-cols-2">
            <Field
              label="Item Name"
              value={editFormData.name}
              onChange={(value) =>
                setEditFormData((current) => ({ ...current, name: value }))
              }
              placeholder="Item name"
              isDayTheme={isDayTheme}
            />
            <Field
              label="Category"
              value={editFormData.category}
              onChange={(value) =>
                setEditFormData((current) => ({ ...current, category: value }))
              }
              placeholder="Category"
              listId="menu-categories"
              isDayTheme={isDayTheme}
            />
          </div>

          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <Field
              label="Price"
              type="number"
              value={editFormData.price}
              onChange={(value) =>
                setEditFormData((current) => ({ ...current, price: value }))
              }
              placeholder="0.00"
              isDayTheme={isDayTheme}
            />
            <ToggleField
              label="Available"
              checked={editFormData.is_available}
              onChange={(value) =>
                setEditFormData((current) => ({ ...current, is_available: value }))
              }
              description="You can also toggle this directly from the menu list."
              isDayTheme={isDayTheme}
            />
          </div>

          <div className="mt-5 flex flex-col gap-3 md:flex-row">
            <ActionButton onClick={handleSaveEdit} busy={busyAction === "save-edit"}>
              Save Changes
            </ActionButton>
            <ActionButton onClick={closeEditModal} tone="secondary">
              Cancel
            </ActionButton>
          </div>
        </ModalShell>
      )}
    </div>
  );
}

function Section({ id, title, description, children, isDayTheme = false }) {
  return (
    <div
      id={id}
      className={`rounded-3xl p-5 shadow-[0_20px_80px_rgba(0,0,0,0.18)] ${
        isDayTheme
          ? "border border-slate-200 bg-gradient-to-br from-white via-slate-50 to-slate-100"
          : "border border-gray-800 bg-gradient-to-br from-gray-900 via-gray-900 to-gray-950"
      }`}
    >
      <div className="mb-4">
        <h3 className={`text-lg font-semibold ${isDayTheme ? "text-slate-900" : "text-white"}`}>{title}</h3>
        {description && <p className={`mt-1 text-sm ${isDayTheme ? "text-slate-600" : "text-gray-400"}`}>{description}</p>}
      </div>
      {children}
    </div>
  );
}

function SummaryCard({ label, value, accent, isDayTheme = false }) {
  const accents = {
    blue: isDayTheme ? "from-blue-100 to-blue-50 border-blue-200" : "from-blue-500/15 to-blue-950/30 border-blue-500/20",
    emerald: isDayTheme ? "from-emerald-100 to-emerald-50 border-emerald-200" : "from-emerald-500/15 to-emerald-950/30 border-emerald-500/20",
    rose: isDayTheme ? "from-rose-100 to-rose-50 border-rose-200" : "from-rose-500/15 to-rose-950/30 border-rose-500/20",
    amber: isDayTheme ? "from-amber-100 to-amber-50 border-amber-200" : "from-amber-500/15 to-amber-950/30 border-amber-500/20",
    slate: isDayTheme ? "from-slate-200 to-slate-50 border-slate-200" : "from-slate-500/15 to-slate-950/30 border-slate-500/20",
  };

  return (
    <div className={`rounded-2xl border bg-gradient-to-br p-4 ${accents[accent]}`}>
      <p className={`text-sm ${isDayTheme ? "text-slate-600" : "text-gray-400"}`}>{label}</p>
      <p className={`mt-3 text-2xl font-semibold ${isDayTheme ? "text-slate-900" : "text-white"}`}>{value}</p>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
  listId,
  isDayTheme = false,
}) {
  return (
    <label className="block">
      <span className={`mb-2 block text-sm ${isDayTheme ? "text-slate-600" : "text-gray-400"}`}>{label}</span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        list={listId}
        className={`w-full rounded-xl px-4 py-3 outline-none transition focus:border-blue-500 ${
          isDayTheme
            ? "border border-slate-300 bg-white text-slate-900"
            : "border border-gray-700 bg-gray-950/70 text-white"
        }`}
      />
    </label>
  );
}

function SelectField({ label, value, onChange, options, isDayTheme = false }) {
  return (
    <label className="block">
      <span className={`mb-2 block text-sm ${isDayTheme ? "text-slate-600" : "text-gray-400"}`}>{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`w-full rounded-xl px-4 py-3 outline-none transition focus:border-blue-500 ${
          isDayTheme
            ? "border border-slate-300 bg-white text-slate-900"
            : "border border-gray-700 bg-gray-950/70 text-white"
        }`}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function ToggleField({ label, checked, onChange, description, isDayTheme = false }) {
  return (
    <div className={`rounded-2xl border px-4 py-3 ${
      isDayTheme ? "border-slate-200 bg-slate-50" : "border-gray-800 bg-gray-950/60"
    }`}>
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className={`text-sm ${isDayTheme ? "text-slate-700" : "text-gray-400"}`}>{label}</p>
          <p className={`mt-1 text-sm ${isDayTheme ? "text-slate-500" : "text-gray-500"}`}>{description}</p>
        </div>
        <button
          type="button"
          onClick={() => onChange(!checked)}
          className={`relative h-8 w-16 rounded-full transition ${
            checked ? "bg-emerald-600" : "bg-gray-700"
          }`}
        >
          <span
            className={`absolute top-1 h-6 w-6 rounded-full bg-white transition ${
              checked ? "left-9" : "left-1"
            }`}
          />
        </button>
      </div>
    </div>
  );
}

function ActionButton({ onClick, children, tone = "primary", busy = false }) {
  const tones = {
    primary: "bg-blue-600 hover:bg-blue-500 text-white",
    secondary: "bg-gray-800 hover:bg-gray-700 text-white",
  };

  return (
    <button
      onClick={onClick}
      disabled={busy}
      className={`w-full rounded-xl px-4 py-3 font-medium transition ${tones[tone]} ${
        busy ? "cursor-not-allowed opacity-70" : ""
      }`}
    >
      {busy ? "Please wait..." : children}
    </button>
  );
}

function SmallButton({ onClick, children, tone = "primary", busy = false }) {
  const tones = {
    primary: "bg-blue-600 hover:bg-blue-500 text-white",
    success: "bg-emerald-600 hover:bg-emerald-500 text-white",
    warning: "bg-amber-600 hover:bg-amber-500 text-white",
    danger: "bg-rose-600 hover:bg-rose-500 text-white",
  };

  return (
    <button
      onClick={onClick}
      disabled={busy}
      className={`rounded-lg px-3 py-2 text-xs font-medium transition ${tones[tone]} ${
        busy ? "cursor-not-allowed opacity-70" : ""
      }`}
    >
      {busy ? "..." : children}
    </button>
  );
}

function Chip({ active, onClick, children, isDayTheme = false }) {
  return (
    <button
      onClick={onClick}
      className={`rounded-full px-4 py-2 text-sm transition ${
        active
          ? "bg-blue-600 text-white"
          : isDayTheme
            ? "border border-slate-300 bg-white text-slate-700 hover:border-slate-400"
            : "bg-gray-800 text-gray-300 hover:bg-gray-700"
      }`}
    >
      {children}
    </button>
  );
}

function Alert({ tone, children }) {
  const tones = {
    error: "border-rose-500/20 bg-rose-500/10 text-rose-200",
    success: "border-emerald-500/20 bg-emerald-500/10 text-emerald-200",
  };

  return (
    <div className={`rounded-2xl border px-4 py-3 text-sm ${tones[tone]}`}>
      {children}
    </div>
  );
}

function EmptyState({ text, isDayTheme = false }) {
  return (
    <div className={`rounded-2xl border border-dashed p-6 text-center text-sm ${
      isDayTheme
        ? "border-slate-300 bg-slate-50 text-slate-500"
        : "border-gray-800 bg-gray-950/40 text-gray-400"
    }`}>
      {text}
    </div>
  );
}

function ModalShell({ title, children, isDayTheme = false }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4">
      <div className={`w-full max-w-3xl rounded-3xl p-6 shadow-2xl ${
        isDayTheme
          ? "border border-slate-200 bg-gradient-to-br from-white via-slate-50 to-slate-100"
          : "border border-gray-800 bg-gradient-to-br from-gray-900 via-gray-900 to-gray-950"
      }`}>
        <h3 className={`text-xl font-semibold ${isDayTheme ? "text-slate-900" : "text-white"}`}>{title}</h3>
        <div className="mt-4">{children}</div>
      </div>
    </div>
  );
}
