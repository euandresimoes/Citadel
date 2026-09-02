import { InMemoryDeviceRegistry, PairingService, PostgresDeviceRegistry, PostgresPairingRepository, createPostgresPool, runMigrations, type DeviceRegistry } from "@citadela/device-service";
import { RealtimeService } from "@citadela/realtime-service";
import type { CommandAuthorizer, CommandRepository } from "../commands/command-service.js";
import { HubCommandService } from "../commands/command-service.js";
import { HubHttpServer } from "../api/http-server.js";
import { LocalSessionManager } from "../auth/session.js";
import { HubEventBus } from "../events/event-bus.js";
import { PostgresCommandRepository } from "../commands/postgres-repository.js";
import type { Pool } from "pg";
import { ProfileAuthenticationService } from "../auth/profile-service.js";
import { PostgresProfileRepository } from "../auth/postgres-repository.js";
import { PersistentDeviceDirectory } from "../graphql/context.js";
import { NetworkProviderManager, PostgresProviderRepository } from "../network/provider-manager.js";

export interface HubRuntimeOptions {
  apiPort: number;
  realtimePort: number;
  host?: string;
  sessions: LocalSessionManager;
  pairing?: PairingService;
  commandAuthorizer: CommandAuthorizer;
  events?: HubEventBus;
  commandRepository?: CommandRepository;
  databaseUrl?: string;
  migrationsDirectory?: string;
  deviceMigrationsDirectory?: string;
  profileAuth?: ProfileAuthenticationService;
  profileEncryptionKey?: Buffer;
}

export class HubRuntime {
  public readonly realtime: RealtimeService;
  public readonly commands: HubCommandService;
  public readonly api: HubHttpServer;
  public readonly pairing: PairingService;
  private readonly databasePool: Pool | undefined;
  private readonly migrationsDirectory: string | undefined;
  private readonly deviceMigrationsDirectory: string | undefined;
  private readonly usesCommandRepository: boolean;
  private readonly usesPairingRepository: boolean;
  private readonly usesProfileRepository: boolean;
  private readonly deviceRegistry: DeviceRegistry;

  public constructor(options: HubRuntimeOptions) {
    let commands: HubCommandService;
    const needsDatabasePool = Boolean(options.databaseUrl && (!options.commandRepository || !options.pairing));
    this.databasePool = needsDatabasePool && options.databaseUrl ? createPostgresPool(options.databaseUrl) : undefined;
    this.migrationsDirectory = options.migrationsDirectory;
    this.deviceMigrationsDirectory = options.deviceMigrationsDirectory;
    this.usesCommandRepository = Boolean(options.commandRepository);
    this.usesPairingRepository = Boolean(options.pairing);
    this.usesProfileRepository = Boolean(options.profileAuth || (this.databasePool && options.profileEncryptionKey));
    const pairing = options.pairing ?? (this.databasePool ? new PairingService(new PostgresPairingRepository(this.databasePool)) : undefined);
    if (!pairing) throw new Error("pairing or databaseUrl is required");
    this.pairing = pairing;
    this.deviceRegistry = this.databasePool ? new PostgresDeviceRegistry(this.databasePool) : new InMemoryDeviceRegistry();
    this.realtime = new RealtimeService({
      ...(options.host ? { host: options.host } : {}),
      port: options.realtimePort,
      pairing,
      deviceRegistry: this.deviceRegistry,
      onMessage: (deviceId, message) => {
        if (message.type === "command.result") void commands.handleResult(deviceId, message);
      },
    });
    const commandRepository = options.commandRepository ?? (this.databasePool ? new PostgresCommandRepository(this.databasePool) : undefined);
    const profileAuth = options.profileAuth ?? (this.databasePool && options.profileEncryptionKey ? new ProfileAuthenticationService(new PostgresProfileRepository(this.databasePool), options.profileEncryptionKey) : undefined);
    commands = new HubCommandService(this.realtime, options.commandAuthorizer, commandRepository);
    this.commands = commands;
    this.api = new HubHttpServer({
      ...(options.host ? { host: options.host } : {}),
      port: options.apiPort,
      sessions: options.sessions,
      commands,
      pairing,
      realtime: this.realtime,
      readModel: new PersistentDeviceDirectory(this.deviceRegistry, this.realtime),
      ...(options.events ? { events: options.events } : {}),
      ...(profileAuth ? { profileAuth } : {}),
      networkProviders: new NetworkProviderManager(this.databasePool ? new PostgresProviderRepository(this.databasePool) : undefined),
    });
  }

  public async ready(): Promise<void> {
    if (this.databasePool) {
      if (!this.migrationsDirectory && !this.usesCommandRepository) throw new Error("migrationsDirectory is required for command persistence");
      if (this.usesProfileRepository && !this.migrationsDirectory) throw new Error("migrationsDirectory is required for profile persistence");
      if (!this.deviceMigrationsDirectory && !this.usesPairingRepository) throw new Error("deviceMigrationsDirectory is required for pairing persistence");
      if (this.deviceMigrationsDirectory) await runMigrations(this.databasePool, this.deviceMigrationsDirectory);
      if (this.migrationsDirectory) await runMigrations(this.databasePool, this.migrationsDirectory);
    }
    await this.deviceRegistry.markAllOffline(new Date());
    await Promise.all([this.realtime.ready(), this.api.ready()]);
  }

  public async close(): Promise<void> {
    await this.api.close();
    await this.realtime.close();
    await this.databasePool?.end();
  }
}
