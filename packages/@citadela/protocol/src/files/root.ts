import { z } from "zod";
import { FileRootIdSchema } from "./common.js";

export const FileRootSchema = z.object({
  rootId: FileRootIdSchema,
  name: z.string().trim().min(1),
  path: z.string().trim().min(1),
  readOnly: z.boolean().default(false),
}).strict();

export type FileRoot = z.infer<typeof FileRootSchema>;

