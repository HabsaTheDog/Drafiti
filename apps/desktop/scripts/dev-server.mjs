import { spawn } from "node:child_process";

import { npmCommand } from "../../../scripts/common.mjs";

const DEV_URL = "http://127.0.0.1:1420";
const LEGACY_DEV_URLS = ["http://localhost:1420", "http://[::1]:1420"];
const REACHABILITY_TIMEOUT_MS = 2_000;

function keepAliveOnExistingServer(url) {
  console.log(`Reusing existing desktop dev server at ${url}.`);

  const timer = setInterval(() => {}, 60_000);

  const shutdown = (signal) => {
    clearInterval(timer);
    if (signal) {
      process.kill(process.pid, signal);
      return;
    }
    process.exit(0);
  };

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}

async function readDevServerHtml(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REACHABILITY_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method: "GET",
      signal: controller.signal,
      headers: {
        Accept: "text/html"
      }
    });

    const html = await response.text();
    return {
      ok: true,
      html
    };
  } catch {
    return {
      ok: false,
      html: ""
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function detectExistingViteServer() {
  for (const url of [DEV_URL, ...LEGACY_DEV_URLS]) {
    const result = await readDevServerHtml(url);
    if (!result.ok) {
      continue;
    }

    if (result.html.includes("/@vite/client")) {
      return url;
    }

    throw new Error(
      `Port 1420 is already serving something that does not look like the Draffiti Vite dev server. Stop the conflicting process or change the dev port.`
    );
  }

  return null;
}

async function main() {
  const existingServerUrl = await detectExistingViteServer();
  if (existingServerUrl) {
    keepAliveOnExistingServer(existingServerUrl);
    return;
  }

  const npm = npmCommand();
  const child = spawn(npm.command, [...npm.argsPrefix, "run", "dev:vite"], {
    cwd: process.cwd(),
    stdio: "inherit",
    env: process.env
  });

  child.on("exit", (code, signal) => {
    if (signal) {
      process.kill(process.pid, signal);
      return;
    }
    process.exit(code ?? 1);
  });

  child.on("error", (error) => {
    console.error(error.message);
    process.exit(1);
  });
}

await main();
