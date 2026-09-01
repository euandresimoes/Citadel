import { z } from "zod";
import { CommandIdSchema } from "../common/index.js";

const CommandResultBaseSchema = z.object({
  type: z.literal("command.result"),
  commandId: CommandIdSchema,
}).strict();

export const CommandResultSchema = z.discriminatedUnion("success", [
  CommandResultBaseSchema.extend({
    success: z.literal(true),
    data: z.unknown().optional(),
  }),
  CommandResultBaseSchema.extend({
    success: z.literal(false),
    error: z.string().trim().min(1),
  }),
]);

export type CommandResult = z.infer<typeof CommandResultSchema>;
