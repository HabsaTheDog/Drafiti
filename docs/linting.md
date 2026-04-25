# Linting

This file is the quick reference for the repository validation flow.

## Current Build Status

The Windows desktop build and dev flow should currently be treated as broken when the repository or selected workspace lives under a non-ASCII path.

The current checkout path (`C:\Users\user1\OneDrive\Документи\Development Alvaro\Draffiti`) matches that failure mode, so local desktop build and validation work from this checkout is considered broken until the repo is moved to an ASCII-only path or Windows short-path aliases are available.

Current root commands:

* `npm run desktop:dev`
* `npm run lint`
* `npm run lint:fix`
* `npm run typecheck`
* `npm run check`

Expected agent behavior:

* finish the task fully
* run the relevant validation before responding
* mention whether validation passed, failed, or skipped

Current behavior:

* `npm run desktop:dev` runs the Tauri desktop workspace in dev mode from the repo root and, on Windows, also loads the Visual Studio native build environment automatically when `vcvars64.bat` is available
* the desktop workspace `npm run dev` wrapper now reuses an already-running Vite server on port `1420`, including older localhost or IPv6 listeners from earlier runs, instead of failing immediately on a stale-port restart; if some other process owns that port, it exits with a direct conflict message
* `npm run lint` runs Markdown linting, code linting, and Rust linting
* the Rust lint step now also attempts to load the Visual Studio native build environment automatically on Windows before running Cargo
* Windows desktop and Rust validation scripts default `CARGO_BUILD_JOBS=1` when the variable is unset, reducing peak RAM usage during local Tauri compilation; set `CARGO_BUILD_JOBS` yourself to override it
* `npm run typecheck` skips cleanly if no TypeScript project exists yet
* Rust lint skips cleanly if no `Cargo.toml` files exist yet
* once the desktop Tauri workspace exists, `npm run lint` requires a working Rust toolchain and the native Windows/macOS/Linux linker prerequisites needed by Cargo for that platform
* root Markdown lint now excludes nested workspace `node_modules` directories explicitly
* root Markdown lint also excludes Rust `target` directories so generated Cargo artifacts do not fail repository doc validation
* root package validation auto-discovers nested package workspaces and runs their `lint`, `lint:fix`, and `typecheck` scripts when present
* this is the mechanism that validates the desktop workspace and Expo sandbox template once those workspaces exist in the repository

If this validation flow changes significantly, update this file.
