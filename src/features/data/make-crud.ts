/**
 * Generic CRUD-hook factory for a Blocks schema.
 *
 * The runtime gateway auto-generates `<querySchema>` (e.g. "Docs") plus
 * `insert<Schema>`, `update<Schema>`, `delete<Schema>` mutations for every
 * entity schema once it's reloaded via the configuration skill. This factory
 * captures the pattern once — instantiate it per schema rather than retyping
 * the queries.
 *
 * Per the skill, **don't hand-derive the operation names**: read `querySchema`
 * and `mutationSchemas` from `GET /schemas` in the admin surface. This module
 * trusts the names its caller supplies.
 *
 * See: blocks-skills/skills/blocks-data-gateway-crud/references/react.md
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { gql, type ActionResponse, type GqlResult, type GqlError } from "./gateway";

export interface CrudNames {
  /** e.g. "getDocs" — read query (from `get` + querySchema) */
  query: string;
  /** e.g. "insertDoc" */
  insert: string;
  /** e.g. "updateDoc" */
  update: string;
  /** e.g. "deleteDoc" */
  remove: string;
  /** e.g. "DocFilterInput" */
  filterType: string;
  /** e.g. "DocSortInput" */
  sortType: string;
  /** e.g. "DocInsertInput" */
  insertType: string;
  /** e.g. "DocUpdateInput" */
  updateType: string;
}

/** `order` entries are `{ direction, field }` — PascalCase field name. */
export type SortInput = { direction: "ASC" | "DESC"; field: string };

export interface ListVars {
  where?: Record<string, unknown>;
  paging?: { pageNo: number; pageSize: number };
  order?: SortInput[];
}

export interface UpdateVars<TUpdate> {
  where: Record<string, unknown>;
  input: TUpdate;
}

/**
 * Make `useList` / `useCreate` / `useUpdate` / `useDelete` for one schema.
 *
 * @typeParam TRecord  — the record shape (includes `ItemId` and your fields).
 * @typeParam TInsert  — input shape for `insert<Schema>` (your fields only).
 * @typeParam TUpdate  — input shape for `update<Schema>` (Partial<TInsert>).
 * @param names        — operation + GraphQL input-type names from the schema.
 * @param fieldSelection — space-separated PascalCase fields to request in the
 *                        list query. Always include `ItemId`.
 */
export function makeCrud<TRecord, TInsert, TUpdate>(
  names: CrudNames,
  fieldSelection: string,
) {
  function useList(vars: ListVars = {}) {
    return useQuery({
      queryKey: ["data", names.query, vars] as const,
      queryFn: async () => {
        const data = await gql<Record<string, GqlResult<TRecord>>>(
          `query($where:${names.filterType},$paging:PaginationInput,$order:[${names.sortType}!]){
             ${names.query}(where:$where,paging:$paging,order:$order){
               totalCount pageNo pageSize totalPages hasNextPage hasPreviousPage
               items { ${fieldSelection} }
             }
           }`,
          vars as Record<string, unknown>,
        );
        return data[names.query];
      },
    });
  }

  function useCreate() {
    const qc = useQueryClient();
    return useMutation<ActionResponse, Error, TInsert>({
      mutationFn: async (input) => {
        const data = await gql<Record<string, ActionResponse>>(
          `mutation($input:${names.insertType}!){
             ${names.insert}(input:$input){ acknowledged itemId totalImpactedData message }
           }`,
          { input: input as unknown as Record<string, unknown> },
        );
        return data[names.insert];
      },
      onSuccess: () => {
        // Invalidate every cached list for this schema (TanStack prefix match).
        qc.invalidateQueries({ queryKey: ["data", names.query] });
      },
    });
  }

  function useUpdate() {
    const qc = useQueryClient();
    return useMutation<ActionResponse, Error, UpdateVars<TUpdate>>({
      mutationFn: async ({ where, input }) => {
        const data = await gql<Record<string, ActionResponse>>(
          `mutation($where:${names.filterType},$input:${names.updateType}!){
             ${names.update}(where:$where,input:$input){ acknowledged totalImpactedData message }
           }`,
          {
            where,
            input: input as unknown as Record<string, unknown>,
          },
        );
        return data[names.update];
      },
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: ["data", names.query] });
      },
    });
  }

  function useDelete() {
    const qc = useQueryClient();
    return useMutation<ActionResponse, Error, Record<string, unknown>>({
      mutationFn: async (where) => {
        const data = await gql<Record<string, ActionResponse>>(
          `mutation($where:${names.filterType}){
             ${names.remove}(where:$where){ acknowledged totalImpactedData message }
           }`,
          { where },
        );
        return data[names.remove];
      },
      onSuccess: () => {
        // Invalidate every cached list for this schema (TanStack prefix match).
        qc.invalidateQueries({ queryKey: ["data", names.query] });
      },
    });
  }

  return { useList, useCreate, useUpdate, useDelete };
}

/**
 * Re-export for component-level error rendering. Components shouldn't import
 * `GraphQLError` directly from the gateway module to keep the surface area
 * of the CRUD factory stable.
 */
export type { GqlError };
