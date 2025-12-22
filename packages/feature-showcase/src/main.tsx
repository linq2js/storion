import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { applyFor, container } from "storion";
import { StoreProvider } from "storion/react";
import { devtoolsMiddleware } from "storion/devtools";
import { mountDevtoolsPanel } from "storion/devtools-panel";
import { persistMiddleware } from "storion/persist";
import { App } from "./App";
import "./index.css";

// Handle browser back/forward navigation outside this demo's scope
// This is needed because each demo is a separate SPA
const BASE_PATH = import.meta.env.BASE_URL || "/";
window.addEventListener("popstate", () => {
  if (!window.location.pathname.startsWith(BASE_PATH)) {
    window.location.reload();
  }
});

// Create container with middleware
const app = container({
  middleware: [
    // DevTools middleware for state inspection
    devtoolsMiddleware({ maxHistory: 50 }),
    // Persist middleware for counter store
    applyFor(
      "counter",
      persistMiddleware({
        handler: (ctx) => {
          const key = `storion:${ctx.spec.displayName}`;
          return {
            load: () => {
              const data = localStorage.getItem(key);
              return data ? JSON.parse(data) : null;
            },
            save: (state) => {
              localStorage.setItem(key, JSON.stringify(state));
            },
          };
        },
        onError: (error, operation) => {
          console.error(`[Persist] ${operation} error:`, error);
        },
      })
    ),
  ],
});

// Mount devtools panel after container is created (even in production)
// This demonstrates the devtools capabilities to users
mountDevtoolsPanel({
  position: "left",
  size: 360,
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <StoreProvider container={app}>
      <App />
    </StoreProvider>
  </StrictMode>
);
