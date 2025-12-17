import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { container } from "storion";
import { StoreProvider } from "storion/react";
import { devtoolsMiddleware } from "storion/devtools";
import { mountDevtoolsPanel } from "storion/devtools-panel";
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

// Create container
const app = container();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <StoreProvider container={app}>
      <App />
    </StoreProvider>
  </StrictMode>
);

