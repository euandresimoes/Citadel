import { randomUUID } from "node:crypto";
import type { DeviceIdentity } from "@citadel/protocol";

export interface PairingRequest {
  requestId: string;
  deviceId: string;
  identity: DeviceIdentity;
  createdAt: Date;
}

export interface PairingAuthorizer {
  authorize(deviceId: string, identity: DeviceIdentity): Promise<boolean>;
  requestPairing(deviceId: string, identity: DeviceIdentity): Promise<PairingRequest>;
}

export interface PairingRepository {
  findPaired(deviceId: string): Promise<DeviceIdentity | undefined>;
  findPending(deviceId: string, fingerprint: string): Promise<PairingRequest | undefined>;
  savePending(request: PairingRequest): Promise<void>;
  listPending(): Promise<PairingRequest[]>;
  approve(requestId: string): Promise<void>;
  reject(requestId: string): Promise<void>;
  revoke(deviceId: string): Promise<void>;
}

export class PairingService implements PairingAuthorizer {
  public constructor(private readonly repository: PairingRepository) {}

  public async authorize(deviceId: string, identity: DeviceIdentity): Promise<boolean> {
    const pairedIdentity = await this.repository.findPaired(deviceId);
    return pairedIdentity?.fingerprint === identity.fingerprint && pairedIdentity.publicKey === identity.publicKey;
  }

  public async requestPairing(deviceId: string, identity: DeviceIdentity): Promise<PairingRequest> {
    const existing = await this.repository.findPending(deviceId, identity.fingerprint);
    if (existing) return existing;
    const request: PairingRequest = { requestId: randomUUID(), deviceId, identity, createdAt: new Date() };
    await this.repository.savePending(request);
    return request;
  }

  public listPending(): Promise<PairingRequest[]> { return this.repository.listPending(); }
  public approve(requestId: string): Promise<void> { return this.repository.approve(requestId); }
  public reject(requestId: string): Promise<void> { return this.repository.reject(requestId); }
  public revoke(deviceId: string): Promise<void> { return this.repository.revoke(deviceId); }
}

export class InMemoryPairingRepository implements PairingRepository {
  private readonly pending = new Map<string, PairingRequest>();
  private readonly paired = new Map<string, DeviceIdentity>();

  public async findPaired(deviceId: string): Promise<DeviceIdentity | undefined> { return this.paired.get(deviceId); }
  public async findPending(deviceId: string, fingerprint: string): Promise<PairingRequest | undefined> {
    return [...this.pending.values()].find((request) => request.deviceId === deviceId && request.identity.fingerprint === fingerprint);
  }
  public async savePending(request: PairingRequest): Promise<void> { this.pending.set(request.requestId, request); }
  public async listPending(): Promise<PairingRequest[]> { return [...this.pending.values()]; }
  public async approve(requestId: string): Promise<void> {
    const request = this.pending.get(requestId);
    if (!request) throw new Error(`Unknown pairing request: ${requestId}`);
    this.paired.set(request.deviceId, request.identity);
    this.pending.delete(requestId);
  }
  public async reject(requestId: string): Promise<void> { this.pending.delete(requestId); }
  public async revoke(deviceId: string): Promise<void> { this.paired.delete(deviceId); }
}

export class InMemoryPairingService extends PairingService {
  public constructor() { super(new InMemoryPairingRepository()); }
}
