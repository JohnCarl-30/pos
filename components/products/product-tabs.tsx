import Button from "@/components/_ui/button";

type ProductTabsProps = { productId: string; current: "details" | "stock" };

export default function ProductTabs({ productId, current }: ProductTabsProps) {
  const tabs = [
    { key: "details", label: "Details", href: `/products/${productId}` },
    { key: "stock", label: "Stock", href: `/products/${productId}?tab=stock` },
  ] as const;
  return (
    <nav aria-label="Product" className="border-line-strong flex shrink-0 gap-1 border-b px-4 py-2">
      {tabs.map((tab) => (
        <Button
          key={tab.key}
          href={tab.href}
          variant="ghost"
          size="md"
          aria-current={current === tab.key ? "page" : undefined}
          className="aria-[current=page]:bg-white/6 aria-[current=page]:text-foreground"
        >
          {tab.label}
        </Button>
      ))}
    </nav>
  );
}
