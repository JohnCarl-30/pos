import { describe, expect, it } from "vitest";
import { setupSchema } from "./schema";

const valid = {
  businessName: "Corner Shop",
  storeName: "Main Street",
  currency: "eur",
  pricing: "inclusive",
  taxRate: "21",
  timezone: "Europe/Amsterdam",
  ownerName: "Sam",
  email: "sam@corner.test",
  password: "correct-horse",
};

describe("setupSchema", () => {
  it("normalises valid input", () => {
    const result = setupSchema.parse(valid);
    expect(result.currency).toBe("EUR");
    expect(result.taxRateBps).toBe(2100);
    expect(result.pricing).toBe("inclusive");
  });
  it("rejects an unknown currency", () => {
    expect(setupSchema.safeParse({ ...valid, currency: "XYZ" }).success).toBe(false);
  });
  it("rejects an unknown time zone", () => {
    expect(setupSchema.safeParse({ ...valid, timezone: "Mars/Base" }).success).toBe(false);
  });
  it("rejects a bad tax rate", () => {
    expect(setupSchema.safeParse({ ...valid, taxRate: "abc" }).success).toBe(false);
  });
  it("rejects a short password", () => {
    expect(setupSchema.safeParse({ ...valid, password: "short" }).success).toBe(false);
  });
});
