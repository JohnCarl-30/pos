import { describe, expect, it } from "vitest";
import { formToObject, registerSchema, staffCreateSchema, staffUpdateSchema, storeSchema, taxRateSchema } from "./schemas";

const ID = "00000000-0000-4000-8000-000000000001";

describe("formToObject", () => {
  it("collects repeated fields into arrays", () => {
    const form = new FormData();
    form.append("name", "A");
    form.append("storeIds", "1");
    form.append("storeIds", "2");
    expect(formToObject(form, ["storeIds"])).toEqual({ name: "A", storeIds: ["1", "2"] });
  });
  it("gives an empty array for a missing repeated field", () => {
    expect(formToObject(new FormData(), ["storeIds"])).toEqual({ storeIds: [] });
  });
});

describe("storeSchema", () => {
  it("normalises a new store", () => {
    const store = storeSchema.parse({ id: "", name: " Kiosk ", address: "", currency: "php", timezone: "Asia/Manila", pricing: "inclusive" });
    expect(store).toEqual({ id: undefined, name: "Kiosk", address: null, currency: "PHP", timezone: "Asia/Manila", pricing: "inclusive" });
  });
  it("rejects a bad currency", () => {
    expect(storeSchema.safeParse({ name: "A", currency: "ZZZ", timezone: "UTC", pricing: "exclusive" }).success).toBe(false);
  });
});

describe("registerSchema", () => {
  it("requires a name and store", () => {
    expect(registerSchema.safeParse({ storeId: ID, name: "" }).success).toBe(false);
    expect(registerSchema.parse({ storeId: ID, name: "Counter 3" }).name).toBe("Counter 3");
  });
});

describe("taxRateSchema", () => {
  it("converts the percentage to basis points", () => {
    expect(taxRateSchema.parse({ storeId: ID, taxClassId: ID, name: "VAT", rate: "12" }).rateBps).toBe(1200);
  });
  it("rejects a bad percentage", () => {
    expect(taxRateSchema.safeParse({ storeId: ID, taxClassId: ID, name: "VAT", rate: "12.345" }).success).toBe(false);
  });
});

describe("staffCreateSchema", () => {
  const base = { name: "Pat", email: "pat@shop.test", password: "temporary1", role: "cashier", storeIds: [ID] };
  it("accepts a cashier with a store", () => {
    expect(staffCreateSchema.safeParse(base).success).toBe(true);
  });
  it("requires a store for cashiers and managers", () => {
    expect(staffCreateSchema.safeParse({ ...base, storeIds: [] }).success).toBe(false);
  });
  it("lets owners have no stores", () => {
    expect(staffCreateSchema.safeParse({ ...base, role: "owner", storeIds: [] }).success).toBe(true);
  });
});

describe("staffUpdateSchema", () => {
  it("reads the active checkbox", () => {
    expect(staffUpdateSchema.parse({ id: ID, role: "manager", storeIds: [ID], active: "on" }).active).toBe(true);
    expect(staffUpdateSchema.parse({ id: ID, role: "manager", storeIds: [ID] }).active).toBe(false);
  });
});
