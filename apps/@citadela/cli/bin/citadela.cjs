#!/usr/bin/env node

const { spawnSync } = require("node:child_process");
const { chmodSync, existsSync } = require("node:fs");
const { dirname, join } = require("node:path");

const packageRoot = dirname(__dirname);
const platformKey = `${process.platform}-${process.arch}`;
const nativeNames = {
  "win32-x64": ["citadela-win32-x64.exe", "opentui.dll"],
  "linux-x64": ["citadela-linux-x64", "libopentui.so"],
  "linux-arm64": ["citadela-linux-arm64", "libopentui.so"],
  "darwin-x64": ["citadela-darwin-x64", "libopentui.dylib"],
  "darwin-arm64": ["citadela-darwin-arm64", "libopentui.dylib"],
};
const nativeTarget = nativeNames[platformKey];
const platformBinary = nativeTarget ? join(packageRoot, "dist", "bin", nativeTarget[0]) : undefined;

if (platformBinary && existsSync(platformBinary)) {
  if (process.platform !== "win32") chmodSync(platformBinary, 0o755);
  const result = spawnSync(platformBinary, process.argv.slice(2), {
    cwd: dirname(platformBinary),
    env: { ...process.env, CITADELA_OPENTUI_LIB: join(dirname(platformBinary), nativeTarget[1]) },
    stdio: "inherit",
  });
  if (result.error) {
    console.error(`Failed to start Citadela native binary: ${result.error.message}`);
    process.exitCode = 1;
  } else {
    process.exitCode = result.status ?? 1;
  }
} else {
  const fallback = join(packageRoot, "dist", "cli.js");
  const result = spawnSync(process.execPath, [fallback, ...process.argv.slice(2)], { stdio: "inherit" });
  if (result.error) {
    console.error(`Failed to start Citadela CLI: ${result.error.message}`);
    process.exitCode = 1;
  } else {
    process.exitCode = result.status ?? 1;
  }
}
