export const THEME_OPTIONS = [
  {
    value: "NIGHT",
    label: "Midnight Ops",
    family: "dark",
    quickLabel: "Dark",
    description: "Sharp, high-contrast dashboard for fast scanning during busy service.",
    preview: {
      shell: "#020617",
      card: "#0f172a",
      border: "#334155",
      accent: "#38bdf8",
    },
    rootClass:
      "system-theme-night system-theme-scheme-night bg-[radial-gradient(circle_at_top_left,_rgba(16,185,129,0.10),_transparent_28%),radial-gradient(circle_at_top_right,_rgba(56,189,248,0.12),_transparent_26%),linear-gradient(135deg,_#020617_0%,_#0f172a_48%,_#111827_100%)] text-white",
    heroClass:
      "border border-slate-800 bg-[radial-gradient(circle_at_top_left,_rgba(16,185,129,0.18),_transparent_24%),radial-gradient(circle_at_top_right,_rgba(56,189,248,0.12),_transparent_22%),linear-gradient(135deg,_#020617_0%,_#0f172a_48%,_#111827_100%)]",
    eyebrowClass: "text-emerald-300",
    bodyColor: "#020617",
  },
  {
    value: "DAY",
    label: "Cafe Light",
    family: "light",
    quickLabel: "Light",
    description: "Warm daytime palette with softer surfaces that still keep strong readability.",
    preview: {
      shell: "#f5efe6",
      card: "#fffaf4",
      border: "#d8cbb8",
      accent: "#0f766e",
    },
    rootClass:
      "system-theme-day system-theme-scheme-day bg-[radial-gradient(circle_at_top_left,_rgba(15,118,110,0.10),_transparent_28%),radial-gradient(circle_at_top_right,_rgba(217,119,6,0.12),_transparent_26%),linear-gradient(135deg,_#f8f1e8_0%,_#fffaf4_48%,_#f1e3d3_100%)] text-slate-950",
    heroClass:
      "border border-slate-200 bg-[radial-gradient(circle_at_top_left,_rgba(15,118,110,0.10),_transparent_24%),radial-gradient(circle_at_top_right,_rgba(217,119,6,0.12),_transparent_22%),linear-gradient(135deg,_#fffaf4_0%,_#fff7ed_48%,_#f3e5d4_100%)]",
    eyebrowClass: "text-teal-700",
    bodyColor: "#f8f1e8",
  },
  {
    value: "STONE",
    label: "Stone Ledger",
    family: "light",
    quickLabel: "Light",
    description: "Clean neutral business palette that feels crisp for admin and reporting work.",
    preview: {
      shell: "#f3f4f6",
      card: "#ffffff",
      border: "#d1d5db",
      accent: "#1d4ed8",
    },
    rootClass:
      "system-theme-day system-theme-scheme-stone bg-[radial-gradient(circle_at_top_left,_rgba(29,78,216,0.08),_transparent_28%),radial-gradient(circle_at_top_right,_rgba(107,114,128,0.10),_transparent_26%),linear-gradient(135deg,_#f3f4f6_0%,_#ffffff_48%,_#e5e7eb_100%)] text-slate-950",
    heroClass:
      "border border-slate-200 bg-[radial-gradient(circle_at_top_left,_rgba(29,78,216,0.08),_transparent_24%),radial-gradient(circle_at_top_right,_rgba(148,163,184,0.10),_transparent_22%),linear-gradient(135deg,_#ffffff_0%,_#f8fafc_48%,_#e5e7eb_100%)]",
    eyebrowClass: "text-blue-700",
    bodyColor: "#f3f4f6",
  },
  {
    value: "CHARCOAL",
    label: "Charcoal Teal",
    family: "dark",
    quickLabel: "Dark",
    description: "Softer charcoal surfaces with cool teal energy for long all-day usage.",
    preview: {
      shell: "#0f1720",
      card: "#16202a",
      border: "#2f3d4a",
      accent: "#14b8a6",
    },
    rootClass:
      "system-theme-night system-theme-scheme-charcoal bg-[radial-gradient(circle_at_top_left,_rgba(20,184,166,0.12),_transparent_30%),radial-gradient(circle_at_top_right,_rgba(59,130,246,0.10),_transparent_26%),linear-gradient(135deg,_#0f1720_0%,_#16202a_48%,_#1c2733_100%)] text-white",
    heroClass:
      "border border-slate-800 bg-[radial-gradient(circle_at_top_left,_rgba(20,184,166,0.16),_transparent_24%),radial-gradient(circle_at_top_right,_rgba(56,189,248,0.10),_transparent_22%),linear-gradient(135deg,_#101923_0%,_#16202a_48%,_#1c2733_100%)]",
    eyebrowClass: "text-teal-300",
    bodyColor: "#0f1720",
  },
];

export const THEME_OPTIONS_BY_VALUE = THEME_OPTIONS.reduce((collection, option) => {
  collection[option.value] = option;
  return collection;
}, {});

export function getThemeConfig(themePreference) {
  return THEME_OPTIONS_BY_VALUE[themePreference] || THEME_OPTIONS_BY_VALUE.NIGHT;
}

export function isLightThemePreference(themePreference) {
  return getThemeConfig(themePreference).family === "light";
}
