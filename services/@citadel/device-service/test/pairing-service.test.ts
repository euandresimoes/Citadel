import { describe, expect, it } from "vitest";
import { InMemoryPairingService } from "../src/index.js";

const identity = {
  algorithm: "ed25519" as const,
  publicKey: "public-key",
  fingerprint: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
};

describe("InMemoryPairingService", () => {
  it("requires manual approval before authorizing an identity", async () => {
    const pairing = new InMemoryPairingService();
    const request = await pairing.requestPairing("device-01", identity);

    await expect(pairing.authorize("device-01", identity)).resolves.toBe(false);
    await pairing.approve(request.requestId);
    await expect(pairing.authorize("device-01", identity)).resolves.toBe(true);
  });
});
