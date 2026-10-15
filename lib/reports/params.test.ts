import { describe, expect, it } from "vitest";
import { exportHref, parseOnlyOff, parseProductSort, parseReportTab, reportHref } from "./params";
import { resolveRange } from "./range";

const now = new Date("2026-10-14T12:00:00Z");

describe("report params", () => {
  it("parses the tab, sort and filter", () => {
    expect(parseReportTab({ tab: "staff" })).toBe("staff");
    expect(parseReportTab({ tab: "nope" })).toBe("summary");
    expect(parseProductSort({ sort: "units" })).toBe("units");
    expect(parseProductSort({})).toBe("revenue");
    expect(parseOnlyOff({ only: "off" })).toBe(true);
    expect(parseOnlyOff({})).toBe(false);
  });
  it("builds links that keep the range", () => {
    const preset = resolveRange({ range: "7d" }, "UTC", now).range;
    expect(reportHref("products", preset)).toBe("/reports?tab=products&range=7d");
    const custom = resolveRange({ range: "custom", from: "2026-10-01", to: "2026-10-03" }, "UTC", now).range;
    expect(reportHref("cashups", custom, { only: "off" })).toBe("/reports?tab=cashups&range=custom&from=2026-10-01&to=2026-10-03&only=off");
    expect(exportHref("summary", custom)).toBe("/reports/export?tab=summary&range=custom&from=2026-10-01&to=2026-10-03");
  });
});
