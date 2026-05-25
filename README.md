# Fukidashi Cleaner

Electron desktop app for removing speech-bubble text from images with a local ONNX pipeline.

## What It Does

- Load one or more images by file picker or drag and drop.
- Detect text regions.
- Build a mask around detected regions.
- Inpaint only the masked area and preserve pixels outside the mask.
- Preview before/after images in the desktop UI.

## Stack

- Electron
- React 19
- electron-vite
- electron-builder
- TypeScript
- `onnxruntime-node`
- `sharp`

## Project Layout

```text
src/
  main/        Electron main process and image pipeline
  preload/     Safe bridge for renderer <-> IPC
  renderer/    React UI
  shared/      Shared types
electron.vite.config.ts
electron-builder.yml
resources/
  fonts/       UI fonts bundled through the renderer build
  models/      ONNX models and config files
dist/          Build output
release/       Packaged artifacts from electron-builder
```

## Requirements

- Node.js 22+ recommended
- Yarn 4
- Windows is the primary target right now

## Install

```bash
yarn install
```

## Run

Development with renderer HMR and Electron hot reload:

```bash
yarn dev
```

Type-check only:

```bash
yarn typecheck
```

Production build output only:

```bash
yarn build
```

Preview the production build in Electron:

```bash
yarn preview
```

Build and then preview in one step:

```bash
yarn start
```

## Packaging

Create an unpacked desktop app:

```bash
yarn dist:dir
```

Create installer artifacts with electron-builder:

```bash
yarn dist
```

Windows installer only:

```bash
yarn dist:win
```

Notes:

- Native modules are rebuilt through `electron-builder install-app-deps` on install.
- Runtime ONNX models are copied into the packaged app via `extraResources`, so the app continues to resolve them from `process.resourcesPath/models`.

## Model Files

The app expects local ONNX resources under `resources/models`.

Current repository layout:

```text
resources/models/text-detector/det.onnx
resources/models/text-detector/config.json
resources/models/inpaint/lama-2048.onnx
resources/models/inpaint/lama-3072.onnx
resources/models/inpaint/lama-4096.onnx
resources/models/inpaint/manifest.json
```

Notes:

- Text detection is resolved from `resources/models/text-detector`.
- Inpainting bucket models are resolved from `resources/models/inpaint`.
- If a required model is missing or empty, the main process throws an explicit error at runtime.

## Output

- Processed files are saved as PNG.
- Default output location is the Electron `userData/outputs` directory.
- If no text is detected, the app still writes a PNG copy of the source image.

## Font Asset Handling

UI fonts live in `resources/fonts` and are referenced from `src/renderer/styles.css` with relative asset URLs so the renderer bundle includes them in both dev and production builds.

## Current Workflow

1. Add images.
2. Select a thumbnail.
3. Run `문자 제거`.
4. Watch progress in the header panel.
5. Compare original and processed output in the split viewer.

## Known Constraints

- The UI currently exposes a `4096 bucket 허용` toggle, but the renderer checkbox is not yet wired into the processing request.
- The app is focused on local desktop processing and does not upload images anywhere.
- `resources/models` is intentionally gitignored, so packaging only works on machines where the ONNX models are already present locally.
