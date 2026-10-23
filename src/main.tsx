import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { registerSW } from "virtual:pwa-register";
import App from "./App";
import { chronicleSync } from "./lib/chronicleSync";
import "./styles.css";

registerSW({ immediate: true });
chronicleSync.start();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
