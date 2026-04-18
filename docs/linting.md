# Linting

This file is the quick reference for the repository validation flow.

Current root commands:

* `npm run lint`
* `npm run lint:fix`
* `npm run typecheck`
* `npm run check`

Expected agent behavior:

* finish the task fully
* run the relevant validation before responding
* mention whether validation passed, failed, or skipped

Current behavior:

* `npm run lint` runs Markdown linting, code linting, and Rust linting
* `npm run typecheck` skips cleanly if no TypeScript project exists yet
* Rust lint skips cleanly if no `Cargo.toml` files exist yet
* root Markdown lint now excludes nested workspace `node_modules` directories explicitly
* root package validation auto-discovers nested package workspaces and runs their `lint`, `lint:fix`, and `typecheck` scripts when present
* this is the mechanism that validates the desktop workspace and Expo sandbox template once those workspaces exist in the repository

If this validation flow changes significantly, update this file.
