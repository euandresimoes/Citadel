import { describe, expect, it } from "vitest";
import { resolve } from "node:path";
import { runMigrations } from "../src/runtime/database.js";
import type { Pool } from "pg";

describe("database migrations", () => {
  it("tracks applied migration files and does not execute them twice", async () => {
    const applied = new Set<string>();
    const queries: string[] = [];
    const client = {
      query: async <T>(text: string, values?: unknown[]) => {
        queries.push(text);
        if (text.includes("INSERT INTO citadela_schema_migrations")) {
          const name = String(values?.[0]);
          if (applied.has(name)) return { rows: [] as T[], rowCount: 0 };
          applied.add(name);
          return { rows: [{ name }] as T[], rowCount: 1 };
        }
        return { rows: [] as T[], rowCount: 0 };
      },
      release: () => undefined,
    };
    const pool = { connect: async () => client } as unknown as Pool;
    const migrationsDirectory = resolve(process.cwd(), "migrations");

    await runMigrations(pool, migrationsDirectory);
    const firstRunStatements = queries.length;
    await runMigrations(pool, migrationsDirectory);

    expect(applied).toEqual(new Set(["001_device_pairings.sql", "002_devices.sql", "003_metrics.sql", "004_device_access.sql", "005_device_host_role.sql"]));
    expect(queries.filter((query) => query.includes("CREATE TABLE IF NOT EXISTS device_pairings"))).toHaveLength(1);
    expect(queries.filter((query) => query.includes("CREATE TABLE IF NOT EXISTS devices"))).toHaveLength(1);
    expect(queries.length).toBeGreaterThan(firstRunStatements);
  });
});
