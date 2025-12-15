import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { StoreProvider } from "storion/react";
import { App } from "./App";
import "./index.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <StoreProvider>
      <App />
    </StoreProvider>
  </StrictMode>
);
