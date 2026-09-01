import {
  HubCommandService,
  HubHttpServer,
  InMemoryProfileRepository,
  LocalSessionManager,
  ProfileAuthenticationService,
} from "../../../../../services/@citadela/hub-service/dist/index.js";
import { InMemoryPairingService } from "../../../../../services/@citadela/device-service/dist/index.js";
import { RealtimeService } from "../../../../../services/@citadela/realtime-service/dist/index.js";

const profileAuth = new ProfileAuthenticationService(new InMemoryProfileRepository(), Buffer.alloc(32, 9));
const pairing = new InMemoryPairingService();
const realtime = new RealtimeService({ port: 4175, pairing });
const server = new HubHttpServer({
  port: 4174,
  sessions: new LocalSessionManager({ verifyPassword: () => false }),
  profileAuth,
  pairing,
  realtime,
  commands: new HubCommandService({ sendCommand: () => true }, { authorize: async () => true }),
});

await realtime.ready();
await server.ready();

async function shutdown() {
  await server.close();
  await realtime.close();
  process.exit(0);
}

process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);
