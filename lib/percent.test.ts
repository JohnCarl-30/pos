import { describe, expect, it } from "vitest";
import { formatBpsAsPercent, parsePercentToBps } from "./percent";

describe("parsePercentToBps", () => {
  it("parses whole and decimal percentages", () => {
    expect(parsePercentToBps("12")).toBe(1200);
    expect(parsePercentToBps("8.25")).toBe(825);
    expect(parsePercentToBps("8,25")).toBe(825);
    expect(parsePercentToBps(" 7.5 % ")).toBe(750);
    expect(parsePercentToBps("0")).toBe(0);
  });
  it("rejects values that aren't valid rates", () => {
    expect(parsePercentToBps("")).toBeNull();
    expect(parsePercentToBps("abc")).toBeNull();
    expect(parsePercentToBps("-5")).toBeNull();
    expect(parsePercentToBps("8.255")).toBeNull();
    expect(parsePercentToBps("1001")).toBeNull();
    expect(parsePercentToBps("1.000,5")).toBeNull();
  });
});

describe("formatBpsAsPercent", () => {
  it("shows basis points as a plain percentage", () => {
    expect(formatBpsAsPercent(825)).toBe("8.25");
    expect(formatBpsAsPercent(1200)).toBe("12");
    expect(formatBpsAsPercent(750)).toBe("7.5");
    expect(formatBpsAsPercent(0)).toBe("0");
  });
});
