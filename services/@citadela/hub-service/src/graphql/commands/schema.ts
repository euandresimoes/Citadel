export const typeDefs = `#graphql
  type Command {
    id: ID!
    deviceId: ID!
    type: String!
    state: String!
    createdAt: String!
    expiresAt: String!
    confirmedAt: String
    completedAt: String
    error: String
  }

  extend type Query {
    command(id: ID!): Command
    commands(deviceId: ID!, limit: Int = 50): [Command!]!
  }
`;
