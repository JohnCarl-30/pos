"use client";

import { useTransition } from "react";
import Button from "@/components/_ui/button";
import { selectRegister } from "@/lib/register/actions";
import type { RegisterOption } from "@/lib/register/pick-register";

export default function RegisterPicker({ registers }: { registers: RegisterOption[] }) {
  const [pending, startTransition] = useTransition();
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 p-6 text-center">
      <h2>Which register is this?</h2>
      <span className="caption-style text-subtle">This device will remember your choice.</span>
      <div className="flex flex-wrap justify-center gap-3">
        {registers.map((register) => (
          <Button
            key={register.id}
            variant="secondary"
            size="md"
            className="min-h-11 min-w-[10em]"
            disabled={pending}
            onClick={() => startTransition(() => selectRegister(register.id))}
          >
            {register.name}
          </Button>
        ))}
      </div>
    </div>
  );
}
