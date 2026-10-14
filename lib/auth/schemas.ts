import { z } from "zod";

export const signInSchema = z.object({
  email: z.email("Enter a valid email"),
  password: z.string().min(1, "Enter your password"),
  next: z.string().optional(),
});

export const resetRequestSchema = z.object({
  email: z.email("Enter a valid email"),
});

export const newPasswordSchema = z
  .object({
    password: z.string().min(8, "Use at least 8 characters"),
    confirm: z.string(),
  })
  .refine((value) => value.password === value.confirm, {
    path: ["confirm"],
    message: "Passwords don't match",
  });

export const LOGIN_ERRORS: Record<string, string> = {
  "no-access": "This account doesn't have access. Ask the owner to reactivate it.",
  "link-expired": "That link has expired. Request a new one.",
};
