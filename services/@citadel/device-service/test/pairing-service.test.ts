import { describe, expect, it } from "vitest";
import { InMemoryPairingService } from "../src/index.js";

const identity = {
  algorithm: "ed25519" as const,
  publicKey: "public-key",
  fingerprint: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
};

describe("InMemoryPairingService", () => {
  it("requires manual approval before authorizing an identity", () => {
    const pairing = new InMemoryPairingService();
    const request = pairing.requestPairing("device-01", identity);

    expect(pairing.authorize("device-01", identity)).toBe(false);
    pairing.approve(request.requestId);
    expect(pairing.authorize("device-01", identity)).toBe(true);
  });
});
