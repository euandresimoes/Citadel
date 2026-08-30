import { z } from "zod";
import {
  CommandResultSchema,
  RestartCommandSchema,
  ShutdownCommandSchema,
  SleepCommandSchema,
} from "../commands/index.js";
import { DeviceHelloMessageSchema } from "./device-hello.js";
import { DeviceHeartbeatMessageSchema } from "./device-heartbeat.js";

export * from "./device-hello.js";
export * from "./device-heartbeat.js";

export const CitadelMessageSchema = z.discriminatedUnion("type", [
  DeviceHelloMessageSchema,
  DeviceHeartbeatMessageSchema,
  RestartCommandSchema,
  ShutdownCommandSchema,
  SleepCommandSchema,
  CommandResultSchema,
]);

export type CitadelMessage = z.infer<typeof CitadelMessageSchema>;
