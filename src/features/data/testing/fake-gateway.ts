/**
 * In-memory stand-in for the Blocks Data gateway, for unit tests only.
 *
 * Understands exactly the GraphQL shapes services.ts sends:
 *   get<Q>(where: $where, order: $order, paging: $paging) { … items { F } }
 *   insert<S>(input: $input) / i<n>: insert<S>(input: $input<n>)
 *   update<S>(where: $where, input: $input)
 *   delete<S>(where: $where)            (soft delete: removes ONE match per call, like the live gateway;
 *                                        nothing matched → acknowledged: false)
 * Filters: { Field: { eq | neq | in } }, all conditions ANDed.
 */
export type Rec = Record<string, unknown> & { ItemId: string };
type Schema = "Doc" | "DocVersion" | "Page" | "DocSource" | "Comment";

const QUERY_TO_SCHEMA: Record<string, Schema> = {
  getDocs: "Doc",
  getDocVersions: "DocVersion",
  getPages: "Page",
  getDocSources: "DocSource",
  getComments: "Comment",
};

export interface RequestLog {
  kind: "query" | "mutation";
  ops: string[];
  variables: Record<string, unknown>;
}

export type FailHook = (req: RequestLog, index: number) => void | Promise<void>;

export class FakeGateway {
  readonly tables: Record<Schema, Map<string, Rec>> = {
    Doc: new Map(),
    DocVersion: new Map(),
    Page: new Map(),
    DocSource: new Map(),
    Comment: new Map(),
  };
  readonly log: RequestLog[] = [];
  private seq = 0;
  private clock = Date.parse("2026-01-01T00:00:00Z");
  failHook: FailHook | null = null;

  /** Insert a record directly (fixture setup); not logged. */
  seed(schema: Schema, rec: Partial<Rec> & Record<string, unknown>): Rec {
    const full = this.stamp(schema, rec);
    this.tables[schema].set(full.ItemId, full);
    return full;
  }

  all(schema: Schema): Rec[] {
    return [...this.tables[schema].values()];
  }

  get(schema: Schema, id: string): Rec | undefined {
    return this.tables[schema].get(id);
  }

  mutations(): RequestLog[] {
    return this.log.filter((r) => r.kind === "mutation");
  }

  resetLog() {
    this.log.length = 0;
  }

  private stamp(schema: Schema, rec: Record<string, unknown>): Rec {
    this.clock += 1000;
    const ItemId = (rec.ItemId as string) ?? `${schema}-${++this.seq}`;
    return { CreatedDate: new Date(this.clock).toISOString(), ...rec, ItemId };
  }

  graphql = async (req: { query: string; variables?: Record<string, unknown> }) => {
    const variables = req.variables ?? {};
    const isMutation = /^\s*mutation/.test(req.query);
    const ops = [...req.query.matchAll(/(?:(\w+):\s*)?((?:get|insert|update|delete)\w+)\(/g)].map(
      (m) => m[2],
    );
    const entry: RequestLog = { kind: isMutation ? "mutation" : "query", ops, variables };
    this.log.push(entry);
    if (this.failHook) await this.failHook(entry, this.log.length - 1);

    const data: Record<string, unknown> = {};
    if (!isMutation) {
      const m = /(get\w+)\(where: \$where, order: \$order, paging: \$paging\)/.exec(req.query);
      const fields = /items\s*\{([^}]*)\}/.exec(req.query)?.[1].trim().split(/\s+/) ?? [];
      if (!m) throw new Error(`fake gateway: unsupported query ${req.query}`);
      data[m[1]] = this.list(QUERY_TO_SCHEMA[m[1]], variables, fields);
      return { data };
    }

    for (const m of req.query.matchAll(/(?:(\w+):\s*)?(insert|update|delete)(DocVersion|DocSource|Doc|Page|Comment)\(([^)]*)\)/g)) {
      const [, alias, verb, schema, args] = m;
      const key = alias ?? `${verb}${schema}`;
      const inputVar = /input: \$(\w+)/.exec(args)?.[1];
      const s = schema as Schema;
      if (verb === "insert") {
        const rec = this.stamp(s, { ...(variables[inputVar!] as object) });
        this.tables[s].set(rec.ItemId, rec);
        data[key] = { acknowledged: true, itemId: rec.ItemId, totalImpactedData: 1, message: null };
      } else if (verb === "update") {
        const matches = this.filter(s, variables.where as Record<string, unknown>);
        for (const r of matches) Object.assign(r, variables[inputVar!] as object);
        // Like the live gateway: an update matching nothing is not acknowledged.
        data[key] = matches.length
          ? { acknowledged: true, totalImpactedData: matches.length, message: null }
          : {
              acknowledged: false,
              totalImpactedData: 0,
              message: "No data found to UPDATE or you don't have permission to UPDATE this record.",
            };
      } else {
        // Like the live gateway (seen 2026-11-18), a filter delete removes one match per call.
        const matches = this.filter(s, variables.where as Record<string, unknown>).slice(0, 1);
        for (const r of matches) this.tables[s].delete(r.ItemId);
        // Matches the live gateway (seen 2026-11-18): an empty delete is not acknowledged.
        data[key] = matches.length
          ? { acknowledged: true, totalImpactedData: matches.length, message: null }
          : {
              acknowledged: false,
              totalImpactedData: 0,
              message: "No data found to DELETE or you don't have permission to DELETE this record.",
            };
      }
    }
    return { data };
  };

  private filter(schema: Schema, where: Record<string, unknown> = {}): Rec[] {
    return this.all(schema).filter((r) =>
      Object.entries(where).every(([field, cond]) => {
        const c = cond as { eq?: unknown; neq?: unknown; in?: unknown[] };
        const v = r[field];
        if ("eq" in c && v !== c.eq) return false;
        if ("neq" in c && v === c.neq) return false;
        if (c.in && !c.in.includes(v)) return false;
        return true;
      }),
    );
  }

  private list(schema: Schema, vars: Record<string, unknown>, fields: string[]) {
    let rows = this.filter(schema, vars.where as Record<string, unknown>);
    const order = (vars.order as Array<{ field: string; direction: "ASC" | "DESC" }>) ?? [];
    rows = [...rows].sort((a, b) => {
      for (const { field, direction } of order) {
        const av = a[field] as string | number | undefined;
        const bv = b[field] as string | number | undefined;
        if (av === bv) continue;
        // Mongo order: missing values first when ascending.
        const cmp = av === undefined || av === null ? -1 : bv === undefined || bv === null ? 1 : av < bv ? -1 : 1;
        return direction === "ASC" ? cmp : -cmp;
      }
      return 0;
    });
    const { pageNo, pageSize } = (vars.paging as { pageNo: number; pageSize: number }) ?? {
      pageNo: 1,
      pageSize: 100,
    };
    const start = (pageNo - 1) * pageSize;
    const items = rows.slice(start, start + pageSize).map((r) => {
      const out: Record<string, unknown> = {};
      for (const f of fields) out[f] = r[f] ?? null;
      return out;
    });
    return {
      items,
      totalCount: rows.length,
      pageNo,
      pageSize,
      totalPages: Math.ceil(rows.length / pageSize),
      hasNextPage: start + pageSize < rows.length,
      hasPreviousPage: pageNo > 1,
    };
  }
}
