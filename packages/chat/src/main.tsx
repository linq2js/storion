import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { container } from "storion";
import { StoreProvider } from "storion/react";
import { devtoolsMiddleware } from "storion/devtools";
import { mountDevtoolsPanel } from "storion/devtools-panel";
import { App } from "./App";
import { setupCrossTabSync, chatStore, toastStore } from "./stores";
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

// Setup cross-tab sync after mounting
setTimeout(() => {
  const chatInstance = app.get(chatStore);
  const toastInstance = app.get(toastStore);

  setupCrossTabSync(
    chatInstance.actions,
    { show: toastInstance.actions.show },
    () => chatInstance.state.users.data ?? [],
    () => chatInstance.state.rooms.data ?? [],
    () => chatInstance.state.currentUser?.id ?? null,
    () => chatInstance.state.activeRoomId
  );
}, 0);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <StoreProvider container={app}>
      <App />
    </StoreProvider>
  </StrictMode>
);
