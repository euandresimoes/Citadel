import { createCipheriv, createDecipheriv, randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { generateSecret, generateURI, verify } from "otplib";
import QRCode from "qrcode";

const scrypt = promisify(scryptCallback);
const MAX_AVATAR_BYTES = 2 * 1024 * 1024;

export interface HubProfile {
  id: string;
  displayName: string;
  avatarBase64?: string;
  passwordHash: string;
  totpSecretEncrypted?: string;
  pendingTotpSecretEncrypted?: string;
  recoveryCodeHashes: string[];
  createdAt: Date;
  updatedAt: Date;
}

export interface ProfileRepository {
  get(): Promise<HubProfile | undefined>;
  save(profile: HubProfile): Promise<void>;
  update(profile: HubProfile): Promise<void>;
}

export class InMemoryProfileRepository implements ProfileRepository {
  private profile: HubProfile | undefined;
  public async get(): Promise<HubProfile | undefined> { return this.profile; }
  public async save(profile: HubProfile): Promise<void> { this.profile = profile; }
  public async update(profile: HubProfile): Promise<void> { this.profile = profile; }
}

export interface ProfileSetupInput {
  password: string;
  displayName?: string;
  avatarBase64?: string;
}

export interface TotpEnrollment {
  otpauthUri: string;
  qrCodeDataUrl: string;
}

export interface ProfileUpdateInput {
  displayName?: string;
  avatarBase64?: string | null;
}

export class ProfileAlreadyConfiguredError extends Error {}
export class InvalidCredentialsError extends Error {}

export class ProfileAuthenticationService {
  public constructor(
    private readonly repository: ProfileRepository,
    private readonly encryptionKey: Buffer = randomBytes(32),
    private readonly issuer = "Citadela",
  ) {
    if (encryptionKey.length !== 32) throw new Error("Profile encryption key must be 32 bytes");
  }

  public async isProfileCreated(): Promise<boolean> { return Boolean(await this.repository.get()); }

  public async isConfigured(): Promise<boolean> {
    const profile = await this.repository.get();
    return Boolean(profile?.totpSecretEncrypted);
  }

  public async getProfile(): Promise<HubProfile | undefined> { return this.repository.get(); }

  public async updateProfile(input: ProfileUpdateInput): Promise<HubProfile> {
    const profile = await this.requireProfile();
    if (input.displayName !== undefined) profile.displayName = input.displayName.trim() || "Admin";
    if (input.avatarBase64 !== undefined) {
      if (input.avatarBase64 === null) delete profile.avatarBase64;
      else profile.avatarBase64 = validateAvatar(input.avatarBase64);
    }
    profile.updatedAt = new Date();
    await this.repository.update(profile);
    return profile;
  }

  public async changePassword(currentPassword: string, newPassword: string): Promise<void> {
    const profile = await this.requireProfile();
    if (!(await verifySecret(currentPassword, profile.passwordHash))) throw new InvalidCredentialsError("Invalid current password");
    if (newPassword.length < 12) throw new Error("Password must contain at least 12 characters");
    profile.passwordHash = await hashSecret(newPassword);
    profile.updatedAt = new Date();
    await this.repository.update(profile);
  }

  public async createProfile(input: ProfileSetupInput): Promise<HubProfile> {
    if (await this.isProfileCreated()) throw new ProfileAlreadyConfiguredError("Hub profile is already configured");
    if (input.password.length < 12) throw new Error("Password must contain at least 12 characters");
    const now = new Date();
    const profile: HubProfile = {
      id: "local-profile",
      displayName: input.displayName?.trim() || "Admin",
      ...(input.avatarBase64 ? { avatarBase64: validateAvatar(input.avatarBase64) } : {}),
      passwordHash: await hashSecret(input.password),
      recoveryCodeHashes: [],
      createdAt: now,
      updatedAt: now,
    };
    await this.repository.save(profile);
    return profile;
  }

  public async beginTotpEnrollment(): Promise<TotpEnrollment> {
    const profile = await this.requireProfile();
    const secret = generateSecret();
    profile.pendingTotpSecretEncrypted = encrypt(secret, this.encryptionKey);
    profile.updatedAt = new Date();
    await this.repository.update(profile);
    const otpauthUri = generateURI({ issuer: this.issuer, label: profile.displayName, secret });
    return { otpauthUri, qrCodeDataUrl: await QRCode.toDataURL(otpauthUri) };
  }

  public async confirmTotpEnrollment(token: string): Promise<string[]> {
    const profile = await this.requireProfile();
    if (!profile.pendingTotpSecretEncrypted) throw new Error("No pending TOTP enrollment");
    const secret = decrypt(profile.pendingTotpSecretEncrypted, this.encryptionKey);
    if (!(await verify({ secret, token })).valid) throw new InvalidCredentialsError("Invalid OTP token");
    const recoveryCodes = Array.from({ length: 8 }, () => randomBytes(9).toString("base64url"));
    profile.totpSecretEncrypted = profile.pendingTotpSecretEncrypted;
    delete profile.pendingTotpSecretEncrypted;
    profile.recoveryCodeHashes = await Promise.all(recoveryCodes.map(hashSecret));
    profile.updatedAt = new Date();
    await this.repository.update(profile);
    return recoveryCodes;
  }

  public async disableTotp(password: string): Promise<void> {
    const profile = await this.requireProfile();
    if (!(await verifySecret(password, profile.passwordHash))) throw new InvalidCredentialsError("Invalid password");
    if (!profile.totpSecretEncrypted) throw new Error("OTP authentication is not enabled");
    delete profile.totpSecretEncrypted;
    delete profile.pendingTotpSecretEncrypted;
    profile.recoveryCodeHashes = [];
    profile.updatedAt = new Date();
    await this.repository.update(profile);
  }

  public async authenticate(method: "password" | "otp", credential: string): Promise<{ actorId: string; profile: HubProfile }> {
    const profile = await this.requireProfile();
    if (method === "password") {
      if (!(await verifySecret(credential, profile.passwordHash))) throw new InvalidCredentialsError("Invalid credentials");
      return { actorId: profile.id, profile };
    }
    if (!profile.totpSecretEncrypted) throw new InvalidCredentialsError("OTP authentication is not enabled");
    if (/^\d{6}$/.test(credential) && (await verify({ secret: decrypt(profile.totpSecretEncrypted, this.encryptionKey), token: credential })).valid) return { actorId: profile.id, profile };
    for (const [index, hash] of profile.recoveryCodeHashes.entries()) {
      if (await verifySecret(credential, hash)) {
        profile.recoveryCodeHashes.splice(index, 1);
        profile.updatedAt = new Date();
        await this.repository.update(profile);
        return { actorId: profile.id, profile };
      }
    }
    throw new InvalidCredentialsError("Invalid credentials");
  }

  private async requireProfile(): Promise<HubProfile> {
    const profile = await this.repository.get();
    if (!profile) throw new Error("Hub profile is not configured");
    return profile;
  }
}

async function hashSecret(value: string): Promise<string> {
  const salt = randomBytes(16);
  const derived = await scrypt(value, salt, 64) as Buffer;
  return `scrypt$${salt.toString("base64url")}$${derived.toString("base64url")}`;
}

async function verifySecret(value: string, encoded: string): Promise<boolean> {
  const [, saltEncoded, hashEncoded] = encoded.split("$");
  if (!saltEncoded || !hashEncoded) return false;
  const expected = Buffer.from(hashEncoded, "base64url");
  const actual = await scrypt(value, Buffer.from(saltEncoded, "base64url"), expected.length) as Buffer;
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

function encrypt(value: string, key: Buffer): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), encrypted].map((part) => part.toString("base64url")).join(".");
}

function decrypt(value: string, key: Buffer): string {
  const [ivEncoded, tagEncoded, encryptedEncoded] = value.split(".");
  if (!ivEncoded || !tagEncoded || !encryptedEncoded) throw new Error("Invalid encrypted profile secret");
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(ivEncoded, "base64url"));
  decipher.setAuthTag(Buffer.from(tagEncoded, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(encryptedEncoded, "base64url")), decipher.final()]).toString("utf8");
}

function validateAvatar(value: string): string {
  const match = value.match(/^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/);
  if (!match?.[1] || !match[2]) throw new Error("Avatar must be a PNG, JPEG, or WebP data URL");
  const bytes = Buffer.from(match[2], "base64");
  if (bytes.length > MAX_AVATAR_BYTES) throw new Error("Avatar must be smaller than 2 MB");
  const valid = match[1] === "image/png" ? bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
    : match[1] === "image/jpeg" ? bytes.subarray(0, 3).equals(Buffer.from([255, 216, 255]))
      : bytes.subarray(0, 4).toString("ascii") === "RIFF" && bytes.subarray(8, 12).toString("ascii") === "WEBP";
  if (!valid) throw new Error("Avatar content does not match its declared type");
  return value;
}
