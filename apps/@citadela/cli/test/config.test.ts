import { mkdtempSync, readFileSync, statSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { loadConfig, saveConfig } from "../src/config/config.js";

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

describe("Citadela CLI configuration", () => {
  it("saves and validates configuration without secrets", () => {
    const directory = mkdtempSync(join(tmpdir(), "citadela-cli-"));
    temporaryDirectories.push(directory);
    const filePath = join(directory, "config.json");

    saveConfig({ hubUrl: "ws://hub.local", network: "headscale", deviceId: "device-1" }, filePath);

    expect(loadConfig(filePath)).toEqual({ hubUrl: "ws://hub.local", network: "headscale", deviceId: "device-1" });
    expect(readFileSync(filePath, "utf8")).not.toContain("privateKey");
    if (process.platform !== "win32") expect(statSync(filePath).mode & 0o777).toBe(0o600);
  });

  it("returns an empty configuration when the file does not exist", () => {
    expect(loadConfig(join(tmpdir(), "citadela-config-does-not-exist.json"))).toEqual({});
  });
});
