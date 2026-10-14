import { z } from "zod";
import { parsePercentToBps } from "@/lib/percent";
import { isCurrencyCode, isTimeZone } from "@/lib/validation";

export const setupSchema = z
  .object({
    businessName: z.string().trim().min(1, "Enter your business name").max(120),
    storeName: z.string().trim().min(1, "Enter a store name").max(120),
    currency: z.string().trim().toUpperCase().refine(isCurrencyCode, "Use a 3-letter currency code like USD or EUR"),
    pricing: z.enum(["inclusive", "exclusive"]),
    taxRate: z.string(),
    timezone: z.string().refine(isTimeZone, "Pick a valid time zone"),
    ownerName: z.string().trim().min(1, "Enter your name").max(120),
    email: z.email("Enter a valid email"),
    password: z.string().min(8, "Use at least 8 characters"),
  })
  .transform((value, ctx) => {
    const taxRateBps = parsePercentToBps(value.taxRate);
    if (taxRateBps === null) {
      ctx.addIssue({ code: "custom", path: ["taxRate"], message: "Enter a rate like 8.25 (0–1000)" });
      return z.NEVER;
    }
    return {
      businessName: value.businessName,
      storeName: value.storeName,
      currency: value.currency,
      pricing: value.pricing,
      timezone: value.timezone,
      ownerName: value.ownerName,
      email: value.email,
      password: value.password,
      taxRateBps,
    };
  });
