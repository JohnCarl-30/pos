"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Button from "@/components/_ui/button";
import { Input } from "@/components/_ui/input";

export default function CustomersToolbar({ q }: { q: string }) {
  const router = useRouter();
  const [query, setQuery] = useState(q);
  const [prevQ, setPrevQ] = useState(q);
  if (q !== prevQ) {
    setPrevQ(q);
    setQuery(q);
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = query.trim();
    router.push(value ? `/customers?q=${encodeURIComponent(value)}` : "/customers");
  }

  return (
    <div className="border-line-strong flex flex-wrap items-center gap-2 border-b px-4 py-3">
      <form role="search" onSubmit={submit} className="flex min-w-[16em] flex-1 items-center gap-2">
        <Input aria-label="Search customers" placeholder="Name, email or phone" value={query} onChange={(event) => setQuery(event.target.value)} />
        <Button type="submit" variant="secondary" size="md">Search</Button>
      </form>
    </div>
  );
}
