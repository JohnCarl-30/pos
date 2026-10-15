"use client";

import { useActionState, useState, type ChangeEvent } from "react";
import Button from "@/components/_ui/button";
import { Input } from "@/components/_ui/input";
import { Label } from "@/components/_ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/_ui/table";
import { applyImport, previewImport, type ImportState } from "@/lib/catalog/import-actions";
import { cn } from "@/lib/utils";

const EMPTY: ImportState = { preview: null, error: null, applied: null };
const MAX_BYTES = 2_000_000;
const STATUS_LABELS = { new: "New", update: "Update", unchanged: "No change", error: "Error" } as const;

export default function ImportPanel() {
  const [csv, setCsv] = useState("");
  const [fileName, setFileName] = useState("");
  const [previewState, preview, previewing] = useActionState(previewImport, EMPTY);
  const [applyState, apply, applying] = useActionState(applyImport, EMPTY);
  const [shown, setShown] = useState<"preview" | "apply">("preview");
  const [previewedCsv, setPreviewedCsv] = useState<string | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);

  async function choose(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    setPreviewedCsv(null);
    setShown("preview");
    if (!file) return;
    if (file.size > MAX_BYTES) {
      setFileError("The file is larger than 2 MB. Split it into smaller files.");
      setCsv("");
      return;
    }
    setFileError(null);
    setFileName(file.name);
    setCsv(await file.text());
  }

  const stale = previewedCsv === null || previewedCsv !== csv;
  const state = shown === "apply" ? applyState : previewState;
  const result = shown === "preview" && stale ? null : state.preview;
  const error = fileError ?? (shown === "preview" && stale ? null : state.error);
  const canApply = Boolean(!stale && result && !result.fileError && result.summary.error === 0 && result.apply.length > 0);

  return (
    <div className="flex flex-col gap-6 p-4">
      <div className="flex flex-col gap-2">
        <span className="caption-style text-subtle max-w-[60ch] text-pretty leading-[1.4]">
          Columns: product, category, variant, sku, barcode, price, cost, tax_class, track, stock. Only product, sku and price are required. Existing SKUs are updated and nothing is deleted. Stock values become counts for the store you&apos;re viewing.
        </span>
        <form
          action={preview}
          onSubmit={() => {
            setShown("preview");
            setPreviewedCsv(csv);
          }} className="flex flex-wrap items-end gap-2">
          <div className="flex flex-col gap-2">
            <Label htmlFor="import-file">CSV file</Label>
            <Input id="import-file" type="file" accept=".csv,text/csv" onChange={choose} />
          </div>
          <input type="hidden" name="csv" value={csv} />
          <Button type="submit" variant="secondary" size="md" disabled={!csv || previewing}>{previewing ? "Checking…" : "Preview"}</Button>
        </form>
      </div>

      {error && <div role="alert" className="caption-style bg-danger/10 text-danger rounded-lg px-3 py-2">{error}</div>}
      {applyState.applied !== null && shown === "apply" && (
        <div role="status" className="caption-style bg-success/10 text-success rounded-lg px-3 py-2">
          Imported {applyState.applied} {applyState.applied === 1 ? "row" : "rows"} from {fileName}.
        </div>
      )}

      {result && !result.fileError && (
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span>
              {result.summary.new} new · {result.summary.update} updated · {result.summary.unchanged} unchanged · {result.summary.error} {result.summary.error === 1 ? "error" : "errors"}
              {result.newCategories.length > 0 && ` · new categories: ${result.newCategories.join(", ")}`}
            </span>
            <form action={apply} onSubmit={() => setShown("apply")}>
              <input type="hidden" name="csv" value={csv} />
              <Button type="submit" variant="primary" size="md" disabled={!canApply || applying}>
                {applying ? "Importing…" : `Import ${result.apply.length} ${result.apply.length === 1 ? "row" : "rows"}`}
              </Button>
            </form>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Line</TableHead>
                <TableHead>Product</TableHead>
                <TableHead>SKU</TableHead>
                <TableHead>Result</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {result.rows.map((row) => (
                <TableRow key={row.line} className={cn(row.status === "error" && "bg-danger/5")}>
                  <TableCell>{row.line}</TableCell>
                  <TableCell>{row.product || "—"}</TableCell>
                  <TableCell>{row.sku || "—"}</TableCell>
                  <TableCell className={row.status === "error" ? "text-danger" : undefined}>
                    {row.status === "error"
                      ? row.errors.join(" · ")
                      : row.changes.length > 0
                        ? `${STATUS_LABELS[row.status]}: ${row.changes.join(", ")}`
                        : STATUS_LABELS[row.status]}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
