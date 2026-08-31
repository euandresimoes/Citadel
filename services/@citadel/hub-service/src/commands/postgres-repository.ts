import { Pool } from "pg";
import { CommandSchema } from "@citadel/protocol";
import type { CommandRecord, CommandRepository } from "./command-service.js";

interface CommandRow {
  command_id: string;
  device_id: string;
  command_type: string;
  command_payload: unknown;
  actor_id: string;
  state: CommandRecord["state"];
  created_at: Date;
  expires_at: Date;
  confirmed_at: Date | null;
  completed_at: Date | null;
  error: string | null;
}

function recordFromRow(row: CommandRow): CommandRecord {
  return {
    command: CommandSchema.parse(row.command_payload),
    actorId: row.actor_id,
    state: row.state,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    ...(row.confirmed_at ? { confirmedAt: row.confirmed_at } : {}),
    ...(row.completed_at ? { completedAt: row.completed_at } : {}),
    ...(row.error ? { error: row.error } : {}),
  };
}

export class PostgresCommandRepository implements CommandRepository {
  public constructor(private readonly pool: Pool) {}

  public async save(record: CommandRecord): Promise<void> {
    await this.pool.query(
      `INSERT INTO hub_commands (command_id, device_id, command_type, command_payload, actor_id, state, created_at, expires_at, confirmed_at, completed_at, error)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [record.command.id, record.command.deviceId, record.command.type, record.command, record.actorId, record.state, record.createdAt, record.expiresAt, record.confirmedAt ?? null, record.completedAt ?? null, record.error ?? null],
    );
  }

  public async get(commandId: string): Promise<CommandRecord | undefined> {
    const result = await this.pool.query<CommandRow>(
      `SELECT command_id, device_id, command_type, command_payload, actor_id, state, created_at, expires_at, confirmed_at, completed_at, error FROM hub_commands WHERE command_id = $1`,
      [commandId],
    );
    return result.rows[0] ? recordFromRow(result.rows[0]) : undefined;
  }

  public async update(record: CommandRecord): Promise<void> {
    await this.pool.query(
      `UPDATE hub_commands SET state = $2, confirmed_at = $3, completed_at = $4, error = $5 WHERE command_id = $1`,
      [record.command.id, record.state, record.confirmedAt ?? null, record.completedAt ?? null, record.error ?? null],
    );
  }
}

export function createPostgresCommandPool(connectionString: string): Pool {
  return new Pool({ connectionString, max: 10 });
}
