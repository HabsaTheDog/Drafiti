# Project Scope & Architecture Document: Open-Source AI App Builder (v3.1)

## 1. Project Overview

An open-source, downloadable desktop application designed to be a next-generation AI app builder. The core mission is to serve two distinct user bases without compromising the experience for either:

* **Non-technical users ("Base" Tier):** Frictionless, instant, real-time app prototyping using natural language with zero setup required.
* **Developers ("Pro" Tier):** An intelligent scaffolding tool that generates production-ready code for scalable web and native mobile applications, bypassing tedious boilerplate and preserving exact layouts.

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
* **Root Jail:** The Rust subprocess strictly locks the Current Working Directory to the generated project folder.

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

### 6.3. Robust Click-to-Prompt

* **React Fiber Inspector:** Leverages `__source` properties to map UI elements to file names and line numbers.
* **Component Stack Tracking:** Captures the parent component hierarchy (e.g., `Button` -> `HeroSection` -> `App`) to give the AI context on whether to edit the component or the parent layout.

## 7. The Self-Healing Build Pipeline

* **Multi-Layered Debugging:** Intercepts TypeScript errors (`tsc --noEmit`), ESLint warnings, and React Native "Redbox" runtime errors via WebSocket.
* **Autonomous Fixes:** Errors are packaged and fed back to the AI CLI for up to 3 retries. If the error persists, the loop aborts to protect the user's API budget.

## 8. User Journeys

* **The "Base" Experience:** Download <10MB app -> Prompt -> Instant Full-Stack Prototype with a local reactive database.
* **The "Pro" Experience:** Eject code -> Immediate access to the Expo codebase -> Push local Convex schema to Production Cloud -> Deploy via EAS or Xcode/Android Studio.
