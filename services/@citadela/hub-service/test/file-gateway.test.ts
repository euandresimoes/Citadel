import { describe, expect, it } from "vitest";
import type { CitadelaMessage } from "@citadela/protocol";
import { HubFileGateway } from "../src/files/file-gateway.js";

describe("HubFileGateway", () => {
  it("correlates concurrent roots and directory requests without cross-talk", async () => {
    const sent: Array<{ deviceId: string; message: CitadelaMessage }> = [];
    const gateway = new HubFileGateway({ sendMessage: (deviceId, message) => { sent.push({ deviceId, message }); return true; } });
    const rootsPromise = gateway.roots("device-a");
    const listPromise = gateway.list("device-a", "root-a", ".");
    const rootsRequest = sent.find(({ message }) => message.type === "file.roots.request")?.message;
    const listRequest = sent.find(({ message }) => message.type === "file.list.request")?.message;
    if (!rootsRequest || rootsRequest.type !== "file.roots.request" || !listRequest || listRequest.type !== "file.list.request") throw new Error("Requests were not sent");
    gateway.receive({ type: "file.list.response", protocolVersion: 1, deviceId: "device-a", requestId: listRequest.requestId, rootId: "root-a", path: ".", items: [] });
    gateway.receive({ type: "file.roots.response", protocolVersion: 1, deviceId: "device-a", requestId: rootsRequest.requestId, roots: [{ rootId: "root-a", name: "Workspace", path: "/workspace", readOnly: false }] });
    await expect(listPromise).resolves.toEqual([]);
    await expect(rootsPromise).resolves.toMatchObject([{ rootId: "root-a" }]);
  });

  it("fails fast when a target device is unavailable", async () => {
    const gateway = new HubFileGateway({ sendMessage: () => false });
    await expect(gateway.stat("offline", "root", ".")).rejects.toThrow("unavailable");
  });
});
