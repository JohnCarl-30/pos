import { describe, expect, it } from "vitest";
import { parseModifierGroupForm, type ModifierGroupFormInput } from "./modifier-form";

const base: ModifierGroupFormInput = {
  name: " Milk ",
  min: "1",
  max: "1",
  active: true,
  options: [
    { name: "Whole", price: "", active: true },
    { name: "Oat", price: "0.50", active: true },
    { name: "", price: "", active: true },
  ],
};

describe("parseModifierGroupForm", () => {
  it("builds the payload in minor units and drops blank rows", () => {
    expect(parseModifierGroupForm(base, "USD")).toEqual({
      ok: true,
      payload: {
        name: "Milk",
        min_choices: 1,
        max_choices: 1,
        active: true,
        options: [
          { name: "Whole", price_delta: 0, active: true },
          { name: "Oat", price_delta: 50, active: true },
        ],
      },
    });
  });
  it("accepts negative price changes and keeps ids", () => {
    const result = parseModifierGroupForm({ ...base, id: "g", options: [{ id: "o", name: "No cheese", price: "-0.50", active: true }] }, "USD");
    expect(result).toMatchObject({ ok: true, payload: { id: "g", options: [{ id: "o", name: "No cheese", price_delta: -50, active: true }] } });
  });
  it("explains what's wrong", () => {
    expect(parseModifierGroupForm({ ...base, name: "", min: "2", max: "1", options: [] }, "USD")).toEqual({
      ok: false,
      errors: { name: "Enter a group name", max: "Max must be at least min", options: "Add at least one option" },
    });
    expect(parseModifierGroupForm({ ...base, options: [{ name: "Oat", price: "", active: true }, { name: "oat", price: "x", active: true }] }, "USD")).toEqual({
      ok: false,
      errors: { options: "Option names must be different", "price-1": "Enter a price change, like 0.50" },
    });
    expect(parseModifierGroupForm({ ...base, min: "2", max: "2", options: [{ name: "Oat", price: "", active: true }] }, "USD")).toEqual({
      ok: false,
      errors: { min: "Min can't be more than the active options" },
    });
  });
});
