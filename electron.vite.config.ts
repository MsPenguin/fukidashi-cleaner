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
      rollupOptions: {
        external: ["electron", "onnxruntime-node", "sharp"],
        input: {
          main: path.resolve(__dirname, "src/main/index.ts"),
          "workers/remove-text.worker": path.resolve(
            __dirname,
            "src/main/workers/remove-text.worker.ts",
          ),
        },
        plugins: [
          {
            name: "main-entry-shim",
            generateBundle(_options, bundle) {
              const mainChunk = Object.values(bundle).find(
                (output) => output.type === "chunk" && output.name === "main",
              );

              if (!mainChunk || mainChunk.type !== "chunk") {
                return;
              }

              this.emitFile({
                type: "asset",
                fileName: "index.js",
                source: `import('./${mainChunk.fileName.replace(/\\/g, "/")}');\n`,
              });
            },
          },
        ],
      },
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
