import { randomUUID } from "node:crypto";
import { CommandSchema, type Command, type CommandResult, type DeviceId } from "@citadela/protocol";

export type CommandState = "awaiting_confirmation" | "dispatched" | "succeeded" | "failed" | "expired";

export interface CommandRecord {
  command: Command;
  actorId: string;
  state: CommandState;
  createdAt: Date;
  expiresAt: Date;
  confirmedAt?: Date;
  completedAt?: Date;
  error?: string;
}

export interface CommandTransport {
  sendCommand(deviceId: DeviceId, command: Command): boolean;
}

export interface CommandAuthorizer {
  authorize(actorId: string, deviceId: DeviceId, command: Command): Promise<boolean>;
}

export interface CommandRepository {
  save(record: CommandRecord): Promise<void>;
  get(commandId: string): Promise<CommandRecord | undefined>;
  update(record: CommandRecord): Promise<void>;
  listByDevice(deviceId: DeviceId, limit: number): Promise<CommandRecord[]>;
}

export type CommandChangeListener = (record: CommandRecord) => void;

export class InMemoryCommandRepository implements CommandRepository {
  private readonly records = new Map<string, CommandRecord>();

  public async save(record: CommandRecord): Promise<void> { this.records.set(record.command.id, record); }
  public async get(commandId: string): Promise<CommandRecord | undefined> { return this.records.get(commandId); }
  public async update(record: CommandRecord): Promise<void> { this.records.set(record.command.id, record); }
  public async listByDevice(deviceId: DeviceId, limit: number): Promise<CommandRecord[]> {
    return [...this.records.values()].filter((record) => record.command.deviceId === deviceId).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()).slice(0, limit);
  }
}

export class CommandAuthorizationError extends Error {
  public constructor() {
    super("Actor is not authorized to execute this command");
    this.name = "CommandAuthorizationError";
  }
}

export class CommandStateError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "CommandStateError";
  }
}

export class HubCommandService {
  private readonly listeners = new Set<CommandChangeListener>();

  public constructor(
    private readonly transport: CommandTransport,
    private readonly authorizer: CommandAuthorizer,
    private readonly repository: CommandRepository = new InMemoryCommandRepository(),
    private readonly confirmationTtlMs = 5 * 60_000,
  ) {}

  public subscribe(listener: CommandChangeListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  public async request(actorId: string, command: Omit<Command, "id">): Promise<CommandRecord> {
    const commandWithId = CommandSchema.parse({ ...command, id: randomUUID() });
    if (!(await this.authorizer.authorize(actorId, commandWithId.deviceId, commandWithId))) {
      throw new CommandAuthorizationError();
    }

    const now = new Date();
    const record: CommandRecord = {
      command: commandWithId,
      actorId,
      state: requiresConfirmation(commandWithId) ? "awaiting_confirmation" : "dispatched",
      createdAt: now,
      expiresAt: new Date(now.getTime() + this.confirmationTtlMs),
    };
    await this.repository.save(record);
    this.emit(record);
    if (record.state === "dispatched") await this.dispatch(record);
    return record;
  }

  public async confirm(actorId: string, commandId: string): Promise<CommandRecord> {
    const record = await this.requireRecord(commandId);
    this.expireIfNeeded(record);
    if (record.actorId !== actorId) throw new CommandAuthorizationError();
    if (record.state !== "awaiting_confirmation") {
      throw new CommandStateError(`Command cannot be confirmed from state: ${record.state}`);
    }
    if (!(await this.authorizer.authorize(actorId, record.command.deviceId, record.command))) {
      throw new CommandAuthorizationError();
    }
    record.confirmedAt = new Date();
    record.state = "dispatched";
    await this.repository.update(record);
    this.emit(record);
    await this.dispatch(record);
    return record;
  }

  public async handleResult(deviceId: DeviceId, result: CommandResult): Promise<CommandRecord | undefined> {
    const record = await this.repository.get(result.commandId);
    if (!record || record.command.deviceId !== deviceId || record.state !== "dispatched") return undefined;
    record.state = result.success ? "succeeded" : "failed";
    record.completedAt = new Date();
    if (result.success === false) record.error = result.error;
    await this.repository.update(record);
    this.emit(record);
    return record;
  }

  public async get(commandId: string): Promise<CommandRecord | undefined> {
    const record = await this.repository.get(commandId);
    if (record) {
      const previousState = record.state;
      this.expireIfNeeded(record);
      await this.repository.update(record);
      if (previousState !== record.state) this.emit(record);
    }
    return record;
  }

  public async listByDevice(deviceId: DeviceId, limit = 50): Promise<CommandRecord[]> {
    return this.repository.listByDevice(deviceId, Math.min(Math.max(limit, 1), 100));
  }

  private async requireRecord(commandId: string): Promise<CommandRecord> {
    const record = await this.repository.get(commandId);
    if (!record) throw new CommandStateError(`Unknown command: ${commandId}`);
    return record;
  }

  private async dispatch(record: CommandRecord): Promise<void> {
    if (this.transport.sendCommand(record.command.deviceId, record.command)) return;
    record.state = "failed";
    record.error = "Device is offline";
    record.completedAt = new Date();
    await this.repository.update(record);
    this.emit(record);
  }

  private emit(record: CommandRecord): void {
    for (const listener of this.listeners) listener(record);
  }

  private expireIfNeeded(record: CommandRecord): void {
    if (record.state === "awaiting_confirmation" && record.expiresAt.getTime() <= Date.now()) {
      record.state = "expired";
      record.completedAt = new Date();
    }
  }
}

function requiresConfirmation(command: Command): boolean {
  return command.type === "device.system.power.sleep"
    || command.type === "device.system.power.restart"
    || command.type === "device.system.power.shutdown"
    || command.type === "device.system.shell.execute";
}
