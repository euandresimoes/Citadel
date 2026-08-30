import { createHash, generateKeyPairSync } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { DeviceIdentitySchema, type DeviceIdentity } from "@citadel/protocol";

export interface StoredIdentity {
  identity: DeviceIdentity;
  privateKey: string;
}

export interface IdentityStore {
  load(): StoredIdentity | undefined;
  save(identity: StoredIdentity): void;
}

export class MemoryIdentityStore implements IdentityStore {
  private value: StoredIdentity | undefined;

  public load(): StoredIdentity | undefined {
    return this.value;
  }

  public save(identity: StoredIdentity): void {
    this.value = identity;
  }
}

export class FileIdentityStore implements IdentityStore {
  public constructor(private readonly filePath: string) {}

  public load(): StoredIdentity | undefined {
    try {
      const parsed: unknown = JSON.parse(readFileSync(this.filePath, "utf8"));
      if (!parsed || typeof parsed !== "object" || !("identity" in parsed) || !("privateKey" in parsed)) {
        throw new Error("Invalid Connector identity file");
      }
      const value = parsed as { identity: unknown; privateKey: unknown };
      if (typeof value.privateKey !== "string") throw new Error("Invalid Connector private key");
      return { identity: DeviceIdentitySchema.parse(value.identity), privateKey: value.privateKey };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
      throw error;
    }
  }

  public save(identity: StoredIdentity): void {
    mkdirSync(dirname(this.filePath), { recursive: true });
    writeFileSync(this.filePath, `${JSON.stringify(identity, null, 2)}\n`, { mode: 0o600 });
  }
}

export function createIdentity(): StoredIdentity {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const publicKeyValue = publicKey.export({ format: "der", type: "spki" }).toString("base64");
  const privateKeyValue = privateKey.export({ format: "der", type: "pkcs8" }).toString("base64");
  const fingerprint = createHash("sha256").update(publicKeyValue).digest("hex");

  return {
    identity: DeviceIdentitySchema.parse({
      algorithm: "ed25519",
      publicKey: publicKeyValue,
      fingerprint,
    }),
    privateKey: privateKeyValue,
  };
}

export function loadOrCreateIdentity(store: IdentityStore): StoredIdentity {
  const existing = store.load();
  if (existing) return existing;
  const created = createIdentity();
  store.save(created);
  return created;
}
