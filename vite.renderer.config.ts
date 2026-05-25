import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

function buildContentSecurityPolicy(mode: string) {
  const connectSources =
    mode === "development"
      ? ["'self'", "http://localhost:5173", "ws://localhost:5173"]
      : ["'self'"];
  // Vite injects styles during development, so dev needs unsafe-inline for CSS only.
  const styleSources =
    mode === "development" ? ["'self'", "'unsafe-inline'"] : ["'self'"];

  return [
    "default-src 'self'",
    "base-uri 'self'",
    "form-action 'self'",
    // `frame-ancestors` is ignored in meta-delivered CSP, so we omit it here.
    "object-src 'none'",
    "script-src 'self'",
    `style-src ${styleSources.join(" ")}`,
    "img-src 'self' file: blob: data:",
    "font-src 'self' data:",
    `connect-src ${connectSources.join(" ")}`,
  ].join("; ");
}

export default defineConfig(({ mode }) => ({
  base: "./",
  root: path.resolve(__dirname, "src/renderer"),
  plugins: [
    react(),
    {
      name: "renderer-csp",
      transformIndexHtml(html) {
        return html.replace("%APP_CSP%", buildContentSecurityPolicy(mode));
      },
    },
  ],
  build: {
    outDir: path.resolve(__dirname, "dist/renderer"),
    emptyOutDir: true,
    rollupOptions: {
      input: path.resolve(__dirname, "src/renderer/index.html"),
    },
  },
}));
