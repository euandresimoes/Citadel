import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { PairingService } from "../pairing/pairing-service.js";

export interface PairingApiOptions {
  host?: string;
  port: number;
  authorizationToken?: string;
}

function sendJson(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, { "content-type": "application/json" });
  response.end(JSON.stringify(body));
}

function authorized(request: IncomingMessage, token?: string): boolean {
  if (!token) return true;
  return request.headers.authorization === `Bearer ${token}`;
}

export class PairingApi {
  private readonly server: Server;

  public constructor(private readonly pairing: PairingService, options: PairingApiOptions) {
    this.server = createServer((request, response) => {
      void this.handle(request, response, options.authorizationToken);
    });
    this.server.listen(options.port, options.host ?? "127.0.0.1");
  }

  public port(): number {
    const address = this.server.address();
    if (!address || typeof address === "string") throw new Error("Pairing API is not listening");
    return address.port;
  }

  public async ready(): Promise<void> {
    if (this.server.listening) return;
    await new Promise<void>((resolve, reject) => {
      this.server.once("listening", resolve);
      this.server.once("error", reject);
    });
  }

  public async close(): Promise<void> {
    await new Promise<void>((resolve, reject) => this.server.close((error) => error ? reject(error) : resolve()));
  }

  private async handle(request: IncomingMessage, response: ServerResponse, token?: string): Promise<void> {
    if (!authorized(request, token)) {
      sendJson(response, 401, { error: "Unauthorized" });
      return;
    }

    const url = new URL(request.url ?? "/", "http://localhost");
    if (request.method === "GET" && url.pathname === "/pairing/requests") {
      sendJson(response, 200, await this.pairing.listPending());
      return;
    }

    const approve = url.pathname.match(/^\/pairing\/requests\/([^/]+)\/approve$/);
    if (request.method === "POST" && approve) {
      const requestId = approve[1];
      if (!requestId) return sendJson(response, 400, { error: "Invalid request id" });
      await this.pairing.approve(requestId);
      sendJson(response, 204, null);
      return;
    }

    const reject = url.pathname.match(/^\/pairing\/requests\/([^/]+)\/reject$/);
    if (request.method === "POST" && reject) {
      const requestId = reject[1];
      if (!requestId) return sendJson(response, 400, { error: "Invalid request id" });
      await this.pairing.reject(requestId);
      sendJson(response, 204, null);
      return;
    }

    const revoke = url.pathname.match(/^\/devices\/([^/]+)\/revoke$/);
    if (request.method === "POST" && revoke) {
      const deviceId = revoke[1];
      if (!deviceId) return sendJson(response, 400, { error: "Invalid device id" });
      await this.pairing.revoke(deviceId);
      sendJson(response, 204, null);
      return;
    }

    sendJson(response, 404, { error: "Not found" });
  }
}
