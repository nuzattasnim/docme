/**
 * Client-side input rules. They mirror the Blocks validations in
 * `blocks/data/validations/*.json`, and run before any request is sent.
 */
import { DocmeDataError } from "@/features/data/errors";

export const LIMITS = {
  docName: 200,
  docDescription: 2000,
  versionLabel: 50,
  pageTitle: 200,
  /** 200 KB, counted in characters as the spec defines it. */
  pageContent: 204_800,
} as const;

export const MESSAGES = {
  titleRequired: "Title is required",
  titleTooLong: `Title is limited to ${LIMITS.pageTitle} characters`,
  contentTooLarge: "Page content is limited to 200 KB",
  nameRequired: "Name is required",
  nameTooLong: `Name is limited to ${LIMITS.docName} characters`,
  descriptionTooLong: `Description is limited to ${LIMITS.docDescription.toLocaleString("en-US")} characters`,
  labelRequired: "Version label is required",
  labelTooLong: `Version label is limited to ${LIMITS.versionLabel} characters`,
  labelTaken: (label: string) => `Version ${label} already exists on this doc`,
} as const;

export type FieldErrors = Partial<Record<"title" | "content" | "name" | "description" | "label", string>>;

export function validatePageInput(input: { title?: string; content?: string | null }): FieldErrors {
  const errors: FieldErrors = {};
  if (input.title !== undefined) {
    const title = input.title.trim();
    if (!title) errors.title = MESSAGES.titleRequired;
    else if (title.length > LIMITS.pageTitle) errors.title = MESSAGES.titleTooLong;
  }
  if (input.content != null && input.content.length > LIMITS.pageContent) {
    errors.content = MESSAGES.contentTooLarge;
  }
  return errors;
}

export function validateDocInput(input: { name?: string; description?: string | null }): FieldErrors {
  const errors: FieldErrors = {};
  if (input.name !== undefined) {
    const name = input.name.trim();
    if (!name) errors.name = MESSAGES.nameRequired;
    else if (name.length > LIMITS.docName) errors.name = MESSAGES.nameTooLong;
  }
  if (input.description != null && input.description.length > LIMITS.docDescription) {
    errors.description = MESSAGES.descriptionTooLong;
  }
  return errors;
}

export function validateVersionLabel(label: string): FieldErrors {
  const trimmed = label.trim();
  if (!trimmed) return { label: MESSAGES.labelRequired };
  if (trimmed.length > LIMITS.versionLabel) return { label: MESSAGES.labelTooLong };
  return {};
}

/** Throw the first field error as a typed DocmeDataError. */
export function assertValid(errors: FieldErrors): void {
  const [field, message] = Object.entries(errors)[0] ?? [];
  if (!field || !message) return;
  const code = field === "content" ? "ContentTooLarge" : "InvalidInput";
  throw new DocmeDataError(code, message, { field });
}

export function hasErrors(errors: FieldErrors): boolean {
  return Object.keys(errors).length > 0;
}
