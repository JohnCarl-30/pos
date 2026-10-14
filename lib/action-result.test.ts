import { describe, expect, it } from "vitest";
import { z } from "zod";
import { fieldErrorsFrom } from "./action-result";

describe("fieldErrorsFrom", () => {
  it("keeps the first message per field", () => {
    const schema = z.object({
      email: z.email("Enter a valid email"),
      password: z.string().min(8, "Use at least 8 characters"),
    });
    const result = schema.safeParse({ email: "nope", password: "short" });
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(fieldErrorsFrom(result.error)).toEqual({
      email: "Enter a valid email",
      password: "Use at least 8 characters",
    });
  });
});
