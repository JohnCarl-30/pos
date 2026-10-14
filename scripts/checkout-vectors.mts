import { readFileSync, writeFileSync } from "node:fs";
import { vectorsToSql } from "../lib/checkout-vectors-sql.ts";

const vectors = JSON.parse(readFileSync(new URL("../lib/checkout-vectors.json", import.meta.url), "utf8"));
writeFileSync(new URL("../supabase/tests/checkout_vectors.test.sql", import.meta.url), vectorsToSql(vectors));
console.log(`Wrote ${vectors.length} checkout vectors to supabase/tests/checkout_vectors.test.sql`);
