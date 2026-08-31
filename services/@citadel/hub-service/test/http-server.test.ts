import { describe, expect, it } from "vitest";
import { HubCommandService, HubHttpServer, LocalSessionManager } from "../src/index.js";

describe("HubHttpServer", () => {
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
    const csrfCookie = cookies.find((cookie) => cookie.startsWith("citadel_csrf="));
    const csrfToken = csrfCookie?.split(";", 1)[0].split("=", 2)[1];

    const rejected = await fetch(`http://127.0.0.1:${server.port()}/api/v1/commands`, {
      method: "POST", headers: { cookie: cookieHeader, "content-type": "application/json" },
      body: JSON.stringify({ deviceId: "device-1", type: "device.system.power.restart" }),
    });
    expect(rejected.status).toBe(403);

    const accepted = await fetch(`http://127.0.0.1:${server.port()}/api/v1/commands`, {
      method: "POST", headers: { cookie: cookieHeader, "x-citadel-csrf": csrfToken ?? "", "content-type": "application/json" },
      body: JSON.stringify({ deviceId: "device-1", type: "device.system.power.restart" }),
    });
    expect(accepted.status).toBe(202);
    await expect(accepted.json()).resolves.toMatchObject({ state: "awaiting_confirmation" });

    await server.close();
  });
});
