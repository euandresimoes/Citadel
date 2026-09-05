import { describe, expect, it } from "vitest";
import { generate } from "otplib";
import { HubCommandService, HubEventBus, HubFileService, HubHttpServer, HubRuntime, InMemoryFileTransferRepository, InMemoryProfileRepository, LocalSessionManager, ProfileAuthenticationService } from "../src/index.js";
import { InMemoryPairingService } from "@citadela/device-service";
import { loadOrCreateIdentity, MemoryIdentityStore } from "@citadela/connector";

describe("HubHttpServer", () => {
  it("exposes authenticated file transfer lifecycle endpoints with CSRF and idempotency", async () => {
    const sessions = new LocalSessionManager({ verifyPassword: () => true });
    const fileTransfers = new HubFileService(new InMemoryFileTransferRepository());
    const events = new HubEventBus();
    const emitted: string[] = [];
    events.subscribe((event) => emitted.push(event.type));
    const server = new HubHttpServer({
      port: 0,
      sessions,
      commands: new HubCommandService({ sendCommand: () => true }, { authorize: async () => true }),
      fileTransfers,
      events,
    });
    await server.ready();
    const base = `http://127.0.0.1:${server.port()}`;

    const unauthenticated = await fetch(`${base}/api/v1/files/transfers?deviceId=device-a`);
    expect(unauthenticated.status).toBe(401);

    const login = await fetch(`${base}/api/v1/auth/login`, { method: "POST", body: JSON.stringify({ password: "secret" }) });
    const cookies = login.headers.getSetCookie();
    const cookieHeader = cookies.map((cookie) => cookie.split(";", 1)[0]).join("; ");
    const csrfCookie = cookies.find((cookie) => cookie.startsWith("citadela_csrf="));
    const csrfToken = csrfCookie?.split(";", 1)[0].split("=", 2)[1] ?? "";
    const payload = {
      sourceDeviceId: "device-a", destinationDeviceId: "device-b", sourceRootId: "root-a", sourcePath: "workspace/source.txt",
      destinationRootId: "root-b", destinationPath: "workspace/source.txt", operation: "copy", items: [], totalBytes: 0,
      mode: "hub-mediated", conflictPolicy: "ask", manifestDigest: "a".repeat(64),
    };
    const headers = { cookie: cookieHeader, "x-citadela-csrf": csrfToken, "content-type": "application/json", "idempotency-key": "transfer-1" };

    const rejected = await fetch(`${base}/api/v1/files/transfers`, { method: "POST", headers: { cookie: cookieHeader, "content-type": "application/json" }, body: JSON.stringify(payload) });
    expect(rejected.status).toBe(403);

    const created = await fetch(`${base}/api/v1/files/transfers`, { method: "POST", headers, body: JSON.stringify(payload) });
    expect(created.status).toBe(201);
    const transfer = await created.json() as { transferId: string; state: string };
    expect(transfer.state).toBe("created");
    await fileTransfers.transition(transfer.transferId, "preparing");
    await fileTransfers.transition(transfer.transferId, "transferring");

    const repeated = await fetch(`${base}/api/v1/files/transfers`, { method: "POST", headers, body: JSON.stringify(payload) });
    expect(repeated.status).toBe(201);
    await expect(repeated.json()).resolves.toMatchObject({ transferId: transfer.transferId });

    const listed = await fetch(`${base}/api/v1/files/transfers?deviceId=device-a`, { headers: { cookie: cookieHeader } });
    await expect(listed.json()).resolves.toHaveLength(1);

    const paused = await fetch(`${base}/api/v1/files/transfers/${transfer.transferId}/pause`, { method: "POST", headers: { cookie: cookieHeader, "x-citadela-csrf": csrfToken } });
    await expect(paused.json()).resolves.toMatchObject({ state: "paused" });
    const resumed = await fetch(`${base}/api/v1/files/transfers/${transfer.transferId}/resume`, { method: "POST", headers: { cookie: cookieHeader, "x-citadela-csrf": csrfToken } });
    await expect(resumed.json()).resolves.toMatchObject({ state: "transferring" });
    const cancelled = await fetch(`${base}/api/v1/files/transfers/${transfer.transferId}/cancel`, { method: "POST", headers: { cookie: cookieHeader, "x-citadela-csrf": csrfToken } });
    await expect(cancelled.json()).resolves.toMatchObject({ state: "cancelled" });
    expect(emitted).toContain("file.transfer.created");
    expect(emitted).toContain("file.transfer.updated");

    const retryable = await fileTransfers.create({ ...payload, actorId: "local-user", idempotencyKey: "transfer-2" });
    await fileTransfers.transition(retryable.job.transferId, "preparing");
    await fileTransfers.fail(retryable.job.transferId, { code: "network", message: "temporary failure", retryable: true });
    const retried = await fetch(`${base}/api/v1/files/transfers/${retryable.job.transferId}/retry`, { method: "POST", headers: { cookie: cookieHeader, "x-citadela-csrf": csrfToken } });
    await expect(retried.json()).resolves.toMatchObject({ state: "preparing", retryCount: 1, error: null });

    await server.close();
  });

  it("authenticates with a cookie and serves read-only GraphQL queries", async () => {
    const sessions = new LocalSessionManager({ verifyPassword: (password) => password === "secret" });
    const server = new HubHttpServer({
      port: 0,
      sessions,
      commands: new HubCommandService({ sendCommand: () => true }, { authorize: async () => true }),
      readModel: { listDevices: async () => [{ id: "device-1", networkMode: "lan", connectionId: "connection-1", connectedAt: "2026-01-01T00:00:00.000Z", lastHeartbeat: "2026-01-01T00:00:01.000Z" }] },
    });
    await server.ready();

    const login = await fetch(`http://127.0.0.1:${server.port()}/api/v1/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ password: "secret" }),
    });
    expect(login.status).toBe(204);
    const cookies = login.headers.getSetCookie();
    const cookieHeader = cookies.map((cookie) => cookie.split(";", 1)[0]).join("; ");

    const graphql = await fetch(`http://127.0.0.1:${server.port()}/graphql`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: cookieHeader },
      body: JSON.stringify({ query: "{ devices { id networkMode } }" }),
    });
    expect(graphql.status).toBe(200);
    await expect(graphql.json()).resolves.toEqual({ data: { devices: [{ id: "device-1", networkMode: "lan" }] } });

    await server.close();
  });

  it("rejects transfers when a known source or destination device is offline", async () => {
    const sessions = new LocalSessionManager({ verifyPassword: () => true });
    const server = new HubHttpServer({
      port: 0,
      sessions,
      commands: new HubCommandService({ sendCommand: () => true }, { authorize: async () => true }),
      fileTransfers: new HubFileService(new InMemoryFileTransferRepository()),
      readModel: { getDevice: async (id) => id === "device-a" ? { id, networkMode: "lan", connectionId: null, connectedAt: null, lastHeartbeat: "2026-01-01T00:00:00.000Z", status: "offline", capabilities: [], permissions: [] } : undefined, listDevices: async () => [] },
    });
    await server.ready();
    const login = await fetch(`http://127.0.0.1:${server.port()}/api/v1/auth/login`, { method: "POST", body: JSON.stringify({ password: "secret" }) });
    const cookies = login.headers.getSetCookie();
    const cookieHeader = cookies.map((cookie) => cookie.split(";", 1)[0]).join("; ");
    const csrfCookie = cookies.find((cookie) => cookie.startsWith("citadela_csrf="));
    const csrfToken = csrfCookie?.split(";", 1)[0].split("=", 2)[1] ?? "";
    const response = await fetch(`http://127.0.0.1:${server.port()}/api/v1/files/transfers`, { method: "POST", headers: { cookie: cookieHeader, "x-citadela-csrf": csrfToken, "content-type": "application/json" }, body: JSON.stringify({ sourceDeviceId: "device-a", destinationDeviceId: "device-b" }) });
    expect(response.status).toBe(409);
    await server.close();
  });

  it("requires CSRF protection for REST command actions", async () => {
    const sessions = new LocalSessionManager({ verifyPassword: () => true });
    const server = new HubHttpServer({
      port: 0,
      sessions,
      commands: new HubCommandService({ sendCommand: () => true }, { authorize: async () => true }),
    });
    await server.ready();
    const login = await fetch(`http://127.0.0.1:${server.port()}/api/v1/auth/login`, { method: "POST", body: JSON.stringify({ password: "secret" }) });
    const cookies = login.headers.getSetCookie();
    const cookieHeader = cookies.map((cookie) => cookie.split(";", 1)[0]).join("; ");
    const csrfCookie = cookies.find((cookie) => cookie.startsWith("citadela_csrf="));
    const csrfToken = csrfCookie?.split(";", 1)[0].split("=", 2)[1];

    const rejected = await fetch(`http://127.0.0.1:${server.port()}/api/v1/commands`, {
      method: "POST", headers: { cookie: cookieHeader, "content-type": "application/json" },
      body: JSON.stringify({ deviceId: "device-1", type: "device.system.power.restart" }),
    });
    expect(rejected.status).toBe(403);

    const accepted = await fetch(`http://127.0.0.1:${server.port()}/api/v1/commands`, {
      method: "POST", headers: { cookie: cookieHeader, "x-citadela-csrf": csrfToken ?? "", "content-type": "application/json" },
      body: JSON.stringify({ deviceId: "device-1", type: "device.system.power.restart" }),
    });
    expect(accepted.status).toBe(202);
    await expect(accepted.json()).resolves.toMatchObject({ state: "awaiting_confirmation" });

    await server.close();
  });

  it("exposes pairing through the authenticated Hub facade", async () => {
    const pairing = new InMemoryPairingService();
    const identity = loadOrCreateIdentity(new MemoryIdentityStore()).identity;
    const pending = await pairing.requestPairing("device-pairing", identity);
    const sessions = new LocalSessionManager({ verifyPassword: () => true });
    const server = new HubHttpServer({
      port: 0,
      sessions,
      pairing,
      commands: new HubCommandService({ sendCommand: () => true }, { authorize: async () => true }),
    });
    await server.ready();
    const login = await fetch(`http://127.0.0.1:${server.port()}/api/v1/auth/login`, { method: "POST", body: JSON.stringify({ password: "secret" }) });
    const cookies = login.headers.getSetCookie();
    const cookieHeader = cookies.map((cookie) => cookie.split(";", 1)[0]).join("; ");
    const csrfCookie = cookies.find((cookie) => cookie.startsWith("citadela_csrf="));
    const csrfToken = csrfCookie?.split(";", 1)[0].split("=", 2)[1] ?? "";

    const list = await fetch(`http://127.0.0.1:${server.port()}/api/v1/pairing/requests`, { headers: { cookie: cookieHeader } });
    expect(list.status).toBe(200);
    await expect(list.json()).resolves.toHaveLength(1);

    const approve = await fetch(`http://127.0.0.1:${server.port()}/api/v1/pairing/requests/${pending.requestId}/approve`, {
      method: "POST", headers: { cookie: cookieHeader, "x-citadela-csrf": csrfToken },
    });
    expect(approve.status).toBe(204);
    await expect(pairing.listPending()).resolves.toHaveLength(0);

    await server.close();
  });

  it("starts and closes the Hub Runtime as the composition root", async () => {
    const runtime = new HubRuntime({
      apiPort: 0,
      realtimePort: 0,
      sessions: new LocalSessionManager({ verifyPassword: () => true }),
      pairing: new InMemoryPairingService(),
      commandAuthorizer: { authorize: async () => true },
    });
    await runtime.ready();
    expect(runtime.api.port()).toBeGreaterThan(0);
    expect(runtime.realtime.port()).toBeGreaterThan(0);
    await runtime.close();
  });

  it("bootstraps a local profile and authenticates with the selected method", async () => {
    const profileAuth = new ProfileAuthenticationService(new InMemoryProfileRepository(), Buffer.alloc(32, 3));
    const server = new HubHttpServer({
      port: 0,
      sessions: new LocalSessionManager({ verifyPassword: () => false }),
      profileAuth,
      commands: new HubCommandService({ sendCommand: () => true }, { authorize: async () => true }),
    });
    await server.ready();
    const base = `http://127.0.0.1:${server.port()}`;
    const status = await fetch(`${base}/api/v1/setup/status`);
    await expect(status.json()).resolves.toEqual({ configured: false, profileCreated: false });
    const setup = await fetch(`${base}/api/v1/setup/profile`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ password: "a-very-strong-password", displayName: "Owner" }) });
    expect(setup.status).toBe(201);
    const setupCookies = setup.headers.getSetCookie();
    const setupCookieHeader = setupCookies.map((cookie) => cookie.split(";", 1)[0]).join("; ");
    const setupCsrfCookie = setupCookies.find((cookie) => cookie.startsWith("citadela_csrf="));
    const setupCsrfToken = setupCsrfCookie?.split(";", 1)[0].split("=", 2)[1] ?? "";

    const login = await fetch(`${base}/api/v1/auth/login`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ method: "password", credential: "a-very-strong-password" }) });
    expect(login.status).toBe(409);

    const enrollment = await fetch(`${base}/api/v1/auth/totp/enroll`, {
      method: "POST",
      headers: { cookie: setupCookieHeader, "x-citadela-csrf": setupCsrfToken },
    });
    expect(enrollment.status).toBe(200);
    const enrollmentBody = await enrollment.json() as { otpauthUri: string };
    const secret = new URL(enrollmentBody.otpauthUri).searchParams.get("secret");
    expect(secret).toBeTruthy();

    const confirmation = await fetch(`${base}/api/v1/auth/totp/confirm`, {
      method: "POST",
      headers: { cookie: setupCookieHeader, "x-citadela-csrf": setupCsrfToken, "content-type": "application/json" },
      body: JSON.stringify({ token: await generate({ secret: secret! }) }),
    });
    expect(confirmation.status).toBe(200);

    const authenticatedLogin = await fetch(`${base}/api/v1/auth/login`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ method: "password", credential: "a-very-strong-password" }) });
    expect(authenticatedLogin.status).toBe(204);
    const cookies = authenticatedLogin.headers.getSetCookie();
    const cookieHeader = cookies.map((cookie) => cookie.split(";", 1)[0]).join("; ");
    const profile = await fetch(`${base}/api/v1/auth/profile`, { headers: { cookie: cookieHeader } });
    await expect(profile.json()).resolves.toMatchObject({ displayName: "Owner", totpEnabled: true });
    await server.close();
  });
});
