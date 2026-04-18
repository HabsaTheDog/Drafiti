# Draffiti Agent Instructions

## Project Context

Draffiti is an open-source desktop AI app builder.

The repository scope, based on [docs/scope.md](docs/scope.md), is:

* a Tauri desktop app with a React + Tailwind UI
* a GUI wrapper around AI coding CLIs
* focused on instant app prototyping for non-technical users and production-ready scaffolding for developers
* centered on chat-driven building, previewing, validation, and iterative fixes
* aimed at generating universal Expo Router apps styled with NativeWind and backed by local Convex workflows

When making changes, keep work aligned with that product scope and avoid drifting into unrelated functionality.

## Source Of Truth

Use the `docs/` directory as shared project memory.

Start with:

* [docs/agents.md](docs/agents.md) for documentation expectations
* [docs/scope.md](docs/scope.md) for product scope and core architecture
* [docs/linting.md](docs/linting.md) for validation behavior

## Required Workflow

Before returning a response to the user after making changes, always run:

* `npm run lint`

In the response, state whether linting:

* passed
* failed
* was skipped because it could not be run

Do not present work as complete until that linting step has been handled.

## Documentation Rule

Update the relevant documentation when you:

* add or change features
* change behavior or developer workflow
* discover important caveats, broken flows, or scope mismatches

Prefer updating an existing relevant file in `docs/` before creating a new doc.
