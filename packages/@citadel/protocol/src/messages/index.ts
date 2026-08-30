import { z } from "zod";
import {
  CommandResultSchema,
  RestartCommandSchema,
  ShutdownCommandSchema,
  SleepCommandSchema,
  SystemInfoCommandSchema,
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

export const CitadelMessageSchema = z.discriminatedUnion("type", [
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
  CommandResultSchema,
]);

export type CitadelMessage = z.infer<typeof CitadelMessageSchema>;
