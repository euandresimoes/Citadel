import type { HubGraphqlContext } from "../context.js";
import { commandView } from "../context.js";

export const resolvers = {
  Query: {
    command: async (_parent: unknown, args: { id: string }, context: HubGraphqlContext) => {
      const command = await context.commandService.get(args.id);
      return command ? commandView(command) : null;
    },
    commands: async (_parent: unknown, args: { deviceId: string; limit?: number }, context: HubGraphqlContext) => (await context.commandService.listByDevice(args.deviceId, args.limit ?? 50)).map(commandView),
  },
};
