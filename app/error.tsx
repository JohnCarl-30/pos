"use client";

import Button from "@/components/_ui/button";

export default function Error({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 p-4 text-center">
      <h1>Something went wrong</h1>
      <p className="text-subtle max-w-[24em]">Try again. If it keeps happening, check that the database is running.</p>
      <Button variant="secondary" size="md" onClick={reset}>Try again</Button>
    </main>
  );
}
