import { chmodSync, mkdirSync, unlinkSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname } from "node:path";
import { randomUUID } from "node:crypto";
import { connect, createServer, type Server, type Socket } from "node:net";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
export const DEFAULT_HELPER_ENDPOINT = process.platform === "win32"
  ? "\\\\.\\pipe\\citadela-privileged-helper"
  : "/run/citadela/privileged-helper.sock";

export interface ShellExecutionRequest {
  executable: string;
  args: string[];
  cwd?: string;
  timeoutMs: number;
}

export interface ShellExecutionResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export interface PrivilegedShellExecutor {
  execute(request: ShellExecutionRequest): Promise<ShellExecutionResult>;
}

export class LocalPrivilegedShellExecutor implements PrivilegedShellExecutor {
  public constructor(private readonly endpoint = DEFAULT_HELPER_ENDPOINT) {}

  public execute(request: ShellExecutionRequest): Promise<ShellExecutionResult> {
    return new Promise((resolve, reject) => {
      const socket = connect(this.endpoint);
      let buffer = "";
      const timer = setTimeout(() => {
        socket.destroy(new Error("Privileged helper request timed out"));
      }, request.timeoutMs + 2_000);
      const finish = (callback: () => void): void => { clearTimeout(timer); callback(); };
      socket.on("connect", () => socket.end(`${JSON.stringify({ id: randomUUID(), ...request })}\n`));
      socket.on("data", (chunk) => {
        buffer += chunk.toString();
        const lineEnd = buffer.indexOf("\n");
        if (lineEnd < 0) return;
        const response = JSON.parse(buffer.slice(0, lineEnd)) as { ok: boolean; result?: ShellExecutionResult; error?: string };
        finish(() => response.ok && response.result ? resolve(response.result) : reject(new Error(response.error ?? "Privileged helper failed")));
        socket.destroy();
      });
      socket.on("error", (error) => finish(() => reject(error)));
    });
  }
}

export interface PrivilegedHelper {
  close(): Promise<void>;
}

export function startPrivilegedHelper(endpoint = DEFAULT_HELPER_ENDPOINT): Promise<PrivilegedHelper> {
  if (!endpoint.startsWith("\\\\.")) {
    const directory = dirname(endpoint);
    mkdirSync(directory, { recursive: true, mode: process.env.CITADELA_HELPER_GROUP ? 0o750 : 0o700 });
    if (process.env.CITADELA_HELPER_GROUP) execFileSync("chgrp", [process.env.CITADELA_HELPER_GROUP, directory]);
  }
  const server = createServer((socket) => handleRequest(socket));
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(endpoint, () => {
      server.off("error", reject);
      if (!endpoint.startsWith("\\\\.")) {
        chmodSync(endpoint, process.env.CITADELA_HELPER_GROUP ? 0o660 : 0o600);
        if (process.env.CITADELA_HELPER_GROUP) execFileSync("chgrp", [process.env.CITADELA_HELPER_GROUP, endpoint]);
      }
      resolve({ close: () => closeServer(server, endpoint) });
    });
  });
}

function handleRequest(socket: Socket): void {
  let buffer = "";
  socket.on("data", (chunk) => {
    buffer += chunk.toString();
    const lineEnd = buffer.indexOf("\n");
    if (lineEnd < 0) return;
    const raw = buffer.slice(0, lineEnd);
    void executeRequest(raw).then((response) => socket.end(`${JSON.stringify(response)}\n`));
  });
}

async function executeRequest(raw: string): Promise<{ ok: boolean; result?: ShellExecutionResult; error?: string }> {
  try {
    const request = JSON.parse(raw) as ShellExecutionRequest;
    if (!request || typeof request.executable !== "string" || !Array.isArray(request.args)) throw new Error("Invalid privileged helper request");
    const result = await execFileAsync(request.executable, request.args, {
      cwd: request.cwd,
      timeout: request.timeoutMs,
      maxBuffer: 1_048_576,
      windowsHide: true,
    });
    return { ok: true, result: { stdout: result.stdout, stderr: result.stderr, exitCode: 0 } };
  } catch (error: unknown) {
    const commandError = error as { message?: string; stdout?: string; stderr?: string; code?: number };
    return { ok: false, error: commandError.message ?? "Privileged command failed", result: { stdout: commandError.stdout ?? "", stderr: commandError.stderr ?? "", exitCode: typeof commandError.code === "number" ? commandError.code : 1 } };
  }
}

function closeServer(server: Server, endpoint: string): Promise<void> {
  return new Promise((resolve, reject) => server.close((error) => {
    if (error) { reject(error); return; }
    if (!endpoint.startsWith("\\\\.")) {
      try { unlinkSync(endpoint); } catch { /* already removed */ }
    }
    resolve();
  }));
}
