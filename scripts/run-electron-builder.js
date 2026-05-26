const { spawn } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const args = process.argv.slice(2);
const yarnCommand = process.platform === "win32" ? "yarn.cmd" : "yarn";
const maxAttempts = 3;
const retryDelayMs = 2000;
const version = require("../package.json").version;
const outputDir = path.join(
  "release",
  version,
  `build-${Date.now()}-${process.pid}`,
);

fs.mkdirSync(outputDir, { recursive: true });

function wait(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function runElectronBuilderOnce() {
  return new Promise((resolve) => {
    const child = spawn(
      yarnCommand,
      ["electron-builder", "--config", "electron-builder.yml", ...args],
      {
        stdio: "inherit",
        env: {
          ...process.env,
          EB_OUTPUT_DIR: outputDir,
        },
        shell: process.platform === "win32",
      },
    );

    child.on("error", (error) => {
      resolve({ code: 1, error });
    });

    child.on("exit", (code, signal) => {
      if (signal) {
        resolve({ code: 1, signal });
        return;
      }

      resolve({ code: code ?? 1 });
    });
  });
}

async function main() {
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const result = await runElectronBuilderOnce();

    if (result.code === 0) {
      process.exit(0);
    }

    if (attempt < maxAttempts) {
      console.warn(
        `electron-builder failed on attempt ${attempt}/${maxAttempts}. Retrying in ${retryDelayMs / 1000}s...`,
      );
      await wait(retryDelayMs);
      continue;
    }

    process.exit(result.code ?? 1);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
