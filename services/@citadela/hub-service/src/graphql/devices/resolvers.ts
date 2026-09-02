import type { HubGraphqlContext } from "../context.js";

export const resolvers = {
  Query: {
    devices: (_parent: unknown, _args: unknown, context: HubGraphqlContext) => context.readModel.listDevices(),
    device: (_parent: unknown, args: { id: string }, context: HubGraphqlContext) => context.readModel.getDevice?.(args.id),
  },
};
