export const typeDefs = `#graphql
  type Device {
    id: ID!
    networkMode: String!
    connectionId: String!
    connectedAt: String!
    lastHeartbeat: String!
    systemInfo: SystemInfo
  }

  type SystemInfo {
    hostname: String!
    platform: String!
    architecture: String!
    cpuCount: Int!
    memoryBytes: Float!
    uptimeSeconds: Int!
  }

  extend type Query {
    devices: [Device!]!
    device(id: ID!): Device
  }
`;
