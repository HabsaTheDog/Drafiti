# Project Scope & Architecture Document: Open-Source AI App Builder (v3.1)

## 1. Project Overview

An open-source, downloadable desktop application designed to be a next-generation AI app builder. The core mission is to serve two distinct user bases without compromising the experience for either:

* **Non-technical users ("Base" Tier):** Frictionless, instant, real-time app prototyping using natural language with zero setup required.
* **Developers ("Pro" Tier):** An intelligent scaffolding tool that generates production-ready code for scalable web and native mobile applications, bypassing tedious boilerplate and preserving exact layouts.

## Current Implementation Milestone

The repository is intentionally starting narrower than the full product vision above.

The current first-pass milestone is:

* a single Tauri desktop workspace at `apps/desktop`
* a Codex-only desktop shell with a persistent operator/chat rail and a managed website preview workspace
* one picked local workspace folder per session
* local Codex CLI readiness checks and pre-existing CLI auth checks
* per-prompt Codex model selection, with automatic session reconnect when the selected model changes
* a managed local website preview lifecycle for the picked workspace, including detected dev commands, reachability polling, and boot/crash states
* a single streaming transcript with prompt-to-prompt workspace change summaries, but still without Git time travel, Convex bootstrap, or multi-provider support
* on Windows, Codex CLI discovery should work against standard npm global shims such as `%APPDATA%\\npm\\codex.cmd` instead of assuming a Unix-style executable name only
* on Windows, the desktop bridge should give Codex a managed app-local npm cache and temp directory so package installs and scaffolding do not depend on OneDrive-synced or user-global cache paths
* the Codex desktop bridge must stay aligned with the live Codex app-server request contract, including current sandbox enum formats for `thread/start` and `turn/start`
* the transcript should break long assistant replies into paragraph-sized bubbles so the chat rail reads like a sequence of updates instead of one wall of text
* transcript diagnostics should stay out of the main chat rail by default, with raw error output tucked behind a collapsed diagnostics section instead of inline error bubbles

This keeps the initial build focused on a reliable Codex desktop bridge before layering in the broader app-builder scope.

### Current Codex Prompt Policy

The current desktop milestone also uses a fixed Draffiti-owned Codex build profile.

For v1:

* Draffiti injects a hidden, repo-defined build profile into every Codex turn from the Tauri backend
* the first user prompt in a session is pinned as the project brief and resent on follow-up turns to reduce drift
* the build profile keeps generated apps on the Expo Router + NativeWind + Convex-ready path described in this scope while also defaulting to responsive phone-and-desktop layouts plus subtle purposeful motion
* the build profile now also requires the runnable app to stay at the selected workspace root with a working root `package.json` and `npm run dev` preview entrypoint unless the user explicitly asks for a different repo layout
* design guidance uses repo-local image assets from `/img` when screens need imagery, with filename-based selection expected because asset titles are usually descriptive
* the desktop UI shows a read-only summary of the active build profile for transparency, but users do not edit the prompt yet
* the desktop bridge currently runs Codex with `approvalPolicy: never` plus full local access during active sessions to reduce Windows bootstrap and scaffolding failures, while still setting an app-managed cache/temp area for toolchains such as npm
* the prompt policy tells Codex to treat empty-workspace inspection misses as non-fatal, scaffold a minimal app when the picked folder is blank, and retry bootstrap commands with a fallback before aborting
* the desktop transcript suppresses low-signal Codex and scaffolding stderr noise such as blank-output exit summaries, npm log-path dumps, and known transient Windows bootstrap parser noise, while real turn and session failures still surface as errors

## 2. Platform Architecture (The Engine)

This is the tech stack used to build the desktop application itself.

* **Desktop Framework:** **Tauri (Rust)**. Chosen for its lightweight footprint (sub-10MB binaries), low RAM usage, and secure access to the local file system.
* **Frontend / UI:** **React + Tailwind CSS**.
* **Cross-Platform Builds:** **GitHub Actions**. Automated CI/CD pipeline to compile Windows (`.exe`), macOS (`.dmg`), and Linux binaries.
* **Sidecar Process Management:** The Rust backend manages the lifecycle of Node.js, Expo, and AI CLI processes, enforcing strict kill-signals to prevent zombie processes or port conflicts.

## 3. The App Generation Stack (The Output)

A universal stack chosen to prevent AI translation errors (hallucinations/layout shifts) when moving from a web prototype to a native mobile app.

* **Universal Framework:** **Expo Router (React Native)**. Allows the AI to write a single codebase that deploys universally to Web, iOS, and Android.
* **Styling:** **NativeWind**. Translates Tailwind CSS utility classes smoothly into React Native styles.
* **Real-time Backend:** **Convex (Local Standalone)**. Provides instant, real-time reactive state management for the local prototype via a local standalone binary (backed by SQLite), requiring no cloud setup for the user.

## 4. AI Integration & Management Strategy

The platform acts as a **CLI Passthrough Architecture**, serving as a GUI wrapper around official AI CLI tools (e.g., Anthropic's `claude-code` or Codex CLI).

### 4.1. Bring Your Own Subscription (BYOS) Auth Flow

* **Native OAuth Intercept:** For tools that use browser-based login, the Rust backend watches for session token creation in the local file system (e.g., `~/.claude/config.json`).
* **Credential Handoff:** The UI facilitates the login process, and once the local config file is detected, the UI transitions to the active canvas.

### 4.2. On-Demand First-Run Bootstrapper

To keep the initial download tiny (<10MB):

* **Silent Download:** Tauri fetches pre-compiled, portable binaries for Node.js, Expo, and the Convex standalone backend on first run.
* **Path Injection:** Tauri prepends the hidden app-specific directory to the `PATH` when spawning subprocesses.

### 4.3. Sandboxed File System Execution

* **No Shell Execution:** Rust executes binaries directly (avoiding `sh -c`) to neutralize shell injection attacks.
* **Current milestone note:** Draffiti currently starts Codex turns in full-access mode to avoid local bootstrap failures during the first desktop milestone, even though the longer-term target remains tighter workspace sandboxing.

## 5. Version Control & Database Syncing (Indestructible Sandbox)

The application provides a "Time Travel" UI for the full-stack environment.

* **The Version Tree:** A visual UI wrapper for Git. Every successful generation loop triggers a silent `git commit`.
* **State Synchronization:** To prevent schema mismatches, Rust creates a snapshot of the **Convex SQLite file** for every Git commit hash.
* **Restoration:** Switching versions in the UI triggers a `git checkout` for the code and an immediate restoration of the corresponding SQLite database snapshot.
* **Always Cancel:** Users can interrupt the agent at any time; Rust sends a `SIGKILL` to the AI CLI subprocess to stop generation and save API budget.

## 6. UI/UX: The Generative Canvas

The application focuses on the Chat UI and the Web Preview.

### 6.1. Agent Transparency

The UI explicitly communicates the agent's internal state to build trust:

* **Planning:** Determining the implementation strategy.
* **Thinking:** Solving complex logic problems.
* **Building:** Editing files and writing code.
* **Checking:** Running linting and ensuring functionality.

### 6.2. The Web Preview

* **Local Iframe:** Points to the local Expo server (typically `localhost:8081`).
* **Watchdog Layer:** A React wrapper pings the local port; if the server is booting or has crashed, it shows a branded skeleton loader/building state instead of a browser error.
* **Current milestone behavior:** Draffiti auto-detects an Expo web preview command first, then a root npm preview script for the picked workspace in a fixed fallback order (`dev`, `dev:web`, `start:web`, `web`, `preview`, `start`, `serve`), while also allowing a manual override preview command in settings. URL inference should prefer explicit script flags, fall back to common dev-server defaults when needed, and otherwise follow the URL printed by the dev server so wrapper scripts still preview correctly.
* **Browser handoff:** The preview toolbar opens the resolved preview URL in the system browser through the desktop backend instead of relying on webview `window.open` behavior.
* **Viewport switcher:** The preview footer includes desktop and phone viewport buttons that resize the local iframe canvas without restarting the preview process, letting users inspect responsive output inside the same live session.
* **Narrow-width shell behavior:** On narrow app widths, the chat/preview tab bar must stay stacked above the workspace canvas and preview toolbar actions must wrap instead of squeezing the iframe off-screen.

### 6.2.1. Prompt Change Visibility

* **Prompt summaries:** After each completed Codex turn, Draffiti compares the workspace snapshot from before and after the turn and inserts a compact change summary card into the transcript.
* **Preview mirror:** The latest prompt change summary is also mirrored below the preview so users can see what changed without opening a full diff viewer yet.

### 6.3. Robust Click-to-Prompt

* **React Fiber Inspector:** Leverages `__source` properties to map UI elements to file names and line numbers.
* **Component Stack Tracking:** Captures the parent component hierarchy (e.g., `Button` -> `HeroSection` -> `App`) to give the AI context on whether to edit the component or the parent layout.

## 7. The Self-Healing Build Pipeline

* **Multi-Layered Debugging:** Intercepts TypeScript errors (`tsc --noEmit`), ESLint warnings, and React Native "Redbox" runtime errors via WebSocket.
* **Autonomous Fixes:** Errors are packaged and fed back to the AI CLI for up to 3 retries. If the error persists, the loop aborts to protect the user's API budget.

## 8. User Journeys

* **The "Base" Experience:** Download <10MB app -> Prompt -> Instant Full-Stack Prototype with a local reactive database.
* **The "Pro" Experience:** Eject code -> Immediate access to the Expo codebase -> Push local Convex schema to Production Cloud -> Deploy via EAS or Xcode/Android Studio.
