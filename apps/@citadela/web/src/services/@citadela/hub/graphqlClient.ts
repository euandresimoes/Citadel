export interface GraphqlError {
  message: string;
}

export async function query<TData>(queryText: string, variables?: Record<string, unknown>): Promise<TData> {
  const response = await fetch("/graphql", {
    method: "POST",
    credentials: "include",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ query: queryText, ...(variables ? { variables } : {}) }),
  });
  const body = await response.json() as { data?: TData; errors?: GraphqlError[] };
  if (!response.ok || body.errors?.length || body.data === undefined) {
    throw new Error(body.errors?.[0]?.message ?? `GraphQL request failed with status ${response.status}`);
  }
  return body.data;
}
