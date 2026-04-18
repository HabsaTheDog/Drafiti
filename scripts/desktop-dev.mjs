import path from "node:path";
import { spawn } from "node:child_process";

import { createToolchainEnv, npmCommand, repoRoot } from "./common.mjs";

const desktopDir = path.join(repoRoot, "apps", "desktop");
const npm = npmCommand();
const env = createToolchainEnv();

const child = spawn(npm.command, [...npm.argsPrefix, "run", "tauri:dev"], {
  cwd: desktopDir,
  stdio: "inherit",
  env
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
