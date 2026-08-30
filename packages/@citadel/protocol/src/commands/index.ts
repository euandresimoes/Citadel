import { z } from "zod";
import {
  RestartCommandSchema,
  ShutdownCommandSchema,
  SleepCommandSchema,
} from "./power/index.js";

export * from "./power/index.js";
export * from "./result.js";

export const CommandSchema = z.discriminatedUnion("type", [
  RestartCommandSchema,
  ShutdownCommandSchema,
  SleepCommandSchema,
]);

export type Command = z.infer<typeof CommandSchema>;
