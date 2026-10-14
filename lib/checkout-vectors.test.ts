import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import vectors from "./checkout-vectors.json";
import { vectorsToSql } from "./checkout-vectors-sql";
import type { CheckoutVector } from "./checkout";

describe("checkout vectors", () => {
  it("the generated pgTAP file is up to date", () => {
    const current = readFileSync(new URL("../supabase/tests/checkout_vectors.test.sql", import.meta.url), "utf8");
    expect(current).toBe(vectorsToSql(vectors as CheckoutVector[]));
  });
});
