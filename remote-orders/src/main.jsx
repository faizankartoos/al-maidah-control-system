import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import "../../control-panel/src/index.css";
import App from "./App.jsx";
import { getAppClientName, getAuthToken } from "../../control-panel/src/services/api";

window.__AL_MAIDAH_CLIENT__ = "remote-orders";

const nativeFetch = window.fetch.bind(window);

window.fetch = (input, init = {}) => {
  const requestUrl = typeof input === "string" ? input : input?.url || "";
  const isApiRequest = requestUrl.includes("/api/");

  if (!isApiRequest) {
    return nativeFetch(input, init);
  }

  const headers = new Headers(init.headers || (input instanceof Request ? input.headers : undefined));
  const token = getAuthToken();

  if (token && !headers.has("Authorization")) {
    headers.set("Authorization", `Token ${token}`);
  }

  if (!headers.has("X-AlMaidah-Client")) {
    headers.set("X-AlMaidah-Client", getAppClientName());
  }

  return nativeFetch(input, {
    ...init,
    headers,
  });
};

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
