import { z } from "zod";

const money = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const optionalId = z.preprocess((value) => (value === "" ? undefined : value), z.guid().optional());

export const areaSchema = z.object({
  id: optionalId,
  name: z.string().trim().min(1, "Enter an area name").max(40, "Keep it under 40 characters"),
});

export const tableSchema = z.object({
  id: optionalId,
  areaId: z.guid("Pick an area"),
  name: z.string().trim().min(1, "Enter a table name").max(20, "Keep it under 20 characters"),
  seats: z.coerce.number().int("Seats must be between 1 and 50").min(1, "Seats must be between 1 and 50").max(50, "Seats must be between 1 and 50"),
});

export const openTabSchema = z
  .object({
    tableId: z.preprocess((value) => (value === "" ? null : value), z.guid().nullable()),
    name: z.string().max(40, "Keep the name under 40 characters"),
    guests: z.preprocess(
      (value) => (value === "" || value === null || value === undefined ? null : Number(value)),
      z.number().int("Guests must be between 1 and 99").min(1, "Guests must be between 1 and 99").max(99, "Guests must be between 1 and 99").nullable(),
    ),
  })
  .refine((value) => value.tableId !== null || value.name.trim() !== "", { message: "Name the bar tab", path: ["name"] });

export const reasonSchema = z.object({ reason: z.string().trim().min(1, "Give a reason").max(200, "Keep it under 200 characters") });

export const noteSchema = z.object({ note: z.string().trim().max(100, "Keep the note under 100 characters") });

export const payTabSchema = z.object({
  tabId: z.guid(),
  sessionId: z.guid(),
  parts: z
    .array(
      z.object({
        tabItemId: z.guid(),
        quantity: z.number().int().min(1).max(999),
        discountBps: z.number().int().min(0).max(10_000).nullable().optional(),
        discountAmount: money.nullable().optional(),
      }),
    )
    .min(1)
    .max(200),
  orderDiscount: z.object({ bps: z.number().int().min(0).max(10_000).nullable().optional(), amount: money.nullable().optional() }).nullable(),
  approvalId: z.guid().nullable(),
  customerId: z.guid().nullable(),
  payments: z
    .array(
      z.object({
        method: z.enum(["cash", "card", "other"]),
        amount: money,
        tendered: money.nullable().optional(),
        reference: z.string().max(100).nullable().optional(),
      }),
    )
    .max(20),
  tip: money.optional(),
});

export type PayTabInput = z.infer<typeof payTabSchema>;
