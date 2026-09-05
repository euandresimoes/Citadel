import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { HubRuntime, LocalSessionManager } from "../../services/@citadela/hub-service/dist/index.js";

const root = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const databaseUrl = process.env.CITADELA_DATABASE_URL ?? `postgresql://citadela:citadela-dev-only@127.0.0.1:${process.env.CITADELA_POSTGRES_PORT ?? "5433"}/citadela`;
const encryptionKey = Buffer.from(process.env.CITADELA_PROFILE_KEY ?? "citadela-dev-key-32-bytes-long!!");
if (encryptionKey.length !== 32) throw new Error("CITADELA_PROFILE_KEY must be exactly 32 bytes");
const runtime = new HubRuntime({
  host: process.env.CITADELA_BIND_HOST ?? "0.0.0.0",
  apiPort: Number(process.env.CITADELA_API_PORT ?? 4174),
  realtimePort: Number(process.env.CITADELA_REALTIME_PORT ?? 4175),
  sessions: new LocalSessionManager({ verifyPassword: () => false }),
  commandAuthorizer: { authorize: async () => true },
  databaseUrl,
  migrationsDirectory: resolve(root, "services/@citadela/hub-service/migrations"),
  deviceMigrationsDirectory: resolve(root, "services/@citadela/device-service/migrations"),
  profileEncryptionKey: encryptionKey,
});
await runtime.ready();
console.log(`Citadela Hub listening on http://127.0.0.1:${runtime.api.port()}`);
console.log(`Citadela API Gateway listening on http://127.0.0.1:${process.env.CITADELA_GATEWAY_PORT ?? "45523"}`);
const shutdown = async () => { await runtime.close(); process.exit(0); };
process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);
