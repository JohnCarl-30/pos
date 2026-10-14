import { describe, expect, it } from "vitest";
import { fetchAll } from "./fetch-all";

function source(total: number) {
  const calls: [number, number][] = [];
  const page = (from: number, to: number) => {
    calls.push([from, to]);
    const data = Array.from({ length: Math.max(0, Math.min(to, total - 1) - from + 1) }, (_, index) => from + index);
    return Promise.resolve({ data, error: null });
  };
  return { page, calls };
}

describe("fetchAll", () => {
  it("pages until a short page comes back", async () => {
    const { page, calls } = source(2500);
    const rows = await fetchAll(page, 1000);
    expect(rows).toHaveLength(2500);
    expect(rows[2499]).toBe(2499);
    expect(calls).toEqual([[0, 999], [1000, 1999], [2000, 2999]]);
  });
  it("asks for one more page when the total is an exact multiple", async () => {
    const { page, calls } = source(2000);
    expect(await fetchAll(page, 1000)).toHaveLength(2000);
    expect(calls).toHaveLength(3);
  });
  it("throws the first error", async () => {
    const failure = new Error("boom");
    await expect(fetchAll(() => Promise.resolve({ data: null, error: failure }))).rejects.toBe(failure);
  });
});
