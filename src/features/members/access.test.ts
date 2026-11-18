import { describe, expect, it } from "vitest";
import { leavesNoAdmin, planAccessChange, toMember, type Member } from "./access";

const m = (userId: string, roles: string[], role: Member["role"]): Member => ({
  userId,
  name: userId,
  email: "",
  roles,
  role,
});

describe("planAccessChange (H8, Q7)", () => {
  it("sends the full role set for the organization, replacing only the docme role", () => {
    const req = planAccessChange(m("u1", ["clouduser", "docme-viewer"], "viewer"), "org-x", "editor");
    expect(req).toEqual({
      kind: "update",
      body: { userId: "u1", organizationId: "org-x", roles: ["clouduser", "docme-editor"] },
    });
  });

  it("removing the docme role keeps the user's other roles", () => {
    const req = planAccessChange(m("u1", ["clouduser", "docme-admin"], "admin"), "org-x", null);
    expect(req).toEqual({ kind: "update", body: { userId: "u1", organizationId: "org-x", roles: ["clouduser"] } });
  });

  it("removing the only role revokes organization access (an empty list would be ignored)", () => {
    const req = planAccessChange(m("u1", ["docme-viewer"], "viewer"), "org-x", null);
    expect(req).toEqual({ kind: "revoke", body: { userId: "u1", organizationId: "org-x" } });
  });
});

describe("leavesNoAdmin (BR1, C9)", () => {
  const members = [m("a", ["docme-admin"], "admin"), m("e", ["docme-editor"], "editor")];

  it("blocks demoting the last admin", () => {
    expect(leavesNoAdmin(members, new Map([["a", "editor"]]))).toBe(true);
    expect(leavesNoAdmin(members, new Map([["a", null]]))).toBe(true);
  });

  it("allows it once someone else is promoted in the same save", () => {
    expect(
      leavesNoAdmin(
        members,
        new Map([
          ["a", "editor"],
          ["e", "admin"],
        ]),
      ),
    ).toBe(false);
  });

  it("allows unrelated changes", () => {
    expect(leavesNoAdmin(members, new Map([["e", "viewer"]]))).toBe(false);
  });
});

describe("toMember", () => {
  it("reads the per-organization role map IAM returns", () => {
    const member = toMember(
      { itemId: "u1", firstName: "Ada", roles: { default: [], "org-x": ["docme-editor"], "org-y": ["docme-admin"] } },
      "org-x",
    );
    expect(member).toMatchObject({ userId: "u1", name: "Ada", roles: ["docme-editor"], role: "editor" });
  });
});
