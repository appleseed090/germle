/**
 * Hand-written types for the few Cloudflare D1 APIs `d1-results-store.ts` uses, in place of the
 * full `@cloudflare/workers-types` package. Rows are typed `unknown` field by field; the store
 * checks each value it reads.
 */
export interface D1Database {
  prepare(query: string): D1PreparedStatement;
}

export interface D1PreparedStatement {
  bind(...values: (string | number | null)[]): D1PreparedStatement;
  run(): Promise<{ readonly meta: { readonly changes: number } }>;
  first(): Promise<Readonly<Record<string, unknown>> | null>;
  all(): Promise<{ readonly results: readonly Readonly<Record<string, unknown>>[] }>;
}
