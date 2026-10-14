import { describe, expect, it } from "vitest";
import { CsvError, parseCsv, toCsv } from "./csv";

describe("toCsv", () => {
  it("quotes cells that need it", () => {
    expect(toCsv([["a", "b,c", 'say "hi"', "two\nlines"]])).toBe('a,"b,c","say ""hi""","two\nlines"');
  });
  it("neutralises spreadsheet formulas", () => {
    expect(toCsv([["=SUM(A1)", "+1", "-2", "@x"]])).toBe("'=SUM(A1),'+1,'-2,'@x");
  });
  it("leaves numbers unescaped so negative stock round-trips", () => {
    expect(toCsv([[-5, "-5"]])).toBe("-5,'-5");
  });
  it("writes numbers, booleans and empty cells", () => {
    expect(toCsv([[1250, true, null], ["x", false, ""]])).toBe("1250,true,\r\nx,false,");
  });
});

describe("parseCsv", () => {
  it("parses a simple file", () => {
    expect(parseCsv("sku,price\nA,1.50\nB,2")).toEqual({ header: ["sku", "price"], rows: [["A", "1.50"], ["B", "2"]] });
  });
  it("handles quotes, embedded commas, quotes and newlines", () => {
    expect(parseCsv('name,note\r\n"Tea, green","He said ""hi""\nthen left"\r\n').rows).toEqual([
      ["Tea, green", 'He said "hi"\nthen left'],
    ]);
  });
  it("detects semicolon files and keeps comma decimals intact", () => {
    expect(parseCsv("sku;price\nA;12,50")).toEqual({ header: ["sku", "price"], rows: [["A", "12,50"]] });
  });
  it("strips a BOM, trims headers and skips blank lines", () => {
    expect(parseCsv("﻿ sku , price \n\nA,1\n\n")).toEqual({ header: ["sku", "price"], rows: [["A", "1"]] });
  });
  it("keeps empty trailing cells", () => {
    expect(parseCsv("a,b,c\n1,,\n").rows).toEqual([["1", "", ""]]);
  });
  it("round-trips what toCsv writes", () => {
    const rows = [["product", "note"], ["Tea, green", 'a "b"'], ["=x", "line\nbreak"]];
    expect(parseCsv(toCsv(rows)).rows).toEqual([["Tea, green", 'a "b"'], ["'=x", "line\nbreak"]]);
  });
  it("rejects an unterminated quote", () => {
    expect(() => parseCsv('a,b\n"oops,1')).toThrow(CsvError);
  });
  it("rejects an empty file", () => {
    expect(() => parseCsv("\n\n")).toThrow(CsvError);
  });
});
