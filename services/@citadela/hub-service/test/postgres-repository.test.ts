import { describe, expect, it } from "vitest";
import { PostgresCommandRepository } from "../src/index.js";
import type { Pool } from "pg";

describe("PostgresCommandRepository", () => {
  it("persists command state transitions using parameterized queries", async () => {
    const calls: Array<{ text: string; values?: unknown[] }> = [];
    const pool = {
      query: async <T>(text: string, values?: unknown[]) => {
        calls.push({ text, values });
        return { rows: [] as T[], rowCount: 1 };
      },
    } as unknown as Pool;
    const repository = new PostgresCommandRepository(pool);
    const record = {
      command: { id: "command-1", type: "device.system.power.restart", deviceId: "device-1" } as const,
      actorId: "local-user",
      state: "awaiting_confirmation" as const,
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      expiresAt: new Date("2026-01-01T00:05:00.000Z"),
    };

    await repository.save(record);
    await repository.update({ ...record, state: "dispatched", confirmedAt: new Date("2026-01-01T00:01:00.000Z") });

    expect(calls).toHaveLength(2);
    expect(calls[0]?.text).toContain("INSERT INTO hub_commands");
    expect(calls[1]?.text).toContain("UPDATE hub_commands SET state");
    expect(calls[0]?.values?.[3]).toEqual(record.command);
  });

  it("reconstructs a command from PostgreSQL JSON payload", async () => {
    const pool = {
      query: async () => ({ rows: [{
        command_id: "command-1",
        device_id: "device-1",
        command_type: "device.system.info.request",
        command_payload: { id: "command-1", type: "device.system.info.request", deviceId: "device-1" },
        actor_id: "local-user",
        state: "succeeded",
        created_at: new Date("2026-01-01T00:00:00.000Z"),
        expires_at: new Date("2026-01-01T00:05:00.000Z"),
        confirmed_at: null,
        completed_at: new Date("2026-01-01T00:00:02.000Z"),
        error: null,
      }], rowCount: 1 }),
    } as unknown as Pool;

    await expect(new PostgresCommandRepository(pool).get("command-1")).resolves.toMatchObject({
      command: { id: "command-1", type: "device.system.info.request", deviceId: "device-1" },
      state: "succeeded",
      actorId: "local-user",
    });
  });
});
