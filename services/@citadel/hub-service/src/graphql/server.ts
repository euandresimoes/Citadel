import { ApolloServer, HeaderMap, type HTTPGraphQLRequest } from "@apollo/server";
import { resolvers, typeDefs } from "./schema.js";
import type { HubGraphqlContext } from "./context.js";

export class HubGraphqlServer {
  private readonly server = new ApolloServer<HubGraphqlContext>({ typeDefs, resolvers, introspection: false });

  public async start(): Promise<void> { await this.server.start(); }

  public async execute(request: HTTPGraphQLRequest, context: HubGraphqlContext): Promise<{ status?: number; headers: HeaderMap; body: { kind: "complete"; string: string } }> {
    const response = await this.server.executeHTTPGraphQLRequest({ httpGraphQLRequest: request, context: async () => context });
    if (response.body.kind !== "complete") throw new Error("Streaming GraphQL responses are not enabled");
    return response as { status?: number; headers: HeaderMap; body: { kind: "complete"; string: string } };
  }

  public async stop(): Promise<void> { await this.server.stop(); }
}
