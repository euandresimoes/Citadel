import { z } from "zod";
import { FileTimestampSchema, TransferIdSchema } from "./common.js";

export const FileTransferScopeSchema = z.enum([
  "file.read",
  "file.write",
  "file.delete",
]);
export type FileTransferScope = z.infer<typeof FileTransferScopeSchema>;

export const FileTransferAuthorizationSchema = z.object({
  transferId: TransferIdSchema,
  sourceDeviceId: z.string().trim().min(1),
  destinationDeviceId: z.string().trim().min(1),
  scopes: z.array(FileTransferScopeSchema).min(1).max(3),
  issuedAt: FileTimestampSchema,
  expiresAt: FileTimestampSchema,
  nonce: z.string().trim().min(16).max(256),
}).strict().refine((authorization) => (
  Date.parse(authorization.expiresAt) > Date.parse(authorization.issuedAt)
), {
  message: "Transfer authorization must expire after it is issued",
  path: ["expiresAt"],
});

export type FileTransferAuthorization = z.infer<typeof FileTransferAuthorizationSchema>;
