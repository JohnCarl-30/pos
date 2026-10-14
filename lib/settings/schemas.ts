import { z } from "zod";
import { STAFF_ROLES } from "@/lib/auth/roles";
import { parsePercentToBps } from "@/lib/percent";
import { isCurrencyCode, isTimeZone } from "@/lib/validation";

export function formToObject(formData: FormData, multi: string[] = []): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of formData.entries()) {
    if (!multi.includes(key)) result[key] = value;
  }
  for (const key of multi) result[key] = formData.getAll(key);
  return result;
}

const optionalId = z.preprocess((value) => (value === "" ? undefined : value), z.guid().optional());
const name = (label: string, max: number) => z.string().trim().min(1, `Enter a ${label}`).max(max);

export const storeSchema = z.object({
  id: optionalId,
  name: name("store name", 120),
  address: z.preprocess((value) => (typeof value === "string" && value.trim() ? value.trim() : null), z.string().max(300).nullable()),
  currency: z.string().trim().toUpperCase().refine(isCurrencyCode, "Use a 3-letter currency code like USD or EUR"),
  timezone: z.string().refine(isTimeZone, "Pick a valid time zone"),
  pricing: z.enum(["inclusive", "exclusive"]),
  maxCashierDiscount: z
    .string()
    .trim()
    .default("20")
    .transform((value, ctx) => {
      const bps = parsePercentToBps(value);
      if (bps === null || bps > 10_000) {
        ctx.addIssue({ code: "custom", message: "Enter a percentage from 0 to 100" });
        return z.NEVER;
      }
      return bps;
    }),
  receiptFooter: z.preprocess((value) => (typeof value === "string" && value.trim() ? value.trim() : null), z.string().max(300, "Keep the footer under 300 characters").nullable()),
});

export const registerSchema = z.object({
  storeId: z.guid(),
  name: name("register name", 60),
});

export const taxClassSchema = z.object({
  id: optionalId,
  name: name("tax class name", 60),
});

export const taxRateSchema = z
  .object({
    storeId: z.guid(),
    taxClassId: z.guid(),
    name: name("label", 60),
    rate: z.string(),
  })
  .transform((value, ctx) => {
    const rateBps = parsePercentToBps(value.rate);
    if (rateBps === null) {
      ctx.addIssue({ code: "custom", path: ["rate"], message: "Enter a rate like 8.25 (0–1000)" });
      return z.NEVER;
    }
    return { storeId: value.storeId, taxClassId: value.taxClassId, name: value.name, rateBps };
  });

const storeIds = z.array(z.guid());
const needsStore = (value: { role: string; storeIds: string[] }) => value.role === "owner" || value.storeIds.length > 0;
const needsStoreIssue = { path: ["storeIds"], message: "Pick at least one store" };

export const staffCreateSchema = z
  .object({
    name: name("name", 120),
    email: z.email("Enter a valid email"),
    password: z.string().min(8, "Use at least 8 characters"),
    role: z.enum(STAFF_ROLES),
    storeIds,
  })
  .refine(needsStore, needsStoreIssue);

export const staffUpdateSchema = z
  .object({
    id: z.guid(),
    role: z.enum(STAFF_ROLES),
    storeIds,
    active: z.preprocess((value) => value === "on", z.boolean()),
  })
  .refine(needsStore, needsStoreIssue);
