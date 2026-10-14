import { z } from "zod";

const optional = (max: number, message: string) =>
  z
    .string()
    .trim()
    .max(max, message)
    .transform((value) => value || null);

export const customerSchema = z.object({
  name: z.string().trim().min(1, "Enter a name").max(120, "Keep the name under 120 characters"),
  email: z
    .string()
    .trim()
    .pipe(z.union([z.literal(""), z.email("Enter a valid email")]))
    .transform((value) => value || null),
  phone: optional(40, "Keep the phone under 40 characters"),
  notes: optional(1000, "Keep the notes under 1,000 characters"),
});

export type CustomerValues = z.output<typeof customerSchema>;
