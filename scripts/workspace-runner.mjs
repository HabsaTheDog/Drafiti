import path from "node:path";
import {
  findFilesByName,
  npmCommand,
  readJson,
  relativeFromRoot,
  repoRoot,
  runCommand
} from "./common.mjs";

const scriptName = process.argv[2];

if (!scriptName) {
  console.error("Expected a package script name.");
  process.exit(1);
}

const packageFiles = findFilesByName(repoRoot, "package.json").filter(
  (filePath) => path.dirname(filePath) !== repoRoot
);

if (packageFiles.length === 0) {
  console.log(`[skip] No package workspaces found for "${scriptName}".`);
  process.exit(0);
}

const workspaces = packageFiles
  .map((filePath) => {
    const packageJson = readJson(filePath);
    return {
      dir: path.dirname(filePath),
      name: packageJson.name || relativeFromRoot(path.dirname(filePath)),
      hasScript: Boolean(packageJson.scripts && packageJson.scripts[scriptName])
    };
  })
  .filter((workspace) => workspace.hasScript);

if (workspaces.length === 0) {
  console.log(
    `[skip] Found ${packageFiles.length} package workspace(s), but none define "${scriptName}".`
  );
  process.exit(0);
}

const npm = npmCommand();

for (const workspace of workspaces) {
  const exitCode = runCommand(npm.command, [...npm.argsPrefix, "run", scriptName], workspace.dir);
  if (exitCode !== 0) {
    process.exit(exitCode);
  }
}
