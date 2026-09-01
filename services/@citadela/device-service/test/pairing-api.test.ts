import { describe, expect, it } from "vitest";
import { InMemoryPairingService } from "../src/index.js";
import { PairingApi } from "../src/http/pairing-api.js";

describe("PairingApi", () => {
  it("lists and approves pending requests with authorization", async () => {
    const pairing = new InMemoryPairingService();
    const identity = {
      algorithm: "ed25519" as const,
      publicKey: "public-key",
      fingerprint: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
    };
    const request = await pairing.requestPairing("device-api", identity);
    const api = new PairingApi(pairing, { port: 0, authorizationToken: "secret" });
    await api.ready();

    const unauthorized = await fetch(`http://127.0.0.1:${api.port()}/pairing/requests`);
    expect(unauthorized.status).toBe(401);
    const pending = await fetch(`http://127.0.0.1:${api.port()}/pairing/requests`, {
      headers: { authorization: "Bearer secret" },
    });
    expect((await pending.json()).map((item: { requestId: string }) => item.requestId)).toContain(request.requestId);

    const approved = await fetch(`http://127.0.0.1:${api.port()}/pairing/requests/${request.requestId}/approve`, {
      method: "POST",
      headers: { authorization: "Bearer secret" },
    });
    expect(approved.status).toBe(204);
    await expect(pairing.authorize("device-api", identity)).resolves.toBe(true);

    await api.close();
  });
});
