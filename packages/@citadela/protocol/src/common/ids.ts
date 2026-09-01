import { z } from "zod";

const NonBlankIdSchema = z.string().trim().min(1);

export const DeviceIdSchema = NonBlankIdSchema;
export type DeviceId = z.infer<typeof DeviceIdSchema>;

export const CommandIdSchema = NonBlankIdSchema;
export type CommandId = z.infer<typeof CommandIdSchema>;
