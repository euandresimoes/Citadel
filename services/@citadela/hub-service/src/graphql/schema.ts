import { typeDefs as commandTypeDefs } from "./commands/schema.js";
import { resolvers as commandResolvers } from "./commands/resolvers.js";
import { typeDefs as deviceTypeDefs } from "./devices/schema.js";
import { resolvers as deviceResolvers } from "./devices/resolvers.js";

export const typeDefs = [`#graphql\n  type Query { _health: Boolean! }`, deviceTypeDefs, commandTypeDefs];
export const resolvers = {
  Query: {
    _health: () => true,
    ...deviceResolvers.Query,
    ...commandResolvers.Query,
  },
};
