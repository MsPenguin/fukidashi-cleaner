import path from "node:path";
import { defineConfig } from "electron-vite";
import react from "@vitejs/plugin-react";

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
    "object-src 'none'",
    "script-src 'self'",
    `style-src ${styleSources.join(" ")}`,
    "img-src 'self' file: blob: data:",
    "font-src 'self' data:",
    `connect-src ${connectSources.join(" ")}`,
  ].join("; ");
}

export default defineConfig(({ mode }) => ({
  main: {
    build: {
      outDir: "dist/main",
    },
  },
  preload: {
    build: {
      outDir: "dist/preload",
    },
  },
  renderer: {
    base: "./",
    plugins: [
      react(),
      {
        name: "renderer-csp",
        transformIndexHtml(html) {
          return html.replace("%APP_CSP%", buildContentSecurityPolicy(mode));
        },
      },
    ],
    resolve: {
      alias: {
        "@renderer": path.resolve(__dirname, "src/renderer"),
      },
    },
    build: {
      outDir: "dist/renderer",
    },
  },
}));
