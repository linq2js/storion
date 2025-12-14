import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { container } from "storion";
import { StoreContainerProvider } from "storion/react";
import { App } from "./App";
import "./index.css";

// Create store container
const stores = container();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <StoreContainerProvider value={stores}>
      <App />
    </StoreContainerProvider>
  </StrictMode>
);

