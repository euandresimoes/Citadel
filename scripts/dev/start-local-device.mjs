import { mkdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Connector, ConnectorFileService, FileIdentityStore, FilePermissionPolicyStore } from "../../apps/@citadela/connector/dist/index.js";

const root = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const stateDirectory = join(root, ".citadela", "local-device");
const filesystemRoot = process.env.CITADELA_LOCAL_DEVICE_ROOT ?? join(stateDirectory, "filesystem");
const hubUrl = process.env.CITADELA_LOCAL_DEVICE_HUB ?? "ws://127.0.0.1:45523/realtime/";

await mkdir(filesystemRoot, { recursive: true });
const identityStore = new FileIdentityStore(join(stateDirectory, "identity.json"));
const permissionPolicyStore = new FilePermissionPolicyStore(join(stateDirectory, "permissions.json"));
const fileService = new ConnectorFileService([{ rootId: "local", name: "Local device files", path: filesystemRoot }], { temporaryDirectory: join(filesystemRoot, ".citadela-transfers") });
const connector = new Connector({
  url: hubUrl,
  deviceId: process.env.CITADELA_LOCAL_DEVICE_ID ?? "hub-local",
  networkMode: "lan",
  identityStore,
  permissionPolicyStore,
  fileService,
  hostRole: "hub-host",
  autoReconnect: true,
});

try {
  const hello = await connector.connect();
  console.log(`Citadela local device connected to ${hubUrl}`);
  console.log(`Device: ${hello.deviceId}`);
  console.log(`Filesystem root: ${filesystemRoot}`);
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}

const close = () => connector.close();
process.once("SIGINT", close);
process.once("SIGTERM", close);
