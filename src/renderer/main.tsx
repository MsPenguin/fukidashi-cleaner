import { createRoot } from "react-dom/client";
import App from "./App";
import "./styles.css";
import { StrictMode } from "react";

const el = document.getElementById("root")!;
const fallback = document.getElementById("fallback-banner");

try {
  if (fallback) {
    fallback.textContent = `renderer init. imageAgent: ${window.imageAgent ? "yes" : "no"}`;
  }

  const root = createRoot(el);
  root.render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
  if (fallback) fallback.classList.add("is-hidden");
} catch (err: any) {
  console.error("Renderer mount failed:", err);
  if (fallback)
    fallback.textContent = `Renderer error: ${err?.message || String(err)}`;
}
