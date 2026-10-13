import { describe, expect, it } from "vitest";
import { roleAtLeast } from "./roles";

describe("roleAtLeast", () => {
  it("orders roles cashier < manager < owner", () => {
    expect(roleAtLeast("owner", "manager")).toBe(true);
    expect(roleAtLeast("manager", "manager")).toBe(true);
    expect(roleAtLeast("cashier", "manager")).toBe(false);
    expect(roleAtLeast("manager", "owner")).toBe(false);
  });
});
