import { z } from "zod";
import {
  CommandResultSchema,
  RestartCommandSchema,
  ShutdownCommandSchema,
  SleepCommandSchema,
  SystemInfoCommandSchema,
  SystemMetricsCommandSchema,
  ShellCommandSchema,
} from "../commands/index.js";
import { DeviceHelloMessageSchema } from "./device-hello.js";
import { DeviceHeartbeatMessageSchema } from "./device-heartbeat.js";
import { HubHelloMessageSchema } from "./hub-hello.js";
import { ProtocolErrorMessageSchema } from "./errors.js";
import { PairingPendingMessageSchema } from "./pairing-pending.js";
import { HubChallengeMessageSchema } from "./hub-challenge.js";
import { DeviceAuthMessageSchema } from "./device-auth.js";

export * from "./device-hello.js";
export * from "./device-heartbeat.js";
export * from "./hub-hello.js";
export * from "./errors.js";
export * from "./pairing-pending.js";
export * from "./hub-challenge.js";
export * from "./device-auth.js";
export * from "./files.js";

import { FileMessageSchema } from "./files.js";

export const CitadelaMessageSchema = z.discriminatedUnion("type", [
  DeviceHelloMessageSchema,
  DeviceHeartbeatMessageSchema,
  HubHelloMessageSchema,
  ProtocolErrorMessageSchema,
  PairingPendingMessageSchema,
  HubChallengeMessageSchema,
  DeviceAuthMessageSchema,
  RestartCommandSchema,
  ShutdownCommandSchema,
  SleepCommandSchema,
  SystemInfoCommandSchema,
  SystemMetricsCommandSchema,
  ShellCommandSchema,
  CommandResultSchema,
  ...FileMessageSchema.options,
]);

export type CitadelaMessage = z.infer<typeof CitadelaMessageSchema>;
