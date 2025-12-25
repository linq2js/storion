import React from "react";
import ReactDOM from "react-dom/client";
import { container } from "storion";
import { StoreProvider } from "storion/react";
import { devtoolsMiddleware } from "storion/devtools";
import { mountDevtoolsPanel } from "storion/devtools-panel";
import App from "./App";
import "./index.css";

const BASE_PATH = "/storion/demos/dashboard";

// Handle back/forward navigation outside demo
window.addEventListener("popstate", () => {
  if (!window.location.pathname.startsWith(BASE_PATH)) {
    window.location.reload();
  }
});

// Create container with devtools middleware
const app = container({
  middleware: [devtoolsMiddleware({ maxHistory: 50 })],
});

// Mount devtools panel (works in any environment)
mountDevtoolsPanel({
  position: "left",
  size: 360,
});

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <StoreProvider container={app}>
      <App />
    </StoreProvider>
  </React.StrictMode>
);
