import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { Connector, ConnectorFileService, MemoryIdentityStore, loadOrCreateIdentity } from "../../../../apps/@citadela/connector/src/index.js";
import { InMemoryPairingService } from "@citadela/device-service";
import { computeFileManifestDigest } from "@citadela/protocol";
import { RealtimeService } from "@citadela/realtime-service";
import { HubFileService } from "../src/files/file-transfer-service.js";
import { HubTransferCoordinator } from "../src/files/transfer-coordinator.js";
import { InMemoryFileTransferRepository } from "../src/files/transfer-repository.js";

describe("real Hub-mediated transfer", () => {
  it("transfers and commits a file between two authenticated Connectors", async () => {
    const sourceRoot = await mkdtemp(join(tmpdir(), "citadela-source-"));
    const destinationRoot = await mkdtemp(join(tmpdir(), "citadela-destination-"));
    const content = Buffer.from("Citadela real transfer integration\n");
    const sourcePath = join(sourceRoot, "hello.txt");
    await writeFile(sourcePath, content);
    const digest = createHash("sha256").update(content).digest("hex");
    const item = { itemId: "item-hello", relativePath: "hello.txt", type: "file" as const, sizeBytes: content.length, modifiedAt: new Date().toISOString(), digest };
    const manifestDigest = await computeFileManifestDigest([item]);
    const pairing = new InMemoryPairingService();
    const sourceIdentity = new MemoryIdentityStore();
    const destinationIdentity = new MemoryIdentityStore();
    for (const [deviceId, identityStore] of [["source", sourceIdentity], ["destination", destinationIdentity]] as const) {
      const request = await pairing.requestPairing(deviceId, loadOrCreateIdentity(identityStore).identity);
      await pairing.approve(request.requestId);
    }
    let coordinator: HubTransferCoordinator;
    const errors: unknown[] = [];
    const realtime = new RealtimeService({ port: 0, pairing, onMessage: (_deviceId, message) => {
      if (message.type === "protocol.error") errors.push(message);
      if (message.type === "file.transfer.ack") void coordinator.acknowledge(_deviceId, message).catch((error) => errors.push(error));
      if (message.type === "file.transfer.commit") void coordinator.commit(_deviceId, message).catch((error) => errors.push(error));
      if (message.type === "file.operation.completed") void coordinator.completed(message).catch((error) => errors.push(error));
    } });
    await realtime.ready();
    const source = new Connector({ url: `ws://127.0.0.1:${realtime.port()}`, deviceId: "source", identityStore: sourceIdentity, fileService: new ConnectorFileService([{ rootId: "source", name: "Source", path: sourceRoot }]), onMessage: (message) => { if (message.type === "protocol.error") errors.push(message); } });
    const destination = new Connector({ url: `ws://127.0.0.1:${realtime.port()}`, deviceId: "destination", identityStore: destinationIdentity, fileService: new ConnectorFileService([{ rootId: "destination", name: "Destination", path: destinationRoot }]), onMessage: (message) => { if (message.type === "protocol.error") errors.push(message); } });
    await source.connect();
    await destination.connect();
    const transfers = new HubFileService(new InMemoryFileTransferRepository());
    coordinator = new HubTransferCoordinator(transfers, realtime);
    const record = await transfers.create({ actorId: "test", sourceDeviceId: "source", destinationDeviceId: "destination", sourceRootId: "source", sourcePath: ".", destinationRootId: "destination", destinationPath: ".", operation: "copy", items: [item], totalBytes: content.length, mode: "hub-mediated", conflictPolicy: "overwrite", manifestDigest });
    await coordinator.start(record);
    await new Promise((resolve) => setTimeout(resolve, 500));
    const finalState = (await transfers.get(record.job.transferId))?.job.state;
    expect(finalState).toBe("completed");
    expect(errors).toEqual([]);
    await expect(readFile(join(destinationRoot, "hello.txt"))).resolves.toEqual(content);
    expect(await readFile(sourcePath)).toEqual(content);
    source.close();
    destination.close();
    await realtime.close();
    await rm(sourceRoot, { recursive: true, force: true });
    await rm(destinationRoot, { recursive: true, force: true });
  }, 15_000);
});
