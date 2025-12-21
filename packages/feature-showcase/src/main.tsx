import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { applyFor, container } from "storion";
import { StoreProvider } from "storion/react";
import { devtoolsMiddleware } from "storion/devtools";
import { mountDevtoolsPanel } from "storion/devtools-panel";
import { persistMiddleware } from "storion/persist";
import { App } from "./App";
import "./index.css";

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

// Create container with persist middleware
const app = container({
  middleware: [
    applyFor(
      "counter",
      persistMiddleware({
        // Only persist counter store for demo
        load: (spec) => {
          const key = `storion:${spec.displayName}`;
          const data = localStorage.getItem(key);
          return data ? JSON.parse(data) : null;
        },
        save: (spec, state) => {
          const key = `storion:${spec.displayName}`;
          localStorage.setItem(key, JSON.stringify(state));
        },
        onError: (spec, error, operation) => {
          console.error(
            `[Persist] ${operation} error for ${spec.displayName}:`,
            error
          );
        },
      })
    ),
  ],
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <StoreProvider container={app}>
      <App />
    </StoreProvider>
  </StrictMode>
);
