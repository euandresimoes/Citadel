export const typeDefs = `#graphql
  type Device {
    id: ID!
    networkMode: String!
    connectionId: String
    connectedAt: String
    lastHeartbeat: String!
    status: String!
    systemInfo: SystemInfo
    metrics: SystemMetrics
    capabilities: [String!]!
    permissions: [String!]!
    hostRole: String!
  }

  type SystemMetrics { cpuLoadPercent: Float! memoryUsedBytes: Float! memoryTotalBytes: Float! collectedAt: String! }

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
