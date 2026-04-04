# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Recapture is a cross-platform desktop screen recorder and video editor built with Electron + React + TypeScript. It captures screen/webcam/audio, then provides a timeline-based editor for trimming, annotations, zoom effects, and export to MP4/GIF.

## Commands

```bash
# Development
npm run dev              # Start Vite dev server + Electron

# Build
npm run build            # Full build: tsc + vite + electron-builder
npm run build:mac        # macOS DMG (x64 + arm64)
npm run build:win        # Windows NSIS installer
npm run build:linux      # Linux AppImage
npm run build-vite       # Vite only (no Electron packaging)

# Lint & Format
npm run lint             # Biome check (errors on violations)
npm run lint:fix         # Auto-fix lint issues
npm run format           # Format with Biome

# Tests
npm run test             # Vitest unit tests (single run)
npm run test:watch       # Vitest in watch mode
npm run test:e2e         # Playwright E2E tests (needs xvfb on Linux)

# i18n
npm run i18n:check       # Validate translation completeness
```

Run a single unit test file: `npx vitest run path/to/file.test.ts`
Run a single E2E test: `npx playwright test tests/e2e/specific.spec.ts`

## Architecture

### Multi-Window Electron App

The app uses a single React codebase that renders different windows based on URL query param `?windowType=`:

- **`hud-overlay`** — Floating recording HUD (`src/components/launch/LaunchWindow.tsx`)
- **`source-selector`** — Screen/webcam picker dialog (`src/components/launch/SourceSelector.tsx`)
- **`editor`** — Main video editor with timeline (`src/components/video-editor/VideoEditor.tsx`)

Window routing happens in `src/App.tsx`. The Electron main process (`electron/main.ts`) creates and manages these windows.

### IPC Layer

All communication between renderer and main process goes through:
- **`electron/preload.ts`** — Exposes `window.electronAPI` via contextBridge
- **`electron/ipc/handlers.ts`** — Registers all IPC handlers (file ops, recording, export, system info)

### Video Processing Pipeline

- **Input**: WebM from browser MediaRecorder API
- **Processing**: WebCodecs API for decode → PixiJS canvas rendering (zoom, annotations, webcam overlay) → re-encode
- **Export**: MP4 via MP4Box muxer, or GIF via gif.js
- Key files: `src/lib/exporter/`, `src/hooks/useScreenRecorder.ts`

### UI Stack

- **shadcn/ui** components in `src/components/ui/` (Radix UI primitives + Tailwind)
- **Tailwind CSS** with stone color base
- **PixiJS** for canvas-based video preview and effects rendering
- **dnd-timeline** for the editor timeline

### State & Contexts

- `ShortcutsContext` — Keyboard shortcut configuration and handling
- `I18nContext` — Localization (3 locales: `en`, `zh-CN`, `es` in `src/i18n/`)

## Code Conventions

- **TypeScript strict mode** with `noUnusedLocals` and `noUnusedParameters`
- **Path alias**: `@/*` maps to `src/*`
- **Biome** for linting and formatting: tabs, double quotes, 100-char line width, LF endings
- **Pre-commit hook** (Husky + lint-staged) runs Biome on staged files
- **Node 22** required (see `.nvmrc`)
- CSS files are excluded from Biome (`!**/*.css`)
