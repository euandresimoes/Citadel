import { Pool } from "pg";
import { PostgresPairingRepository, createPostgresPool } from "../pairing/postgres-repository.js";
import { PairingService } from "../pairing/pairing-service.js";
import { runMigrations } from "./database.js";

export interface DeviceServiceRuntime {
  pool: Pool;
  pairing: PairingService;
  migrate(): Promise<void>;
  close(): Promise<void>;
}

export function createDeviceServiceRuntime(
  databaseUrl: string,
  migrationsDirectory: string,
): DeviceServiceRuntime {
  const pool = createPostgresPool(databaseUrl);
  return {
    pool,
    pairing: new PairingService(new PostgresPairingRepository(pool)),
    migrate: () => runMigrations(pool, migrationsDirectory),
    close: () => pool.end(),
  };
}
