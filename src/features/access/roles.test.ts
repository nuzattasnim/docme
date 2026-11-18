import { describe, expect, it } from "vitest";
import { can, docmeRoleFrom, type DocmeAction } from "./roles";

describe("docmeRoleFrom", () => {
  it("picks the highest docme role", () => {
    expect(docmeRoleFrom(["docme-viewer", "docme-admin", "docme-editor"])).toBe("admin");
    expect(docmeRoleFrom(["clouduser", "docme-viewer", "docme-editor"])).toBe("editor");
    expect(docmeRoleFrom(["docme-viewer"])).toBe("viewer");
  });

  it("returns null without a docme role (C5)", () => {
    expect(docmeRoleFrom([])).toBeNull();
    expect(docmeRoleFrom(undefined)).toBeNull();
    expect(docmeRoleFrom(["clouduser", 42])).toBeNull();
  });
});

describe("can", () => {
  const all: DocmeAction[] = [
    "doc.create",
    "doc.edit",
    "doc.delete",
    "version.create",
    "version.publish",
    "version.delete",
    "page.write",
    "members.manage",
    "source.manage",
  ];

  it("admin can do everything", () => {
    for (const a of all) expect(can("admin", a)).toBe(true);
  });

  it("editor writes but never deletes docs/versions or manages members (H5, C3)", () => {
    expect(can("editor", "doc.create")).toBe(true);
    expect(can("editor", "doc.edit")).toBe(true);
    expect(can("editor", "version.publish")).toBe(true);
    expect(can("editor", "page.write")).toBe(true);
    expect(can("editor", "doc.delete")).toBe(false);
    expect(can("editor", "version.delete")).toBe(false);
    expect(can("editor", "members.manage")).toBe(false);
  });

  it("viewer and no role can do nothing (H7, C5)", () => {
    for (const a of all) {
      expect(can("viewer", a)).toBe(false);
      expect(can(null, a)).toBe(false);
    }
  });
});
