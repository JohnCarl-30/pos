import { describe, expect, it } from "vitest";
import { pickStore } from "./pick-store";

const main = { id: "a", name: "Main", currency: "USD", pricesIncludeTax: false };
const kiosk = { id: "b", name: "Kiosk", currency: "USD", pricesIncludeTax: false };

describe("pickStore", () => {
  it("uses the preferred store when the staff member can access it", () => {
    expect(pickStore([main, kiosk], "b")).toBe(kiosk);
  });
  it("falls back to the first store when the preference is no longer allowed", () => {
    expect(pickStore([main, kiosk], "gone")).toBe(main);
  });
  it("falls back to the first store with no preference", () => {
    expect(pickStore([main, kiosk], undefined)).toBe(main);
  });
  it("returns null when the staff member has no stores", () => {
    expect(pickStore([], "a")).toBeNull();
  });
});
