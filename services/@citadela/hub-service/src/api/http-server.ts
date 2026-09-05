import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { networkInterfaces } from "node:os";
import { randomUUID } from "node:crypto";
import { HeaderMap } from "@apollo/server";
import type { Command } from "@citadela/protocol";
import type { FileTransferRecord } from "../files/transfer-repository.js";
import type { PairingService } from "@citadela/device-service";
import { HubCommandService, type CommandRecord } from "../commands/command-service.js";
import { LocalSessionManager } from "../auth/session.js";
import { ProfileAuthenticationService, InvalidCredentialsError } from "../auth/profile-service.js";
import { HubEventBus } from "../events/event-bus.js";
import { HubGraphqlServer } from "../graphql/server.js";
import { commandView, RealtimeDeviceDirectory, type HubReadModel, type HubSessionSource } from "../graphql/context.js";
import { NetworkProviderManager, type ProviderConfig } from "../network/provider-manager.js";
import { HubFileService } from "../files/file-transfer-service.js";
import { FileTransferTokenService } from "../files/transfer-token-service.js";
import type { HubTransferCoordinator } from "../files/transfer-coordinator.js";
import type { HubFileGateway } from "../files/file-gateway.js";
import { FileOperationSchema } from "@citadela/protocol";

export interface HubHttpServerOptions {
  host?: string;
  port: number;
  sessions: LocalSessionManager;
  commands: HubCommandService;
  readModel?: HubReadModel;
  realtime?: HubSessionSource & { subscribeSessionEvents(listener: (event: { type: string; session?: unknown; deviceId?: string; connectionId?: string }) => void): () => void };
  events?: HubEventBus;
  pairing?: PairingService;
  profileAuth?: ProfileAuthenticationService;
  networkProviders?: NetworkProviderManager;
  fileTransfers?: HubFileService;
  fileTransferTokens?: FileTransferTokenService;
  transferRouter?: { registerBinaryRoute(transferId: string, sourceDeviceId: string, destinationDeviceId: string): void; unregisterBinaryRoute(transferId: string): void };
  transferCoordinator?: HubTransferCoordinator;
  fileGateway?: HubFileGateway;
}

export class HubHttpServer {
  private readonly server: Server;
  private readonly graphql = new HubGraphqlServer();
  private readonly events: HubEventBus;
  private readonly readModel: HubReadModel;
  private readonly unsubscribeSources: Array<() => void> = [];
  private readonly networkProviders: NetworkProviderManager;

  public constructor(private readonly options: HubHttpServerOptions) {
    this.events = options.events ?? new HubEventBus();
    this.networkProviders = options.networkProviders ?? new NetworkProviderManager();
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
    if (url.pathname === "/api/v1/setup/status" && request.method === "GET") {
      if (!isLoopback(request)) { sendJson(response, 403, { error: "Setup is available only from localhost" }); return; }
      if (this.options.profileAuth) {
        const profile = await this.options.profileAuth.getProfile();
        sendJson(response, 200, {
          configured: await this.options.profileAuth.isConfigured(),
          profileCreated: Boolean(profile),
          ...(profile ? { profile: { displayName: profile.displayName, avatarBase64: profile.avatarBase64 ?? null } } : {}),
        });
      } else sendJson(response, 200, { configured: true, profileCreated: true });
      return;
    }
    if (url.pathname === "/api/v1/setup/profile" && request.method === "POST") { await this.setupProfile(request, response); return; }
    if (request.method === "POST" && url.pathname === "/api/v1/auth/login") { await this.login(request, response); return; }
    const session = this.options.sessions.authenticate(request);
    if (url.pathname === "/api/v1/auth/session" && request.method === "GET") {
      sendJson(response, session ? 200 : 401, session ? { actorId: session.actorId } : { error: "Unauthorized" });
      return;
    }
    if (url.pathname === "/api/v1/auth/profile" && request.method === "GET") {
      if (!session) { sendJson(response, 401, { error: "Unauthorized" }); return; }
      if (!this.options.profileAuth) { sendJson(response, 404, { error: "Profile authentication is unavailable" }); return; }
      const profile = (await this.options.profileAuth.getProfile());
      sendJson(response, 200, profile ? { id: profile.id, displayName: profile.displayName, avatarBase64: profile.avatarBase64 ?? null, totpEnabled: Boolean(profile.totpSecretEncrypted) } : { error: "Profile is not configured" });
      return;
    }
    if (request.method === "PATCH" && url.pathname === "/api/v1/auth/profile") { if (!session) { sendJson(response, 401, { error: "Unauthorized" }); return; } await this.updateProfile(request, response, session); return; }
    if (request.method === "POST" && url.pathname === "/api/v1/auth/password") { if (!session) { sendJson(response, 401, { error: "Unauthorized" }); return; } await this.changePassword(request, response, session); return; }
    if (request.method === "POST" && url.pathname === "/api/v1/auth/totp/enroll") { if (!session) { sendJson(response, 401, { error: "Unauthorized" }); return; } await this.enrollTotp(request, response, session); return; }
    if (request.method === "POST" && url.pathname === "/api/v1/auth/totp/confirm") { if (!session) { sendJson(response, 401, { error: "Unauthorized" }); return; } await this.confirmTotp(request, response, session); return; }
    if (request.method === "POST" && url.pathname === "/api/v1/auth/totp/disable") { if (!session) { sendJson(response, 401, { error: "Unauthorized" }); return; } await this.disableTotp(request, response, session); return; }
    if (request.method === "POST" && url.pathname === "/api/v1/auth/logout") {
      if (!session) { sendJson(response, 401, { error: "Unauthorized" }); return; }
      if (!this.options.sessions.csrfValid(request, session)) { sendJson(response, 403, { error: "Invalid CSRF token" }); return; }
      this.options.sessions.logout(request, response);
      response.writeHead(204).end();
      return;
    }
    if (!session) { sendJson(response, 401, { error: "Unauthorized" }); return; }
    if (url.pathname === "/api/v1/network/connection-info" && request.method === "GET") {
      sendJson(response, 200, { interfaces: discoverPrivateIpv4Interfaces() });
      return;
    }
    if (url.pathname === "/graphql") { await this.graphqlRequest(request, response, session); return; }
    if (url.pathname === "/api/v1/events" && request.method === "GET") { this.eventsRequest(request, response); return; }
    if (url.pathname === "/api/v1/network/providers" && request.method === "GET") { sendJson(response, 200, await this.networkProviders.list()); return; }
    if (url.pathname === "/api/v1/network/providers" && request.method === "PUT") { await this.configureProvider(request, response, session); return; }
    if (url.pathname === "/api/v1/files/transfers" && request.method === "GET") { await this.listFileTransfers(url, response); return; }
    if (url.pathname === "/api/v1/files/transfers" && request.method === "POST") { await this.createFileTransfer(request, response, session); return; }
    const transferAction = url.pathname.match(/^\/api\/v1\/files\/transfers\/([^/]+)(?:\/(pause|resume|cancel|retry))?$/);
    if (request.method === "GET" && transferAction?.[1] && !transferAction[2]) { await this.getFileTransfer(response, transferAction[1]); return; }
    if (request.method === "POST" && transferAction?.[1] && transferAction[2]) { await this.controlFileTransfer(request, response, transferAction[1], transferAction[2] as "pause" | "resume" | "cancel" | "retry", session); return; }
    const filePath = url.pathname.match(/^\/api\/v1\/files\/devices\/([^/]+)\/roots$/);
    if (request.method === "GET" && filePath?.[1]) { await this.getFileRoots(response, filePath[1]); return; }
    const fileListPath = url.pathname.match(/^\/api\/v1\/files\/devices\/([^/]+)\/roots\/([^/]+)\/list$/);
    if (request.method === "GET" && fileListPath?.[1] && fileListPath[2]) { await this.listDeviceFiles(url, response, fileListPath[1], fileListPath[2]); return; }
    const fileStatPath = url.pathname.match(/^\/api\/v1\/files\/devices\/([^/]+)\/roots\/([^/]+)\/stat$/);
    if (request.method === "GET" && fileStatPath?.[1] && fileStatPath[2]) { await this.statDeviceFile(url, response, fileStatPath[1], fileStatPath[2]); return; }
    const fileOperationPath = url.pathname.match(/^\/api\/v1\/files\/devices\/([^/]+)\/operations$/);
    if (request.method === "POST" && fileOperationPath?.[1]) { await this.createFileOperation(request, response, session, fileOperationPath[1]); return; }
    if (url.pathname === "/api/v1/pairing/requests" && request.method === "GET") { await this.listPairing(response); return; }
    const pairingAction = url.pathname.match(/^\/api\/v1\/pairing\/requests\/([^/]+)\/(approve|reject)$/);
    if (request.method === "POST" && pairingAction?.[1] && pairingAction[2]) {
      const action = pairingAction[2] === "approve" ? "approve" : "reject";
      await this.pairingAction(request, response, pairingAction[1], action, session);
      return;
    }
    const revoke = url.pathname.match(/^\/api\/v1\/devices\/([^/]+)\/revoke$/);
    if (request.method === "POST" && revoke?.[1]) { await this.revokeDevice(request, response, revoke[1], session); return; }
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
    if (this.options.profileAuth) {
      if (!(await this.options.profileAuth.isConfigured())) { sendJson(response, 409, { error: "Profile setup is required" }); return; }
      const method = body?.method === "otp" ? "otp" : body?.method === "password" ? "password" : undefined;
      const credential = body?.credential;
      if (!method || typeof credential !== "string") { sendJson(response, 400, { error: "method and credential are required" }); return; }
      try { const result = await this.options.profileAuth.authenticate(method, credential); this.options.sessions.issue(result.actorId, response); response.writeHead(204).end(); }
      catch (error) { sendJson(response, error instanceof InvalidCredentialsError ? 401 : 400, { error: error instanceof Error ? error.message : "Invalid credentials" }); }
      return;
    }
    if (typeof body?.password !== "string" || !(await this.options.sessions.login(body.password, response))) {
      sendJson(response, 401, { error: "Invalid credentials" });
      return;
    }
    response.writeHead(204).end();
  }

  private async setupProfile(request: IncomingMessage, response: ServerResponse): Promise<void> {
    if (!isLoopback(request)) { sendJson(response, 403, { error: "Setup is available only from localhost" }); return; }
    if (!this.options.profileAuth) { sendJson(response, 404, { error: "Profile authentication is unavailable" }); return; }
    const body = await readJson(request);
    if (typeof body?.password !== "string") { sendJson(response, 400, { error: "password is required" }); return; }
    try {
      const profile = await this.options.profileAuth.createProfile({ password: body.password, ...(typeof body.displayName === "string" ? { displayName: body.displayName } : {}), ...(typeof body.avatarBase64 === "string" ? { avatarBase64: body.avatarBase64 } : {}) });
      this.options.sessions.issue(profile.id, response);
      sendJson(response, 201, { id: profile.id, displayName: profile.displayName, totpEnabled: false });
    } catch (error) { sendJson(response, error instanceof Error && error.name === "ProfileAlreadyConfiguredError" ? 409 : 400, { error: error instanceof Error ? error.message : "Unable to create profile" }); }
  }

  private async enrollTotp(request: IncomingMessage, response: ServerResponse, session: { actorId: string; csrfToken: string }): Promise<void> {
    if (!this.options.profileAuth) { sendJson(response, 404, { error: "Profile authentication is unavailable" }); return; }
    if (!this.options.sessions.csrfValid(request, session)) { sendJson(response, 403, { error: "Invalid CSRF token" }); return; }
    sendJson(response, 200, await this.options.profileAuth.beginTotpEnrollment());
  }

  private async updateProfile(request: IncomingMessage, response: ServerResponse, session: { actorId: string; csrfToken: string }): Promise<void> {
    if (!this.options.profileAuth) { sendJson(response, 404, { error: "Profile authentication is unavailable" }); return; }
    if (!this.options.sessions.csrfValid(request, session)) { sendJson(response, 403, { error: "Invalid CSRF token" }); return; }
    const body = await readJson(request);
    if (body?.displayName !== undefined && typeof body.displayName !== "string") { sendJson(response, 400, { error: "displayName must be a string" }); return; }
    if (body?.avatarBase64 !== undefined && body.avatarBase64 !== null && typeof body.avatarBase64 !== "string") { sendJson(response, 400, { error: "avatarBase64 must be a string or null" }); return; }
    try {
      const profile = await this.options.profileAuth.updateProfile({ ...(typeof body?.displayName === "string" ? { displayName: body.displayName } : {}), ...(body?.avatarBase64 === null ? { avatarBase64: null } : typeof body?.avatarBase64 === "string" ? { avatarBase64: body.avatarBase64 } : {}) });
      sendJson(response, 200, { id: profile.id, displayName: profile.displayName, avatarBase64: profile.avatarBase64 ?? null, totpEnabled: Boolean(profile.totpSecretEncrypted) });
    } catch (error) { sendJson(response, 400, { error: error instanceof Error ? error.message : "Unable to update profile" }); }
  }

  private async changePassword(request: IncomingMessage, response: ServerResponse, session: { actorId: string; csrfToken: string }): Promise<void> {
    if (!this.options.profileAuth) { sendJson(response, 404, { error: "Profile authentication is unavailable" }); return; }
    if (!this.options.sessions.csrfValid(request, session)) { sendJson(response, 403, { error: "Invalid CSRF token" }); return; }
    const body = await readJson(request);
    if (typeof body?.currentPassword !== "string" || typeof body.newPassword !== "string") { sendJson(response, 400, { error: "currentPassword and newPassword are required" }); return; }
    try { await this.options.profileAuth.changePassword(body.currentPassword, body.newPassword); response.writeHead(204).end(); }
    catch (error) { sendJson(response, error instanceof InvalidCredentialsError ? 401 : 400, { error: error instanceof Error ? error.message : "Unable to change password" }); }
  }

  private async confirmTotp(request: IncomingMessage, response: ServerResponse, session: { actorId: string; csrfToken: string }): Promise<void> {
    if (!this.options.profileAuth) { sendJson(response, 404, { error: "Profile authentication is unavailable" }); return; }
    if (!this.options.sessions.csrfValid(request, session)) { sendJson(response, 403, { error: "Invalid CSRF token" }); return; }
    const body = await readJson(request);
    if (typeof body?.token !== "string") { sendJson(response, 400, { error: "token is required" }); return; }
    try { sendJson(response, 200, { recoveryCodes: await this.options.profileAuth.confirmTotpEnrollment(body.token) }); }
    catch (error) { sendJson(response, 400, { error: error instanceof Error ? error.message : "Unable to confirm OTP" }); }
  }

  private async disableTotp(request: IncomingMessage, response: ServerResponse, session: { actorId: string; csrfToken: string }): Promise<void> {
    if (!this.options.profileAuth) { sendJson(response, 404, { error: "Profile authentication is unavailable" }); return; }
    if (!this.options.sessions.csrfValid(request, session)) { sendJson(response, 403, { error: "Invalid CSRF token" }); return; }
    const body = await readJson(request);
    if (typeof body?.password !== "string") { sendJson(response, 400, { error: "password is required" }); return; }
    try { await this.options.profileAuth.disableTotp(body.password); response.writeHead(204).end(); }
    catch (error) { sendJson(response, error instanceof InvalidCredentialsError ? 401 : 400, { error: error instanceof Error ? error.message : "Unable to disable OTP" }); }
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
      const command = body.type === "device.system.shell.execute"
        ? { deviceId: body.deviceId, type: body.type, executable: body.executable, args: body.args, ...(typeof body.cwd === "string" ? { cwd: body.cwd } : {}), ...(typeof body.timeoutMs === "number" ? { timeoutMs: body.timeoutMs } : {}) }
        : { deviceId: body.deviceId, type: body.type };
      const record = await this.options.commands.request(actorId, command as Omit<Command, "id">);
      sendJson(response, 202, viewCommand(record));
    } catch (error) { sendJson(response, error instanceof Error && error.name === "CommandAuthorizationError" ? 403 : 400, { error: error instanceof Error ? error.message : "Invalid command" }); }
  }

  private async configureProvider(request: IncomingMessage, response: ServerResponse, session: { csrfToken: string }): Promise<void> {
    if (!this.options.sessions.csrfValid(request, session)) { sendJson(response, 403, { error: "Invalid CSRF token" }); return; }
    const body = await readJson(request);
    if (body?.mode !== "lan" && body?.mode !== "headscale" || typeof body?.enabled !== "boolean") { sendJson(response, 400, { error: "mode and enabled are required" }); return; }
    try { sendJson(response, 200, await this.networkProviders.configure({ mode: body.mode, enabled: body.enabled, ...(typeof body.endpoint === "string" ? { endpoint: body.endpoint } : {}), ...(typeof body.controlPlaneUrl === "string" ? { controlPlaneUrl: body.controlPlaneUrl } : {}) } as ProviderConfig)); }
    catch (error) { sendJson(response, 400, { error: error instanceof Error ? error.message : "Unable to configure provider" }); }
  }

  private async listFileTransfers(url: URL, response: ServerResponse): Promise<void> {
    if (!this.options.fileTransfers) { sendJson(response, 503, { error: "File transfer service is unavailable" }); return; }
    const deviceId = url.searchParams.get("deviceId");
    if (!deviceId) { sendJson(response, 400, { error: "deviceId is required" }); return; }
    sendJson(response, 200, (await this.options.fileTransfers.listByDevice(deviceId)).map(viewFileTransfer));
  }

  private async getFileRoots(response: ServerResponse, deviceId: string): Promise<void> {
    if (!this.options.fileGateway) { sendJson(response, 503, { error: "File gateway is unavailable" }); return; }
    try { sendJson(response, 200, { roots: await this.options.fileGateway.roots(deviceId) }); }
    catch (error) { sendJson(response, 502, { error: error instanceof Error ? error.message : "Unable to read device roots" }); }
  }

  private async listDeviceFiles(url: URL, response: ServerResponse, deviceId: string, rootId: string): Promise<void> {
    if (!this.options.fileGateway) { sendJson(response, 503, { error: "File gateway is unavailable" }); return; }
    const path = url.searchParams.get("path") ?? ".";
    try { sendJson(response, 200, { rootId, path, items: await this.options.fileGateway.list(deviceId, rootId, path) }); }
    catch (error) { sendJson(response, 502, { error: error instanceof Error ? error.message : "Unable to list device files" }); }
  }

  private async statDeviceFile(url: URL, response: ServerResponse, deviceId: string, rootId: string): Promise<void> {
    if (!this.options.fileGateway) { sendJson(response, 503, { error: "File gateway is unavailable" }); return; }
    const path = url.searchParams.get("path") ?? ".";
    try { sendJson(response, 200, await this.options.fileGateway.stat(deviceId, rootId, path)); }
    catch (error) { sendJson(response, 502, { error: error instanceof Error ? error.message : "Unable to stat device file" }); }
  }

  private async createFileOperation(request: IncomingMessage, response: ServerResponse, session: { csrfToken: string }, deviceId: string): Promise<void> {
    if (!this.options.fileGateway) { sendJson(response, 503, { error: "File gateway is unavailable" }); return; }
    if (!this.options.sessions.csrfValid(request, session)) { sendJson(response, 403, { error: "Invalid CSRF token" }); return; }
    const body = await readJson(request);
    if (!body?.operation || typeof body.operation !== "object") { sendJson(response, 400, { error: "operation is required" }); return; }
    let operation;
    try {
      operation = FileOperationSchema.parse({ ...body.operation, operationId: typeof (body.operation as { operationId?: unknown }).operationId === "string" ? (body.operation as { operationId: string }).operationId : randomUUID(), deviceId });
    } catch (error) {
      sendJson(response, 400, { error: error instanceof Error ? error.message : "Invalid file operation" });
      return;
    }
    try {
      sendJson(response, 202, await this.options.fileGateway.operation(deviceId, operation));
    } catch (error) { sendJson(response, 502, { error: error instanceof Error ? error.message : "Unable to execute file operation" }); }
  }

  private async getFileTransfer(response: ServerResponse, transferId: string): Promise<void> {
    if (!this.options.fileTransfers) { sendJson(response, 503, { error: "File transfer service is unavailable" }); return; }
    const record = await this.options.fileTransfers.get(transferId);
    sendJson(response, record ? 200 : 404, record ? viewFileTransfer(record) : { error: "Transfer not found" });
  }

  private async createFileTransfer(request: IncomingMessage, response: ServerResponse, session: { actorId: string; csrfToken: string }): Promise<void> {
    if (!this.options.fileTransfers) { sendJson(response, 503, { error: "File transfer service is unavailable" }); return; }
    if (!this.options.sessions.csrfValid(request, session)) { sendJson(response, 403, { error: "Invalid CSRF token" }); return; }
    const body = await readJson(request);
    if (!body) { sendJson(response, 400, { error: "A valid JSON body is required" }); return; }
    try {
      await this.assertTransferDevicesOnline(body.sourceDeviceId, body.destinationDeviceId);
      const record = await this.options.fileTransfers.create({
        actorId: session.actorId,
        sourceDeviceId: requireString(body.sourceDeviceId, "sourceDeviceId"),
        destinationDeviceId: requireString(body.destinationDeviceId, "destinationDeviceId"),
        sourceRootId: requireString(body.sourceRootId, "sourceRootId"),
        sourcePath: requireString(body.sourcePath, "sourcePath"),
        destinationRootId: requireString(body.destinationRootId, "destinationRootId"),
        destinationPath: requireString(body.destinationPath, "destinationPath"),
        operation: body.operation === "move" ? "move" : "copy",
        items: Array.isArray(body.items) ? body.items as never[] : [],
        totalBytes: requireNumber(body.totalBytes, "totalBytes"),
        mode: body.mode === "direct" ? "direct" : "hub-mediated",
        conflictPolicy: body.conflictPolicy === "overwrite" || body.conflictPolicy === "skip" || body.conflictPolicy === "rename" || body.conflictPolicy === "resume" || body.conflictPolicy === "fail" ? body.conflictPolicy : "ask",
        manifestDigest: requireString(body.manifestDigest, "manifestDigest"),
        ...(typeof request.headers["idempotency-key"] === "string" ? { idempotencyKey: request.headers["idempotency-key"] } : {}),
      });
      this.events.publish({ id: randomUUID(), type: "file.transfer.created", data: viewFileTransfer(record) });
      const tokens = this.options.fileTransferTokens ? {
        source: this.options.fileTransferTokens.issue(record, record.job.sourceDeviceId).token,
        destination: this.options.fileTransferTokens.issue(record, record.job.destinationDeviceId).token,
      } : undefined;
      this.options.transferRouter?.registerBinaryRoute(record.job.transferId, record.job.sourceDeviceId, record.job.destinationDeviceId);
      if (this.options.transferCoordinator) {
        void this.options.transferCoordinator.start(record, tokens).catch(() => undefined);
      }
      sendJson(response, 201, { ...viewFileTransfer(record), ...(tokens ? { connectorTokens: tokens } : {}) });
    } catch (error) { sendJson(response, error instanceof Error && error.name === "FileTransferDeviceError" ? 409 : 400, { error: error instanceof Error ? error.message : "Invalid file transfer" }); }
  }

  private async assertTransferDevicesOnline(sourceDeviceId: unknown, destinationDeviceId: unknown): Promise<void> {
    if (!this.readModel.getDevice || typeof sourceDeviceId !== "string" || typeof destinationDeviceId !== "string") return;
    const [source, destination] = await Promise.all([this.readModel.getDevice(sourceDeviceId), this.readModel.getDevice(destinationDeviceId)]);
    if (!source || source.status !== "online") throw new FileTransferDeviceError("Source device is not online or authorized");
    if (!destination || destination.status !== "online") throw new FileTransferDeviceError("Destination device is not online or authorized");
  }

  private async controlFileTransfer(request: IncomingMessage, response: ServerResponse, transferId: string, action: "pause" | "resume" | "cancel" | "retry", session: { csrfToken: string }): Promise<void> {
    if (!this.options.fileTransfers) { sendJson(response, 503, { error: "File transfer service is unavailable" }); return; }
    if (!this.options.sessions.csrfValid(request, session)) { sendJson(response, 403, { error: "Invalid CSRF token" }); return; }
    try {
      const record = action === "pause" ? await this.options.fileTransfers.pause(transferId) : action === "resume" ? await this.options.fileTransfers.resume(transferId) : action === "retry" ? await this.options.fileTransfers.retry(transferId) : await this.options.fileTransfers.cancel(transferId);
      await this.options.transferCoordinator?.control(record, action);
      if (["cancelled", "completed", "failed", "expired"].includes(record.job.state)) this.options.transferRouter?.unregisterBinaryRoute(transferId);
      this.events.publish({ id: randomUUID(), type: "file.transfer.updated", data: viewFileTransfer(record) });
      sendJson(response, 200, viewFileTransfer(record));
    } catch (error) { sendJson(response, error instanceof Error && error.name === "FileTransferStateError" ? 409 : 400, { error: error instanceof Error ? error.message : "Unable to control transfer" }); }
  }

  private async listPairing(response: ServerResponse): Promise<void> {
    if (!this.options.pairing) { sendJson(response, 503, { error: "Pairing service is unavailable" }); return; }
    sendJson(response, 200, await this.options.pairing.listPending());
  }

  private async pairingAction(request: IncomingMessage, response: ServerResponse, requestId: string, action: "approve" | "reject", session: { csrfToken: string }): Promise<void> {
    if (!this.options.pairing) { sendJson(response, 503, { error: "Pairing service is unavailable" }); return; }
    if (!this.options.sessions.csrfValid(request, session)) { sendJson(response, 403, { error: "Invalid CSRF token" }); return; }
    if (action === "approve") await this.options.pairing.approve(requestId);
    else await this.options.pairing.reject(requestId);
    response.writeHead(204).end();
  }

  private async revokeDevice(request: IncomingMessage, response: ServerResponse, deviceId: string, session: { csrfToken: string }): Promise<void> {
    if (!this.options.pairing) { sendJson(response, 503, { error: "Pairing service is unavailable" }); return; }
    if (!this.options.sessions.csrfValid(request, session)) { sendJson(response, 403, { error: "Invalid CSRF token" }); return; }
    await this.options.pairing.revoke(deviceId);
    response.writeHead(204).end();
  }

  private async confirmCommand(request: IncomingMessage, response: ServerResponse, commandId: string, actorId: string, session: { csrfToken: string }): Promise<void> {
    if (!this.options.sessions.csrfValid(request, session)) { sendJson(response, 403, { error: "Invalid CSRF token" }); return; }
    try { sendJson(response, 200, viewCommand(await this.options.commands.confirm(actorId, commandId))); }
    catch (error) { sendJson(response, error instanceof Error && error.name === "CommandAuthorizationError" ? 403 : 409, { error: error instanceof Error ? error.message : "Unable to confirm command" }); }
  }
}

function discoverPrivateIpv4Interfaces(): Array<{ name: string; address: string }> {
  const addresses: Array<{ name: string; address: string; priority: number }> = [];
  for (const [interfaceName, entries] of Object.entries(networkInterfaces())) {
    const priority = interfacePriority(interfaceName);
    for (const entry of entries ?? []) {
      if (entry.family !== "IPv4" || entry.internal || !isPrivateIpv4(entry.address)) continue;
      addresses.push({ name: interfaceName, address: entry.address, priority });
    }
  }
  const configuredHost = process.env.CITADELA_PUBLIC_HOST?.trim();
  const bestPriority = addresses.reduce((best, item) => Math.min(best, item.priority), Number.POSITIVE_INFINITY);
  const configured = configuredHost && isPrivateIpv4(configuredHost)
    ? [{ name: "Configured host", address: configuredHost }]
    : [];
  return [
    ...configured,
    ...addresses
      .filter(({ priority }) => priority === bestPriority)
      .sort((left, right) => left.priority - right.priority || left.address.localeCompare(right.address))
      .map(({ name, address }) => ({ name, address })),
  ].filter((entry, index, all) => all.findIndex((candidate) => candidate.address === entry.address) === index);
}

function interfacePriority(name: string): number {
  if (/virtual|hyper-?v|wsl|docker|vpn|radmin|loopback|veth/i.test(name)) return 20;
  if (/wi-?fi|wireless|ethernet/i.test(name)) return 0;
  return 10;
}

function isPrivateIpv4(address: string): boolean {
  const octets = address.split(".").map(Number);
  if (octets.length !== 4 || octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255)) return false;
  const first = octets[0] ?? -1;
  const second = octets[1] ?? -1;
  return first === 10 || (first === 172 && second >= 16 && second <= 31) || (first === 192 && second === 168);
}

function viewCommand(record: CommandRecord): Record<string, unknown> {
  return { id: record.command.id, deviceId: record.command.deviceId, type: record.command.type, state: record.state, createdAt: record.createdAt.toISOString(), expiresAt: record.expiresAt.toISOString(), confirmedAt: record.confirmedAt?.toISOString() ?? null, completedAt: record.completedAt?.toISOString() ?? null, error: record.error ?? null };
}

function viewFileTransfer(record: FileTransferRecord): Record<string, unknown> {
  return { ...record.job, actorId: record.actorId, error: record.error ?? null };
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim().length === 0) throw new Error(`${field} is required`);
  return value;
}

function requireNumber(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) throw new Error(`${field} must be a non-negative integer`);
  return value;
}

class FileTransferDeviceError extends Error {
  public constructor(message: string) { super(message); this.name = "FileTransferDeviceError"; }
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

function isLoopback(request: IncomingMessage): boolean {
  const address = request.socket.remoteAddress;
  return address === "127.0.0.1" || address === "::1" || address === "::ffff:127.0.0.1";
}
