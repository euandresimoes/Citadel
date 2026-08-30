import { z } from "zod";
import {
  CommandResultSchema,
  RestartCommandSchema,
  ShutdownCommandSchema,
  SleepCommandSchema,
} from "../commands/index.js";
import { DeviceHelloMessageSchema } from "./device-hello.js";
import { DeviceHeartbeatMessageSchema } from "./device-heartbeat.js";
import { HubHelloMessageSchema } from "./hub-hello.js";
import { ProtocolErrorMessageSchema } from "./errors.js";

export * from "./device-hello.js";
export * from "./device-heartbeat.js";
export * from "./hub-hello.js";
export * from "./errors.js";

export const CitadelMessageSchema = z.discriminatedUnion("type", [
  DeviceHelloMessageSchema,
  DeviceHeartbeatMessageSchema,
  HubHelloMessageSchema,
  ProtocolErrorMessageSchema,
  RestartCommandSchema,
  ShutdownCommandSchema,
  SleepCommandSchema,
  CommandResultSchema,
]);

export type CitadelMessage = z.infer<typeof CitadelMessageSchema>;
