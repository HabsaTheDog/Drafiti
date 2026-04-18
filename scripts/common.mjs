import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

export const repoRoot = process.cwd();

const ignoredDirNames = new Set([
  ".git",
  ".next",
  ".turbo",
  ".yarn",
  "build",
  "coverage",
  "dist",
  "node_modules",
  "out",
  "target"
]);

export function findFilesByName(rootDir, fileName) {
  const matches = [];

  walk(rootDir, (entryPath, entry) => {
    if (entry.isFile() && entry.name === fileName) {
      matches.push(entryPath);
    }
  });

  return matches;
}

function walk(currentDir, onEntry) {
  const entries = fs.readdirSync(currentDir, { withFileTypes: true });

  for (const entry of entries) {
    if (entry.isDirectory() && ignoredDirNames.has(entry.name)) {
      continue;
    }

    const entryPath = path.join(currentDir, entry.name);
    onEntry(entryPath, entry);

    if (entry.isDirectory()) {
      walk(entryPath, onEntry);
    }
  }
}

export function relativeFromRoot(targetPath) {
  return path.relative(repoRoot, targetPath) || ".";
}

export function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

export function runCommand(command, args, cwd, env = process.env) {
  console.log(`> ${relativeFromRoot(cwd)} :: ${command} ${args.join(" ")}`);

  const result = spawnSync(command, args, {
    cwd,
    stdio: "inherit",
    env
  });

  if (result.error) {
    console.error(result.error.message);
    return typeof result.status === "number" ? result.status : 1;
  }

  return result.status ?? 1;
}

export function npmExecutable() {
  return process.platform === "win32" ? "npm.cmd" : "npm";
}

export function cargoExecutable() {
  return process.platform === "win32" ? "cargo.exe" : "cargo";
}

export function npmCommand() {
  if (process.platform !== "win32") {
    return {
      command: npmExecutable(),
      argsPrefix: []
    };
  }

  return {
    command: process.execPath,
    argsPrefix: [path.join(path.dirname(process.execPath), "node_modules", "npm", "bin", "npm-cli.js")]
  };
}

function prependPath(env, extraPath) {
  if (!extraPath) {
    return env;
  }

  const currentPath = env.PATH || env.Path || "";
  const pathKey = env.PATH !== undefined ? "PATH" : "Path";
  const entries = currentPath.split(path.delimiter).filter(Boolean);

  if (!entries.includes(extraPath)) {
    env[pathKey] = `${extraPath}${path.delimiter}${currentPath}`;
  }

  return env;
}

function findVcVars64() {
  const knownPaths = [
    "C:\\Program Files\\Microsoft Visual Studio\\2022\\BuildTools\\VC\\Auxiliary\\Build\\vcvars64.bat",
    "C:\\Program Files (x86)\\Microsoft Visual Studio\\2022\\BuildTools\\VC\\Auxiliary\\Build\\vcvars64.bat",
    "C:\\Program Files\\Microsoft Visual Studio\\2022\\Community\\VC\\Auxiliary\\Build\\vcvars64.bat",
    "C:\\Program Files (x86)\\Microsoft Visual Studio\\2022\\Community\\VC\\Auxiliary\\Build\\vcvars64.bat"
  ];

  for (const candidate of knownPaths) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  return null;
}

let cachedWindowsToolchainEnv = null;

export function createToolchainEnv(baseEnv = process.env) {
  const env = { ...baseEnv };
  const cargoBin = path.join(env.USERPROFILE || "", ".cargo", "bin");
  prependPath(env, cargoBin);

  if (process.platform !== "win32") {
    return env;
  }

  // Keep local Windows Tauri builds from exhausting RAM on machines with limited memory.
  if (!env.CARGO_BUILD_JOBS) {
    env.CARGO_BUILD_JOBS = "1";
  }

  if (cachedWindowsToolchainEnv) {
    return { ...cachedWindowsToolchainEnv, ...env };
  }

  const vcvars64 = findVcVars64();
  if (!vcvars64) {
    return env;
  }

  const result = spawnSync(
    "cmd.exe",
    ["/d", "/s", "/c", `""${vcvars64}" >nul && set"`],
    {
      encoding: "utf8",
      env
    }
  );

  if (result.status !== 0 || !result.stdout) {
    return env;
  }

  const toolchainEnv = { ...env };
  for (const line of result.stdout.split(/\r?\n/)) {
    const separatorIndex = line.indexOf("=");
    if (separatorIndex <= 0) {
      continue;
    }

    const key = line.slice(0, separatorIndex);
    const value = line.slice(separatorIndex + 1);
    toolchainEnv[key] = value;
  }

  cachedWindowsToolchainEnv = toolchainEnv;
  return { ...toolchainEnv };
}
