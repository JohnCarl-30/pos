"use client";

import { useTransition } from "react";
import Button from "@/components/_ui/button";
import { clearRegister } from "@/lib/register/actions";

export default function ChangeRegisterButton() {
  const [pending, startTransition] = useTransition();
  return (
    <Button variant="ghost" size="md" className="min-h-11" disabled={pending} onClick={() => startTransition(() => clearRegister())}>
      Change register
    </Button>
  );
}
