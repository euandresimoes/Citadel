import { describe, expect, it } from "vitest";
import { computeFileManifestDigest, type FileMessage } from "@citadela/protocol";
import { HubTransferCoordinator, HubFileService, InMemoryFileTransferRepository } from "../src/index.js";

function fakeRealtime() {
  const sent: FileMessage[] = [];
  return {
    sent,
    registerBinaryRoute: () => undefined,
    unregisterBinaryRoute: () => undefined,
    sendMessage: (_deviceId: string, message: FileMessage) => { sent.push(message); return true; },
  };
}

function fileMessage(message: FileMessage): FileMessage { return message; }

function item(itemId: string, relativePath: string) {
  return { itemId, relativePath, type: "file" as const, sizeBytes: 10, modifiedAt: new Date().toISOString(), digest: "a".repeat(64) };
}

describe("HubTransferCoordinator", () => {
  it("opens every manifest item and completes only after every destination commit", async () => {
    const realtime = fakeRealtime();
    const transfers = new HubFileService(new InMemoryFileTransferRepository());
    const items = [item("one", "a.txt"), item("two", "nested/b.txt")];
    const record = await transfers.create({ actorId: "user", sourceDeviceId: "source", destinationDeviceId: "destination", sourceRootId: "source-root", sourcePath: "in", destinationRootId: "destination-root", destinationPath: "out", operation: "copy", items, totalBytes: 20, mode: "hub-mediated", conflictPolicy: "overwrite", manifestDigest: await computeFileManifestDigest(items) });
    const coordinator = new HubTransferCoordinator(transfers, realtime as never);

    await coordinator.start(record);
    expect(realtime.sent.filter((message) => message.type === "file.transfer.open")).toHaveLength(4);
    await coordinator.completed({ type: "file.operation.completed", protocolVersion: "1.0", transferId: record.job.transferId, itemId: "one" });
    await expect(transfers.get(record.job.transferId)).resolves.toMatchObject({ job: { state: "transferring", verifiedItemIds: ["one"] } });
    await coordinator.completed({ type: "file.operation.completed", protocolVersion: "1.0", transferId: record.job.transferId, itemId: "two" });
    await expect(transfers.get(record.job.transferId)).resolves.toMatchObject({ job: { state: "completed", verifiedItemIds: ["one", "two"] } });
    expect(realtime.sent.filter((message) => message.type === "file.transfer.open").map((message) => message.type === "file.transfer.open" ? message.path : "")).toEqual(["in/a.txt", "out/a.txt", "in/nested/b.txt", "out/nested/b.txt"]);
  });

  it("does not finish a move until every source deletion is acknowledged", async () => {
    const realtime = fakeRealtime();
    const transfers = new HubFileService(new InMemoryFileTransferRepository());
    const items = [item("one", "a.txt"), item("two", "b.txt")];
    const record = await transfers.create({ actorId: "user", sourceDeviceId: "source", destinationDeviceId: "destination", sourceRootId: "source-root", sourcePath: "in", destinationRootId: "destination-root", destinationPath: "out", operation: "move", items, totalBytes: 20, mode: "hub-mediated", conflictPolicy: "overwrite", manifestDigest: await computeFileManifestDigest(items) });
    const coordinator = new HubTransferCoordinator(transfers, realtime as never);

    await coordinator.start(record);
    await coordinator.completed({ type: "file.operation.completed", protocolVersion: "1.0", transferId: record.job.transferId, itemId: "one" });
    await coordinator.completed({ type: "file.operation.completed", protocolVersion: "1.0", transferId: record.job.transferId, itemId: "two" });
    expect(realtime.sent.filter((message) => message.type === "file.operation.create")).toHaveLength(2);
    await expect(transfers.get(record.job.transferId)).resolves.toMatchObject({ job: { state: "committing" } });
    await coordinator.sourceDeleteAccepted("source", { type: "file.operation.accept", protocolVersion: "1.0", transferId: `${record.job.transferId}:delete:one`, sourceDeviceId: "source", destinationDeviceId: "hub" });
    await expect(transfers.get(record.job.transferId)).resolves.toMatchObject({ job: { state: "committing" } });
    await coordinator.sourceDeleteAccepted("source", { type: "file.operation.accept", protocolVersion: "1.0", transferId: `${record.job.transferId}:delete:two`, sourceDeviceId: "source", destinationDeviceId: "hub" });
    await expect(transfers.get(record.job.transferId)).resolves.toMatchObject({ job: { state: "completed" } });
  });

  it("persists acknowledgements and reopens active items from their checkpoints", async () => {
    const realtime = fakeRealtime();
    const transfers = new HubFileService(new InMemoryFileTransferRepository());
    const transferItem = item("one", "a.txt");
    const record = await transfers.create({ actorId: "user", sourceDeviceId: "source", destinationDeviceId: "destination", sourceRootId: "source-root", sourcePath: "in", destinationRootId: "destination-root", destinationPath: "out", operation: "copy", items: [transferItem], totalBytes: 10, mode: "hub-mediated", conflictPolicy: "overwrite", manifestDigest: await computeFileManifestDigest([transferItem]) });
    const coordinator = new HubTransferCoordinator(transfers, realtime as never);
    await coordinator.start(record);
    await coordinator.acknowledge("destination", fileMessage({ type: "file.transfer.ack", protocolVersion: 1, transferId: record.job.transferId, acknowledgement: { transferId: record.job.transferId, itemId: "one", sequence: 0, nextOffsetBytes: 10 } }));
    await expect(coordinator.acknowledge("source", fileMessage({ type: "file.transfer.ack", protocolVersion: 1, transferId: record.job.transferId, acknowledgement: { transferId: record.job.transferId, itemId: "one", sequence: 0, nextOffsetBytes: 10 } }))).rejects.toThrow("not authorized");
    await expect(transfers.get(record.job.transferId)).resolves.toMatchObject({ job: { completedBytes: 10, checkpoints: { one: 10 } } });

    const reopenedRealtime = fakeRealtime();
    const reopened = new HubTransferCoordinator(transfers, reopenedRealtime as never);
    await reopened.recoverForDevice("destination");
    expect(reopenedRealtime.sent.filter((message) => message.type === "file.transfer.open")).toEqual(expect.arrayContaining([
      expect.objectContaining({ direction: "read", resumeOffset: 10 }),
      expect.objectContaining({ direction: "write", resumeOffset: 10 }),
    ]));
  });

  it("coordinates pause, resume, cancel, and retry controls", async () => {
    const realtime = fakeRealtime();
    const transfers = new HubFileService(new InMemoryFileTransferRepository());
    const transferItem = item("one", "a.txt");
    const record = await transfers.create({ actorId: "user", sourceDeviceId: "source", destinationDeviceId: "destination", sourceRootId: "source-root", sourcePath: "in", destinationRootId: "destination-root", destinationPath: "out", operation: "copy", items: [transferItem], totalBytes: 10, mode: "hub-mediated", conflictPolicy: "overwrite", manifestDigest: await computeFileManifestDigest([transferItem]) });
    const coordinator = new HubTransferCoordinator(transfers, realtime as never);
    await coordinator.start(record);
    await coordinator.control(record, "pause");
    await expect(transfers.get(record.job.transferId)).resolves.toMatchObject({ job: { state: "paused" } });
    await coordinator.control((await transfers.get(record.job.transferId))!, "resume");
    await coordinator.control((await transfers.get(record.job.transferId))!, "cancel");
    await expect(transfers.get(record.job.transferId)).resolves.toMatchObject({ job: { state: "cancelled" } });
    const failed = await transfers.create({ actorId: "user", sourceDeviceId: "source", destinationDeviceId: "destination", sourceRootId: "source-root", sourcePath: "in", destinationRootId: "destination-root", destinationPath: "out", operation: "copy", items: [transferItem], totalBytes: 10, mode: "hub-mediated", conflictPolicy: "overwrite", manifestDigest: await computeFileManifestDigest([transferItem]) });
    await transfers.transition(failed.job.transferId, "preparing");
    await transfers.fail(failed.job.transferId, { code: "network", message: "temporary", retryable: true });
    await coordinator.control((await transfers.get(failed.job.transferId))!, "retry");
    await expect(transfers.get(failed.job.transferId)).resolves.toMatchObject({ job: { state: "transferring", retryCount: 1 } });
  });
});
