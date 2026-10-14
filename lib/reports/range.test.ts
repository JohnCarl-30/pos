import { describe, expect, it } from "vitest";
import { addDays, localToday, resolveRange } from "./range";

const noon = new Date("2026-10-14T12:00:00Z");

describe("localToday", () => {
  it("uses the store's calendar, not UTC", () => {
    expect(localToday(new Date("2026-10-14T17:30:00Z"), "Asia/Manila")).toBe("2026-10-15");
    expect(localToday(new Date("2026-10-14T17:30:00Z"), "UTC")).toBe("2026-10-14");
  });
});

describe("addDays", () => {
  it("crosses months and years", () => {
    expect(addDays("2026-01-01", -1)).toBe("2025-12-31");
    expect(addDays("2028-02-28", 1)).toBe("2028-02-29");
  });
});

describe("resolveRange", () => {
  it("starts today at the store's midnight and buckets by hour", () => {
    const { range, error } = resolveRange({}, "Asia/Manila", new Date("2026-10-14T17:30:00Z"));
    expect(error).toBeNull();
    expect(range).toMatchObject({ preset: "today", fromDate: "2026-10-15", toDate: "2026-10-15", bucket: "hour", label: "Today" });
    expect(range.from.toISOString()).toBe("2026-10-14T16:00:00.000Z");
    expect(range.to.toISOString()).toBe("2026-10-15T16:00:00.000Z");
  });
  it("resolves the presets", () => {
    expect(resolveRange({ range: "yesterday" }, "UTC", noon).range).toMatchObject({ fromDate: "2026-10-13", toDate: "2026-10-13", bucket: "hour" });
    expect(resolveRange({ range: "7d" }, "UTC", noon).range).toMatchObject({ fromDate: "2026-10-08", toDate: "2026-10-14", bucket: "day", label: "Last 7 days" });
    expect(resolveRange({ range: "30d" }, "UTC", noon).range).toMatchObject({ fromDate: "2026-09-15", toDate: "2026-10-14" });
    expect(resolveRange({ range: "this-month" }, "UTC", noon).range).toMatchObject({ fromDate: "2026-10-01", toDate: "2026-10-14" });
    expect(resolveRange({ range: "last-month" }, "UTC", new Date("2026-01-10T12:00:00Z")).range).toMatchObject({ fromDate: "2025-12-01", toDate: "2025-12-31" });
  });
  it("includes the last day of a custom range", () => {
    const { range } = resolveRange({ range: "custom", from: "2026-10-01", to: "2026-10-03" }, "UTC", noon);
    expect(range.to.toISOString()).toBe("2026-10-04T00:00:00.000Z");
    expect(range.label).toBe("Oct 1, 2026 – Oct 3, 2026");
  });
  it("allows 366 days and refuses more", () => {
    expect(resolveRange({ range: "custom", from: "2025-01-01", to: "2026-01-01" }, "UTC", noon).error).toBeNull();
    const over = resolveRange({ range: "custom", from: "2025-01-01", to: "2026-01-02" }, "UTC", noon);
    expect(over.error).toBe("Pick a range of up to 366 days.");
    expect(over.range.preset).toBe("today");
  });
  it("refuses a start after the end", () => {
    expect(resolveRange({ range: "custom", from: "2026-10-05", to: "2026-10-01" }, "UTC", noon).error).toBe("The start date is after the end date.");
  });
  it("falls back to today on anything it doesn't understand", () => {
    expect(resolveRange({ range: "decade" }, "UTC", noon).range.preset).toBe("today");
    expect(resolveRange({ range: "custom", from: "2026-13-01", to: "x" }, "UTC", noon)).toMatchObject({ error: null, range: { preset: "today" } });
  });
});
