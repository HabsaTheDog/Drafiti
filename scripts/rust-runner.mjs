import fs from "node:fs";
import path from "node:path";
import {
  cargoExecutable,
  createToolchainEnv,
  findFilesByName,
  repoRoot,
  runCommand
} from "./common.mjs";

const mode = process.argv[2];

if (!mode || !["lint", "fix"].includes(mode)) {
  console.error('Expected "lint" or "fix".');
  process.exit(1);
}

const manifests = findFilesByName(repoRoot, "Cargo.toml").map((filePath) => ({
  dir: path.dirname(filePath),
  filePath,
  isWorkspaceRoot: /^\[workspace\]/m.test(fs.readFileSync(filePath, "utf8"))
}));

if (manifests.length === 0) {
  console.log("[skip] No Cargo.toml files found.");
  process.exit(0);
}

const workspaceRoots = manifests.filter((manifest) => manifest.isWorkspaceRoot);
const selectedManifests = manifests.filter((manifest) => {
  if (manifest.isWorkspaceRoot) {
    return true;
  }

  return !workspaceRoots.some((workspaceRoot) => {
    const relativePath = path.relative(workspaceRoot.dir, manifest.dir);
    return relativePath && !relativePath.startsWith("..") && !path.isAbsolute(relativePath);
  });
});

const cargo = cargoExecutable();
const env = createToolchainEnv();

for (const manifest of selectedManifests) {
  const args =
    mode === "lint"
      ? [
          "clippy",
          "--all-targets",
          "--all-features",
          "--manifest-path",
          manifest.filePath,
          "--",
          "-D",
          "warnings"
        ]
      : ["fmt", "--all", "--manifest-path", manifest.filePath];

  const exitCode = runCommand(cargo, args, manifest.dir, env);
  if (exitCode !== 0) {
    process.exit(exitCode);
  }
}
