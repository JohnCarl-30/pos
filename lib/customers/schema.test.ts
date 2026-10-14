import { describe, expect, it } from "vitest";
import { customerSchema } from "./schema";

describe("customerSchema", () => {
  it("trims and turns blanks into nothing", () => {
    expect(customerSchema.parse({ name: "  Ana Reyes ", email: " ", phone: "", notes: "" })).toEqual({ name: "Ana Reyes", email: null, phone: null, notes: null });
  });
  it("checks the email and the lengths", () => {
    expect(customerSchema.safeParse({ name: "Ana", email: "not-an-email", phone: "", notes: "" }).error?.issues[0].message).toBe("Enter a valid email");
    expect(customerSchema.safeParse({ name: "", email: "", phone: "", notes: "" }).error?.issues[0].message).toBe("Enter a name");
    expect(customerSchema.safeParse({ name: "Ana", email: "", phone: "1".repeat(41), notes: "" }).success).toBe(false);
    expect(customerSchema.safeParse({ name: "Ana", email: "", phone: "", notes: "x".repeat(1001) }).success).toBe(false);
  });
});
