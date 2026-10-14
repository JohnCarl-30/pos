import Tag from "@/components/_ui/tag";
import { ORDER_STATUS_LABELS, type OrderStatus } from "@/lib/orders/list";

const TONES = { completed: "green", partially_refunded: "amber", refunded: "neutral", voided: "red" } as const;

export default function StatusTag({ status }: { status: OrderStatus }) {
  return (
    <Tag tone={TONES[status]} size="sm">
      {ORDER_STATUS_LABELS[status]}
    </Tag>
  );
}
