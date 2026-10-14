export type CsvCell = string | number | boolean | null;

export class CsvError extends Error {}

function escapeCell(cell: CsvCell): string {
  if (cell === null) return "";
  if (typeof cell === "number") return String(cell);
  let value = String(cell);
  if (/^[=+\-@\t\r]/.test(value)) value = `'${value}`;
  if (/[",\r\n]/.test(value)) value = `"${value.replace(/"/g, '""')}"`;
  return value;
}

export function toCsv(rows: CsvCell[][]): string {
  return rows.map((row) => row.map(escapeCell).join(",")).join("\r\n");
}

function detectDelimiter(text: string): string {
  let commas = 0;
  let semicolons = 0;
  let quoted = false;
  for (const char of text) {
    if (char === '"') quoted = !quoted;
    else if (!quoted && (char === "\n" || char === "\r")) break;
    else if (!quoted && char === ",") commas += 1;
    else if (!quoted && char === ";") semicolons += 1;
  }
  return semicolons > commas ? ";" : ",";
}

export function parseCsv(input: string): { header: string[]; rows: string[][] } {
  const text = input.replace(/^﻿/, "");
  const delimiter = detectDelimiter(text);
  const records: string[][] = [];
  let record: string[] = [];
  let cell = "";
  let quoted = false;
  let index = 0;

  while (index < text.length) {
    const char = text[index];
    if (quoted) {
      if (char === '"' && text[index + 1] === '"') {
        cell += '"';
        index += 2;
        continue;
      }
      if (char === '"') {
        quoted = false;
        index += 1;
        continue;
      }
      cell += char;
      index += 1;
      continue;
    }
    if (char === '"' && cell === "") {
      quoted = true;
    } else if (char === delimiter) {
      record.push(cell);
      cell = "";
    } else if (char === "\n" || char === "\r") {
      record.push(cell);
      records.push(record);
      record = [];
      cell = "";
      if (char === "\r" && text[index + 1] === "\n") index += 1;
    } else {
      cell += char;
    }
    index += 1;
  }

  if (quoted) throw new CsvError("A quoted cell is never closed.");
  if (cell !== "" || record.length > 0) {
    record.push(cell);
    records.push(record);
  }

  const nonEmpty = records.filter((row) => row.some((value) => value.trim() !== ""));
  if (nonEmpty.length === 0) throw new CsvError("The file is empty.");
  const [header, ...rows] = nonEmpty;
  return { header: header.map((value) => value.trim()), rows };
}
