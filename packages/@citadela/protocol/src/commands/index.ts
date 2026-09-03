import { z } from "zod";
import {
  RestartCommandSchema,
  ShutdownCommandSchema,
  SleepCommandSchema,
} from "./power/index.js";
import { ShellCommandSchema, SystemInfoCommandSchema, SystemMetricsCommandSchema } from "./system/index.js";

export * from "./power/index.js";
export * from "./result.js";
export * from "./system/index.js";

export const CommandSchema = z.discriminatedUnion("type", [
  RestartCommandSchema,
  ShutdownCommandSchema,
  SleepCommandSchema,
  SystemInfoCommandSchema,
  SystemMetricsCommandSchema,
  ShellCommandSchema,
]);

export type Command = z.infer<typeof CommandSchema>;
