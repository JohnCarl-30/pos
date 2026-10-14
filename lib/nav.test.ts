import { describe, expect, it } from "vitest";
import { navItemsFor } from "./nav";

const keys = (role: Parameters<typeof navItemsFor>[0]) => navItemsFor(role).map((item) => item.key);

describe("navItemsFor", () => {
  it("gives cashiers the selling sections", () => {
    expect(keys("cashier")).toEqual(["register", "orders", "customers"]);
  });
  it("adds products and reports for managers", () => {
    expect(keys("manager")).toEqual(["register", "products", "orders", "customers", "reports"]);
  });
  it("adds settings for owners", () => {
    expect(keys("owner")).toEqual(["register", "products", "orders", "customers", "reports", "settings"]);
  });
});
