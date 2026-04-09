import axios from "axios";

export const AUTH_TOKEN_STORAGE_KEY = "al_maidah_auth_token";
export const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8000/api/").replace(/\/?$/, "/");

export function getAppClientName() {
  if (typeof window !== "undefined" && window.__AL_MAIDAH_CLIENT__) {
    return window.__AL_MAIDAH_CLIENT__;
  }

  return "control-panel";
}

export function buildApiUrl(path = "") {
  const normalizedPath = String(path || "").replace(/^\//, "");
  return `${API_BASE_URL}${normalizedPath}`;
}

export function getAuthToken() {
  return localStorage.getItem(AUTH_TOKEN_STORAGE_KEY);
}

export function setAuthToken(token) {
  if (token) {
    localStorage.setItem(AUTH_TOKEN_STORAGE_KEY, token);
  } else {
    localStorage.removeItem(AUTH_TOKEN_STORAGE_KEY);
  }
}

export function clearAuthToken() {
  localStorage.removeItem(AUTH_TOKEN_STORAGE_KEY);
}

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    "Content-Type": "application/json",
  },
});

api.interceptors.request.use((config) => {
  const token = getAuthToken();

  if (token) {
    config.headers.Authorization = `Token ${token}`;
  }

  config.headers["X-AlMaidah-Client"] = config.headers["X-AlMaidah-Client"] || getAppClientName();

  return config;
});

export default api;
