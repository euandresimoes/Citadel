import { describe, expect, it } from "vitest";
import { FileTransferTokenService, InMemoryFileTransferRepository, HubFileService } from "../src/index.js";

const input = {
  actorId: "local-user",
  sourceDeviceId: "device-a",
  destinationDeviceId: "device-b",
  sourceRootId: "root-a",
  sourcePath: "workspace/source.txt",
  destinationRootId: "root-b",
  destinationPath: "workspace/source.txt",
  operation: "copy" as const,
  items: [],
  totalBytes: 100,
  mode: "hub-mediated" as const,
  conflictPolicy: "ask" as const,
  manifestDigest: "a".repeat(64),
};

describe("HubFileService", () => {
  it("creates and retrieves a transfer job", async () => {
    const service = new HubFileService(new InMemoryFileTransferRepository());
    const record = await service.create(input);

    expect(record.job).toMatchObject({
      sourceDeviceId: "device-a",
      destinationDeviceId: "device-b",
      state: "created",
      completedBytes: 0,
    });
    await expect(service.get(record.job.transferId)).resolves.toEqual(record);
  });

  it("updates progress only through valid state transitions", async () => {
    const service = new HubFileService(new InMemoryFileTransferRepository());
    const record = await service.create(input);

    await expect(service.transition(record.job.transferId, "transferring")).rejects.toThrow();
    await service.transition(record.job.transferId, "preparing");
    await service.transition(record.job.transferId, "transferring");
    const updated = await service.updateProgress(record.job.transferId, 50, "transferring");

    expect(updated.job.completedBytes).toBe(50);
    expect(updated.job.state).toBe("transferring");
    await expect(service.transition(record.job.transferId, "created")).rejects.toThrow();
  });

  it("supports pause, resume, cancellation, and idempotent cancellation", async () => {
    const service = new HubFileService(new InMemoryFileTransferRepository());
    const record = await service.create(input);
    await service.transition(record.job.transferId, "preparing");
    await service.transition(record.job.transferId, "transferring");
    await service.pause(record.job.transferId);
    await expect(service.get(record.job.transferId)).resolves.toMatchObject({ job: { state: "paused" } });
    await service.resume(record.job.transferId);
    await service.cancel(record.job.transferId);
    await expect(service.cancel(record.job.transferId)).resolves.toMatchObject({ job: { state: "cancelled" } });
  });

  it("expires jobs past their deadline", async () => {
    const service = new HubFileService(new InMemoryFileTransferRepository(), { expirationTtlMs: 1 });
    const record = await service.create(input);
    await new Promise((resolve) => setTimeout(resolve, 5));

    await expect(service.get(record.job.transferId)).resolves.toMatchObject({ job: { state: "expired" } });
  });

  it("persists retryable failures and increments retry count on retry", async () => {
    const service = new HubFileService(new InMemoryFileTransferRepository());
    const record = await service.create(input);
    await service.transition(record.job.transferId, "preparing");
    await service.fail(record.job.transferId, { code: "network", message: "temporary", retryable: true });
    const retried = await service.retry(record.job.transferId);

    expect(retried.job).toMatchObject({ state: "preparing", retryCount: 1 });
    expect(retried.error).toBeUndefined();
  });

  it("cleans expired jobs without touching terminal jobs", async () => {
    const repository = new InMemoryFileTransferRepository();
    const service = new HubFileService(repository, { expirationTtlMs: 1 });
    const record = await service.create(input);
    await new Promise((resolve) => setTimeout(resolve, 5));

    await expect(service.cleanupExpired()).resolves.toBe(1);
    await expect(service.get(record.job.transferId)).resolves.toMatchObject({ job: { state: "expired" } });
    await expect(service.cleanupExpired()).resolves.toBe(0);
  });

  it("issues operation-scoped, expiring connector tokens", async () => {
    const service = new HubFileService(new InMemoryFileTransferRepository());
    const record = await service.create(input);
    const tokens = new FileTransferTokenService(Buffer.alloc(32, 7));
    const issued = tokens.issue(record, "device-b");

    expect(issued.claims.scopes).toEqual(["file.read", "file.write"]);
    expect(tokens.verify(issued.token, "device-b").transferId).toBe(record.job.transferId);
    expect(() => tokens.verify(issued.token, "device-a")).toThrow();
    expect(() => tokens.verify(`${issued.token}tampered`, "device-b")).toThrow();
  });
});
