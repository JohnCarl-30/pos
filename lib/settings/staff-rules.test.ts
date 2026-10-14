import { describe, expect, it } from "vitest";
import { staffChangeError } from "./staff-rules";

describe("staffChangeError", () => {
  it("allows changes to other staff", () => {
    expect(staffChangeError({ actorStaffId: "a", targetStaffId: "b", nextRole: "cashier", nextActive: false })).toBeNull();
  });
  it("stops owners deactivating themselves", () => {
    expect(staffChangeError({ actorStaffId: "a", targetStaffId: "a", nextRole: "owner", nextActive: false })).toBe(
      "You can't deactivate your own account.",
    );
  });
  it("stops owners demoting themselves", () => {
    expect(staffChangeError({ actorStaffId: "a", targetStaffId: "a", nextRole: "manager", nextActive: true })).toBe(
      "You can't change your own role. Ask another owner.",
    );
  });
  it("allows owners to save their own row unchanged", () => {
    expect(staffChangeError({ actorStaffId: "a", targetStaffId: "a", nextRole: "owner", nextActive: true })).toBeNull();
  });
});
