import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { WebSocketServer } from "ws";
import { Connector, MemoryIdentityStore } from "../src/index.js";
import { ConnectorFileService } from "../src/filesystem/index.js";

const directories: string[] = [];

afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe("Connector file protocol handlers", () => {
  it("serves roots and executes a filesystem operation through WebSocket", async () => {
    const root = await mkdtemp(join(tmpdir(), "citadela-file-handler-"));
    directories.push(root);
    const server = new WebSocketServer({ port: 0 });
    await new Promise<void>((resolve) => server.once("listening", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Test server did not start");
    let client: import("ws").WebSocket | undefined;
    const messages: Record<string, unknown>[] = [];
    server.on("connection", (socket) => {
      client = socket;
      socket.on("message", (raw) => {
        const message = JSON.parse(raw.toString()) as Record<string, unknown>;
        messages.push(message);
        if (message.type === "device.hello") {
          socket.send(JSON.stringify({ type: "hub.hello", deviceId: message.deviceId, connectionId: message.connectionId, networkMode: message.networkMode, protocolVersion: 1, sessionId: "file-session" }));
        }
      });
    });
    const connector = new Connector({
      url: `ws://127.0.0.1:${address.port}`,
      deviceId: "device-files",
      identityStore: new MemoryIdentityStore(),
      fileService: new ConnectorFileService([{ rootId: "root-01", name: "Workspace", path: root }]),
    });
    await connector.connect();

    await expect.poll(() => client?.readyState).toBe(1);
    client?.send(JSON.stringify({ type: "file.roots.request", protocolVersion: 1, deviceId: "device-files" }));
    await expect.poll(() => messages.some((message) => message.type === "file.roots.response")).toBe(true);
    await mkdir(join(root, "destination"));
    await writeFile(join(root, "source.txt"), "content");
    client?.send(JSON.stringify({
      type: "file.operation.create",
      protocolVersion: 1,
      deviceId: "device-files",
      operation: { operationId: "copy-handler-01", type: "copy", deviceId: "device-files", rootId: "root-01", path: "source.txt", destinationRootId: "root-01", destinationPath: "destination/copied.txt" },
    }));
    await expect.poll(() => messages.some((message) => message.type === "file.operation.accept")).toBe(true);
    await expect(readFile(join(root, "destination", "copied.txt"), "utf8")).resolves.toBe("content");

    connector.close();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });
});
