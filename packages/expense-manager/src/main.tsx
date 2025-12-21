import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { container } from "storion";
import { StoreProvider } from "storion/react";
import { devtoolsMiddleware } from "storion/devtools";
import { mountDevtoolsPanel } from "storion/devtools-panel";
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

// Create container with devtools middleware
const app = container({
  middleware: [
    devtoolsMiddleware({
      maxHistory: 5,
    }),
  ],
});

// Mount devtools panel in development
if (import.meta.env.DEV) {
  mountDevtoolsPanel({
    position: "left",
    size: 360,
  });
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <StoreProvider container={app}>
      <App />
    </StoreProvider>
  </StrictMode>
);
