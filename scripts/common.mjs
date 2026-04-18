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

export function runCommand(command, args, cwd) {
  console.log(`> ${relativeFromRoot(cwd)} :: ${command} ${args.join(" ")}`);

  const result = spawnSync(command, args, {
    cwd,
    stdio: "inherit"
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
