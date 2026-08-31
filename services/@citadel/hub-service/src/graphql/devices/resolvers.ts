import type { HubGraphqlContext } from "../context.js";

export const resolvers = {
  Query: {
    devices: (_parent: unknown, _args: unknown, context: HubGraphqlContext) => context.readModel.listDevices(),
  },
};
