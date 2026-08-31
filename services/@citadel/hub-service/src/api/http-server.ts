import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { randomUUID } from "node:crypto";
import { HeaderMap } from "@apollo/server";
import type { Command } from "@citadel/protocol";
import { HubCommandService, type CommandRecord } from "../commands/command-service.js";
import { LocalSessionManager } from "../auth/session.js";
import { HubEventBus } from "../events/event-bus.js";
import { HubGraphqlServer } from "../graphql/server.js";
import { commandView, RealtimeDeviceDirectory, type HubReadModel, type HubSessionSource } from "../graphql/context.js";

export interface HubHttpServerOptions {
  host?: string;
  port: number;
  sessions: LocalSessionManager;
  commands: HubCommandService;
  readModel?: HubReadModel;
  realtime?: HubSessionSource & { subscribeSessionEvents(listener: (event: { type: string; session?: unknown; deviceId?: string; connectionId?: string }) => void): () => void };
  events?: HubEventBus;
}

export class HubHttpServer {
  private readonly server: Server;
  private readonly graphql = new HubGraphqlServer();
  private readonly events: HubEventBus;
  private readonly readModel: HubReadModel;
  private readonly unsubscribeSources: Array<() => void> = [];

  public constructor(private readonly options: HubHttpServerOptions) {
    this.events = options.events ?? new HubEventBus();
    this.readModel = options.readModel ?? (options.realtime ? new RealtimeDeviceDirectory(options.realtime) : { listDevices: async () => [] });
    if (options.realtime) {
      this.unsubscribeSources.push(options.realtime.subscribeSessionEvents((event) => {
        this.events.publish({ id: randomUUID(), type: event.type, data: event });
      }));
    }
    this.unsubscribeSources.push(options.commands.subscribe((record) => {
      this.events.publish({ id: randomUUID(), type: "command.updated", data: commandView(record) });
    }));
    this.server = createServer((request, response) => {
      void this.handle(request, response).catch((error: unknown) => {
        if (response.headersSent) { response.destroy(); return; }
        sendJson(response, 400, { error: error instanceof Error ? error.message : "Invalid request" });
      });
    });
    this.server.listen(options.port, options.host ?? "127.0.0.1");
  }

  public port(): number {
    const address = this.server.address();
    if (!address || typeof address === "string") throw new Error("Hub API is not listening");
    return address.port;
  }

  public async ready(): Promise<void> {
    await this.graphql.start();
    if (this.server.listening) return;
    await new Promise<void>((resolve, reject) => {
      this.server.once("listening", resolve);
      this.server.once("error", reject);
    });
  }

  public async close(): Promise<void> {
    for (const unsubscribe of this.unsubscribeSources) unsubscribe();
    await this.graphql.stop();
    await new Promise<void>((resolve, reject) => this.server.close((error) => error ? reject(error) : resolve()));
  }

  private async handle(request: IncomingMessage, response: ServerResponse): Promise<void> {
    const url = new URL(request.url ?? "/", "http://localhost");
    if (request.method === "POST" && url.pathname === "/api/v1/auth/login") { await this.login(request, response); return; }
    const session = this.options.sessions.authenticate(request);
    if (url.pathname === "/api/v1/auth/session" && request.method === "GET") {
      sendJson(response, session ? 200 : 401, session ? { actorId: session.actorId } : { error: "Unauthorized" });
      return;
    }
    if (request.method === "POST" && url.pathname === "/api/v1/auth/logout") {
      if (!session) { sendJson(response, 401, { error: "Unauthorized" }); return; }
      if (!this.options.sessions.csrfValid(request, session)) { sendJson(response, 403, { error: "Invalid CSRF token" }); return; }
      this.options.sessions.logout(request, response);
      response.writeHead(204).end();
      return;
    }
    if (!session) { sendJson(response, 401, { error: "Unauthorized" }); return; }
    if (url.pathname === "/graphql") { await this.graphqlRequest(request, response, session); return; }
    if (url.pathname === "/api/v1/events" && request.method === "GET") { this.eventsRequest(request, response); return; }
    if (request.method === "POST" && url.pathname === "/api/v1/commands") { await this.createCommand(request, response, session.actorId, session); return; }
    const confirm = url.pathname.match(/^\/api\/v1\/commands\/([^/]+)\/confirm$/);
    if (request.method === "POST" && confirm?.[1]) { await this.confirmCommand(request, response, confirm[1], session.actorId, session); return; }
    const command = url.pathname.match(/^\/api\/v1\/commands\/([^/]+)$/);
    if (request.method === "GET" && command?.[1]) {
      const record = await this.options.commands.get(command[1]);
      sendJson(response, record ? 200 : 404, record ? viewCommand(record) : { error: "Command not found" });
      return;
    }
    sendJson(response, 404, { error: "Not found" });
  }

  private async login(request: IncomingMessage, response: ServerResponse): Promise<void> {
    const body = await readJson(request);
    if (typeof body?.password !== "string" || !(await this.options.sessions.login(body.password, response))) {
      sendJson(response, 401, { error: "Invalid credentials" });
      return;
    }
    response.writeHead(204).end();
  }

  private async graphqlRequest(request: IncomingMessage, response: ServerResponse, session: { actorId: string }): Promise<void> {
    if (request.method !== "POST" && request.method !== "GET") { sendJson(response, 405, { error: "Method not allowed" }); return; }
    const body = request.method === "POST" ? await readJson(request) : undefined;
    const headers = new HeaderMap();
    for (const [key, value] of Object.entries(request.headers)) if (typeof value === "string") headers.set(key, value);
    const result = await this.graphql.execute({ method: request.method, headers, search: new URL(request.url ?? "/", "http://localhost").search, body }, {
      actorId: session.actorId,
      commandService: this.options.commands,
      readModel: this.readModel,
    });
    response.writeHead(result.status ?? 200, Object.fromEntries(result.headers));
    response.end(result.body.string);
  }

  private eventsRequest(request: IncomingMessage, response: ServerResponse): void {
    response.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache", connection: "keep-alive" });
    const lastEventId = request.headers["last-event-id"];
    for (const event of this.events.since(typeof lastEventId === "string" ? lastEventId : undefined)) writeEvent(response, event);
    const unsubscribe = this.events.subscribe((event) => writeEvent(response, event));
    request.on("close", unsubscribe);
  }

  private async createCommand(request: IncomingMessage, response: ServerResponse, actorId: string, session: { csrfToken: string }): Promise<void> {
    if (!this.options.sessions.csrfValid(request, session)) { sendJson(response, 403, { error: "Invalid CSRF token" }); return; }
    const body = await readJson(request);
    if (typeof body?.deviceId !== "string" || typeof body?.type !== "string") { sendJson(response, 400, { error: "deviceId and type are required" }); return; }
    try {
      const record = await this.options.commands.request(actorId, { deviceId: body.deviceId, type: body.type } as Omit<Command, "id">);
      sendJson(response, 202, viewCommand(record));
    } catch (error) { sendJson(response, error instanceof Error && error.name === "CommandAuthorizationError" ? 403 : 400, { error: error instanceof Error ? error.message : "Invalid command" }); }
  }

  private async confirmCommand(request: IncomingMessage, response: ServerResponse, commandId: string, actorId: string, session: { csrfToken: string }): Promise<void> {
    if (!this.options.sessions.csrfValid(request, session)) { sendJson(response, 403, { error: "Invalid CSRF token" }); return; }
    try { sendJson(response, 200, viewCommand(await this.options.commands.confirm(actorId, commandId))); }
    catch (error) { sendJson(response, error instanceof Error && error.name === "CommandAuthorizationError" ? 403 : 409, { error: error instanceof Error ? error.message : "Unable to confirm command" }); }
  }
}

function viewCommand(record: CommandRecord): Record<string, unknown> {
  return { id: record.command.id, deviceId: record.command.deviceId, type: record.command.type, state: record.state, createdAt: record.createdAt.toISOString(), expiresAt: record.expiresAt.toISOString(), confirmedAt: record.confirmedAt?.toISOString() ?? null, completedAt: record.completedAt?.toISOString() ?? null, error: record.error ?? null };
}

function sendJson(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, { "content-type": "application/json" });
  response.end(JSON.stringify(body));
}

function writeEvent(response: ServerResponse, event: { id: string; type: string; data: unknown }): void {
  response.write(`id: ${event.id}\nevent: ${event.type}\ndata: ${JSON.stringify(event.data)}\n\n`);
}

async function readJson(request: IncomingMessage): Promise<Record<string, unknown> | undefined> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(Buffer.from(chunk));
    if (Buffer.concat(chunks).length > 1_048_576) throw new Error("Request body is too large");
  }
  if (chunks.length === 0) return undefined;
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8")) as Record<string, unknown>; }
  catch { return undefined; }
}
