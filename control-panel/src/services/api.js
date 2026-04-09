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

function appendParams(url, params) {
  if (!params) {
    return url;
  }

  const finalUrl = new URL(url, window.location.origin);

  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === "") {
      return;
    }

    if (Array.isArray(value)) {
      value.forEach((item) => finalUrl.searchParams.append(key, item));
      return;
    }

    finalUrl.searchParams.set(key, value);
  });

  return finalUrl.toString();
}

function normalizeResponsePayload(payload) {
  if (payload === undefined) {
    return null;
  }

  return payload;
}

async function parseResponseBody(response) {
  const contentType = response.headers.get("content-type") || "";

  if (contentType.includes("application/json")) {
    return response.json();
  }

  if (contentType.startsWith("text/")) {
    return response.text();
  }

  const text = await response.text();
  return text || null;
}

async function request(method, path, data, config = {}) {
  const headers = new Headers(config.headers || {});
  const token = getAuthToken();

  if (token && !headers.has("Authorization")) {
    headers.set("Authorization", `Token ${token}`);
  }

  if (!headers.has("X-AlMaidah-Client")) {
    headers.set("X-AlMaidah-Client", getAppClientName());
  }

  const fetchConfig = {
    method,
    headers,
  };

  if (data !== undefined) {
    if (data instanceof FormData) {
      fetchConfig.body = data;
    } else {
      if (!headers.has("Content-Type")) {
        headers.set("Content-Type", "application/json");
      }

      fetchConfig.body = JSON.stringify(data);
    }
  }

  const url = appendParams(buildApiUrl(path), config.params);
  const response = await fetch(url, fetchConfig);
  const parsedBody = normalizeResponsePayload(await parseResponseBody(response));
  const result = {
    data: parsedBody,
    status: response.status,
    ok: response.ok,
    headers: response.headers,
  };

  if (!response.ok) {
    const error = new Error("Request failed");
    error.response = result;
    throw error;
  }

  return result;
}

const api = {
  get(path, config) {
    return request("GET", path, undefined, config);
  },
  post(path, data, config) {
    return request("POST", path, data, config);
  },
  patch(path, data, config) {
    return request("PATCH", path, data, config);
  },
  put(path, data, config) {
    return request("PUT", path, data, config);
  },
  delete(path, config) {
    return request("DELETE", path, undefined, config);
  },
};

export default api;
