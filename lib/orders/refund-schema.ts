import { z } from "zod";

const money = z.number().int().max(Number.MAX_SAFE_INTEGER);

export const refundSchema = z
  .object({
    orderId: z.guid(),
    sessionId: z.guid(),
    lines: z
      .array(z.object({ orderItemId: z.guid(), quantity: z.number().int().min(1).max(9_999), restock: z.boolean() }))
      .min(1)
      .max(200),
    payments: z
      .array(z.object({ method: z.enum(["cash", "card", "other"]), amount: money.min(1), reference: z.string().trim().max(100).nullable().optional() }))
      .max(10),
    approvalId: z.guid().nullable(),
    reason: z.enum(["changed_mind", "damaged", "wrong_item", "other"]),
    note: z.string().trim().max(300),
  })
  .refine((value) => value.reason !== "other" || value.note.length > 0, { message: "Add a note for the refund", path: ["note"] });

export type RefundInput = z.input<typeof refundSchema>;
