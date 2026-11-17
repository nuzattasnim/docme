/**
 * Typed errors for the docme data layer.
 *
 * Every failure a service function can raise carries a stable `code`, so UI
 * code branches on the code rather than on message text.
 */
export type DocmeDataErrorCode =
  /** `deleteVersion` was asked to delete the doc's CurrentVersion. */
  | "CannotDeleteCurrentVersion"
  /** Page content exceeds the 200 KB limit. Raised before any request. */
  | "ContentTooLarge"
  /** The version label already exists on the same doc. Raised before any insert. */
  | "VersionLabelTaken"
  /** A field failed a client-side rule (empty title, label too long, ...). */
  | "InvalidInput"
  /** The version is legacy, copying, or failed; it can't be changed by the UI. */
  | "VersionNotEditable"
  /** The gateway answered with GraphQL `errors[]`, empty data, or `acknowledged:false`. */
  | "GatewayError"
  /** The session could not be refreshed after a 401. */
  | "Unauthorized";

export class DocmeDataError extends Error {
  readonly code: DocmeDataErrorCode;
  /** The form field the error belongs to, when there is one. */
  readonly field?: string;

  constructor(
    code: DocmeDataErrorCode,
    message: string,
    options: { field?: string; cause?: unknown } = {},
  ) {
    super(message, options.cause !== undefined ? { cause: options.cause } : undefined);
    this.name = "DocmeDataError";
    this.code = code;
    this.field = options.field;
  }
}

export function isDocmeDataError(
  err: unknown,
  code?: DocmeDataErrorCode,
): err is DocmeDataError {
  return err instanceof DocmeDataError && (code === undefined || err.code === code);
}

/** Message suitable for a toast or an inline Alert. */
export function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}
