import { z } from "zod";

const money = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);

export const saleSchema = z.object({
  sessionId: z.guid(),
  lines: z
    .array(
      z.object({
        variantId: z.guid(),
        quantity: z.number().int().min(1).max(9_999),
        discountBps: z.number().int().min(0).max(10_000).nullable().optional(),
        discountAmount: money.nullable().optional(),
        optionIds: z.array(z.guid()).max(50).optional(),
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
  orderName: z.string().trim().max(40).optional(),
});

export type SaleInput = z.infer<typeof saleSchema>;
