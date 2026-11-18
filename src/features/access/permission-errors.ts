import { create } from "zustand";

/**
 * The last write the server refused for lack of permission (SPEC2 C14).
 * `<PermissionErrorAlert>` shows it until dismissed; the failing mutation
 * also shows a toast. Never retried automatically.
 */
interface PermissionErrorState {
  message: string | null;
  report: (message: string) => void;
  dismiss: () => void;
}

export const usePermissionErrors = create<PermissionErrorState>((set) => ({
  message: null,
  report: (message) => set({ message }),
  dismiss: () => set({ message: null }),
}));

/** Gateway answers that mean "a data access rule refused this" (S0 run 2). */
export function isPolicyRefusal(message: string): boolean {
  return /no policy grants access|don't have permission|do not have permission|access denied|forbidden/i.test(
    message,
  );
}

const SCHEMA_NOUN: Record<string, string> = {
  Doc: "doc",
  Docs: "docs",
  DocVersion: "version",
  DocVersions: "versions",
  Page: "page",
  Pages: "pages",
};

/** "updateDoc" → "update this doc", "getPages" → "read these pages". */
export function describeOperation(operation: string): string {
  const m = /^(get|insert|update|delete)(\w+)$/.exec(operation);
  if (!m) return "do this";
  const [, verb, schema] = m;
  const noun = SCHEMA_NOUN[schema] ?? schema.toLowerCase();
  switch (verb) {
    case "get":
      return `read ${noun}`;
    case "insert":
      return `create a ${noun}`;
    case "update":
      return `change this ${noun}`;
    default:
      return `delete this ${noun}`;
  }
}

export function permissionMessage(operation: string): string {
  return `You don't have permission to ${describeOperation(operation)}. Ask an admin.`;
}
