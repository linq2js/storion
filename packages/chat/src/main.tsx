import { createRoot } from "react-dom/client";
import { container } from "storion";
import { StoreProvider, StrictMode } from "storion/react";
import { devtoolsMiddleware } from "storion/devtools";
import { mountDevtoolsPanel } from "storion/devtools-panel";
import { App } from "./App";
import { setupCrossTabSync, toastStore } from "./stores";
import "./index.css";

// Handle browser back/forward navigation outside this demo's scope
// This is needed because each demo is a separate SPA
const BASE_PATH = import.meta.env.BASE_URL || "/";
window.addEventListener("popstate", () => {
  if (!window.location.pathname.startsWith(BASE_PATH)) {
    window.location.reload();
  }
});

// Set default middleware for all containers (in development)
if (import.meta.env.DEV) {
  container.defaults({
    pre: [devtoolsMiddleware({ maxHistory: 50 })],
  });

  mountDevtoolsPanel({
    position: "left",
    size: 360,
  });
}

// Create container
const app = container();

// Setup cross-tab sync after mounting
setTimeout(() => {
  const { actions: toastActions } = app.get(toastStore);
  setupCrossTabSync(app, { show: toastActions.show });
}, 0);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <StoreProvider container={app}>
      <App />
    </StoreProvider>
  </StrictMode>
);
