import { randomUUID } from "node:crypto";
import type { CitadelaMessage, FileItem, FileMessage, FileRoot } from "@citadela/protocol";
import { PROTOCOL_VERSION } from "@citadela/protocol";

export interface FileGatewayTransport {
  sendMessage(deviceId: string, message: CitadelaMessage): boolean;
}

type FileResponse = Extract<FileMessage, { type: "file.roots.response" | "file.list.response" | "file.stat.response" | "file.operation.accept" | "file.operation.completed" | "file.operation.failed" }>;

export class HubFileGateway {
  private readonly pending = new Map<string, { resolve: (message: FileResponse) => void; reject: (error: Error) => void; timer: NodeJS.Timeout }>();

  public constructor(private readonly transport: FileGatewayTransport, private readonly timeoutMs = 15_000) {}

  public receive(message: FileMessage): void {
    const requestId = "requestId" in message && typeof message.requestId === "string" ? message.requestId : message.type === "file.operation.accept" || message.type === "file.operation.completed" ? message.transferId : undefined;
    if (!requestId) return;
    const waiter = this.pending.get(requestId);
    if (!waiter) return;
    clearTimeout(waiter.timer);
    this.pending.delete(requestId);
    if (message.type === "file.operation.failed") waiter.reject(new Error(message.error.message));
    else waiter.resolve(message as FileResponse);
  }

  public roots(deviceId: string): Promise<FileRoot[]> {
    const requestId = randomUUID();
    return this.send(deviceId, { type: "file.roots.request", protocolVersion: PROTOCOL_VERSION, deviceId, requestId }).then((message) => {
      if (message.type !== "file.roots.response") throw new Error("Unexpected file roots response");
      return message.roots;
    });
  }

  public list(deviceId: string, rootId: string, path: string): Promise<FileItem[]> {
    const requestId = randomUUID();
    return this.send(deviceId, { type: "file.list.request", protocolVersion: PROTOCOL_VERSION, deviceId, rootId, path, pageSize: 500, requestId }).then((message) => {
      if (message.type !== "file.list.response") throw new Error("Unexpected file list response");
      return message.items;
    });
  }

  public stat(deviceId: string, rootId: string, path: string): Promise<FileItem> {
    const requestId = randomUUID();
    return this.send(deviceId, { type: "file.stat.request", protocolVersion: PROTOCOL_VERSION, deviceId, rootId, path, requestId }).then((message) => {
      if (message.type !== "file.stat.response") throw new Error("Unexpected file stat response");
      return message.item;
    });
  }

  public operation(deviceId: string, operation: Extract<FileMessage, { type: "file.operation.create" }>['operation']): Promise<FileResponse> {
    return this.send(deviceId, { type: "file.operation.create", protocolVersion: PROTOCOL_VERSION, deviceId, operation });
  }

  public close(): void {
    for (const [requestId, waiter] of this.pending) { clearTimeout(waiter.timer); waiter.reject(new Error("File gateway closed")); this.pending.delete(requestId); }
  }

  private send(deviceId: string, message: FileMessage): Promise<FileResponse> {
    return new Promise<FileResponse>((resolve, reject) => {
      const requestId = "requestId" in message && typeof message.requestId === "string" ? message.requestId : message.type === "file.operation.create" ? message.operation.operationId : undefined;
      if (!requestId) { reject(new Error("File request requires a correlation id")); return; }
      const timer = setTimeout(() => { this.pending.delete(requestId); reject(new Error("File operation timed out")); }, this.timeoutMs);
      this.pending.set(requestId, { resolve, reject, timer });
      if (!this.transport.sendMessage(deviceId, message)) { clearTimeout(timer); this.pending.delete(requestId); reject(new Error("Device is unavailable")); }
    });
  }
}
