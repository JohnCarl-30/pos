import { z } from "zod";

export type ActionResult =
  | { ok: true; message?: string }
  | { ok: false; error?: string; fieldErrors?: Record<string, string> }
  | null;

export function fieldErrorsFrom(error: z.ZodError): Record<string, string> {
  const { fieldErrors } = z.flattenError(error);
  return Object.fromEntries(
    Object.entries(fieldErrors as Record<string, string[] | undefined>)
      .filter(([, messages]) => messages && messages.length > 0)
      .map(([field, messages]) => [field, messages![0]]),
  );
}
