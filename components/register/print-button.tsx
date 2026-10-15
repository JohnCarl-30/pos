"use client";

import Button from "@/components/_ui/button";

export default function PrintButton({ label = "Print receipt" }: { label?: string } = {}) {
  return (
    <Button variant="secondary" size="md" className="min-h-11 print:hidden" onClick={() => window.print()}>
      {label}
    </Button>
  );
}
