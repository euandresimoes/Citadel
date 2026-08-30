import { randomUUID } from "node:crypto";
import type { DeviceIdentity } from "@citadel/protocol";

export interface PairingRequest {
  requestId: string;
  deviceId: string;
  identity: DeviceIdentity;
  createdAt: Date;
}

export interface PairingAuthorizer {
  authorize(deviceId: string, identity: DeviceIdentity): boolean;
  requestPairing(deviceId: string, identity: DeviceIdentity): PairingRequest;
}

export class InMemoryPairingService implements PairingAuthorizer {
  private readonly pending = new Map<string, PairingRequest>();
  private readonly paired = new Map<string, DeviceIdentity>();

  public authorize(deviceId: string, identity: DeviceIdentity): boolean {
    const pairedIdentity = this.paired.get(deviceId);
    return pairedIdentity?.fingerprint === identity.fingerprint && pairedIdentity.publicKey === identity.publicKey;
  }

  public requestPairing(deviceId: string, identity: DeviceIdentity): PairingRequest {
    const existing = [...this.pending.values()].find(
      (request) => request.deviceId === deviceId && request.identity.fingerprint === identity.fingerprint,
    );
    if (existing) return existing;

    const request: PairingRequest = {
      requestId: randomUUID(),
      deviceId,
      identity,
      createdAt: new Date(),
    };
    this.pending.set(request.requestId, request);
    return request;
  }

  public listPending(): PairingRequest[] {
    return [...this.pending.values()];
  }

  public approve(requestId: string): void {
    const request = this.pending.get(requestId);
    if (!request) throw new Error(`Unknown pairing request: ${requestId}`);
    this.paired.set(request.deviceId, request.identity);
    this.pending.delete(requestId);
  }

  public reject(requestId: string): void {
    this.pending.delete(requestId);
  }

  public revoke(deviceId: string): void {
    this.paired.delete(deviceId);
  }
}
