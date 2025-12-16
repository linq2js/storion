import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { container } from "storion";
import { StoreProvider } from "storion/react";
import { devtoolsMiddleware } from "storion/devtools";
import { mountDevtoolsPanel } from "storion/devtools-panel";
import { App } from "./App";
import "./index.css";

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
    position: "right",
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
