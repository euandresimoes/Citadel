import { describe, expect, it } from "vitest";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { createPostgresPool, runMigrations, PostgresDeviceRegistry, PostgresPairingRepository } from "@citadela/device-service";
import { createPostgresCommandPool, PostgresCommandRepository } from "../src/index.js";
import type { CommandRecord } from "../src/index.js";
import { HubRuntime, LocalSessionManager } from "../src/index.js";
import { NetworkProviderManager, PostgresProviderRepository } from "../src/network/provider-manager.js";

const databaseUrl = process.env.CITADELA_TEST_DATABASE_URL;

describe("PostgreSQL integration", () => {
  it.skipIf(!databaseUrl)("runs Device and Hub migrations and persists records", async () => {
    const pool = createPostgresPool(databaseUrl as string);
    const hubPool = createPostgresCommandPool(databaseUrl as string);
    try {
      await runMigrations(pool, resolve(process.cwd(), "../device-service/migrations"));
      await runMigrations(pool, resolve(process.cwd(), "migrations"));

      const providers = new NetworkProviderManager(new PostgresProviderRepository(hubPool));
      await providers.configure({ mode: "headscale", enabled: true, controlPlaneUrl: "https://headscale.integration" });
      await expect(providers.list()).resolves.toEqual(expect.arrayContaining([{ mode: "headscale", enabled: true, controlPlaneUrl: "https://headscale.integration" }]));

      const pairing = new PostgresPairingRepository(pool);
      const request = {
        requestId: randomUUID(),
        deviceId: `integration-${randomUUID()}`,
        identity: { algorithm: "ed25519" as const, publicKey: "integration-key", fingerprint: "a".repeat(64) },
        createdAt: new Date(),
      };
      await pairing.savePending(request);
      await expect(pairing.findPending(request.deviceId, request.identity.fingerprint)).resolves.toMatchObject({ requestId: request.requestId });

      const registry = new PostgresDeviceRegistry(pool);
      await registry.upsertConnected(request.deviceId, request.identity, "lan", randomUUID(), new Date());
      await expect(registry.get(request.deviceId)).resolves.toMatchObject({ deviceId: request.deviceId, status: "online" });
      await registry.markAllOffline(new Date());
      await expect(registry.get(request.deviceId)).resolves.toMatchObject({ status: "offline" });

      const command = new PostgresCommandRepository(hubPool);
      const record: CommandRecord = {
        command: { id: randomUUID(), type: "device.system.info.request", deviceId: request.deviceId },
        actorId: "integration-user",
        state: "awaiting_confirmation",
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + 60_000),
      };
      await command.save(record);
      await expect(command.get(record.command.id)).resolves.toMatchObject({ command: record.command, actorId: record.actorId });

      const runtime = new HubRuntime({
        apiPort: 0,
        realtimePort: 0,
        sessions: new LocalSessionManager({ verifyPassword: () => true }),
        commandAuthorizer: { authorize: async () => true },
        databaseUrl,
        migrationsDirectory: resolve(process.cwd(), "migrations"),
        deviceMigrationsDirectory: resolve(process.cwd(), "../device-service/migrations"),
      });
      await runtime.ready();
      expect(runtime.api.port()).toBeGreaterThan(0);
      expect(runtime.realtime.port()).toBeGreaterThan(0);
      await runtime.close();
    } finally {
      await hubPool.end();
      await pool.end();
    }
  });
});
