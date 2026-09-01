import type { Pool } from "pg";
import type { HubProfile, ProfileRepository } from "./profile-service.js";

interface ProfileRow {
  profile_id: string;
  display_name: string;
  avatar_base64: string | null;
  password_hash: string;
  totp_secret_encrypted: string | null;
  pending_totp_secret_encrypted: string | null;
  recovery_code_hashes: string[];
  created_at: Date;
  updated_at: Date;
}

function fromRow(row: ProfileRow): HubProfile {
  return {
    id: row.profile_id,
    displayName: row.display_name,
    ...(row.avatar_base64 ? { avatarBase64: row.avatar_base64 } : {}),
    passwordHash: row.password_hash,
    ...(row.totp_secret_encrypted ? { totpSecretEncrypted: row.totp_secret_encrypted } : {}),
    ...(row.pending_totp_secret_encrypted ? { pendingTotpSecretEncrypted: row.pending_totp_secret_encrypted } : {}),
    recoveryCodeHashes: row.recovery_code_hashes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class PostgresProfileRepository implements ProfileRepository {
  public constructor(private readonly pool: Pool) {}

  public async get(): Promise<HubProfile | undefined> {
    const result = await this.pool.query<ProfileRow>("SELECT * FROM hub_profile WHERE profile_id = 'local-profile'");
    return result.rows[0] ? fromRow(result.rows[0]) : undefined;
  }

  public async save(profile: HubProfile): Promise<void> {
    await this.pool.query(
      `INSERT INTO hub_profile (profile_id, display_name, avatar_base64, password_hash, totp_secret_encrypted, pending_totp_secret_encrypted, recovery_code_hashes, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [profile.id, profile.displayName, profile.avatarBase64 ?? null, profile.passwordHash, profile.totpSecretEncrypted ?? null, profile.pendingTotpSecretEncrypted ?? null, JSON.stringify(profile.recoveryCodeHashes), profile.createdAt, profile.updatedAt],
    );
  }

  public async update(profile: HubProfile): Promise<void> {
    await this.pool.query(
      `UPDATE hub_profile SET display_name = $2, avatar_base64 = $3, password_hash = $4, totp_secret_encrypted = $5, pending_totp_secret_encrypted = $6, recovery_code_hashes = $7, updated_at = $8 WHERE profile_id = $1`,
      [profile.id, profile.displayName, profile.avatarBase64 ?? null, profile.passwordHash, profile.totpSecretEncrypted ?? null, profile.pendingTotpSecretEncrypted ?? null, JSON.stringify(profile.recoveryCodeHashes), profile.updatedAt],
    );
  }
}
