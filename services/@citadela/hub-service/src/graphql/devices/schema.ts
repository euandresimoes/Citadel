export const typeDefs = `#graphql
  type Device {
    id: ID!
    networkMode: String!
    connectionId: String!
    connectedAt: String!
    lastHeartbeat: String!
  }

  extend type Query {
    devices: [Device!]!
  }
`;
