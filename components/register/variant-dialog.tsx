"use client";

import Button from "@/components/_ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/_ui/dialog";
import type { RegisterProduct, RegisterVariant } from "@/lib/register/cart";

type VariantDialogProps = {
  product: RegisterProduct | null;
  money: (minor: number) => string;
  onPick: (product: RegisterProduct, variant: RegisterVariant) => void;
  onClose: () => void;
  onCloseAutoFocus?: (event: Event) => void;
};

export default function VariantDialog({ product, money, onPick, onClose, onCloseAutoFocus }: VariantDialogProps) {
  return (
    <Dialog open={product !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent onCloseAutoFocus={onCloseAutoFocus}>
        {product && (
          <div className="flex flex-col gap-4 p-6">
            <DialogHeader>
              <DialogTitle>{product.name}</DialogTitle>
              <DialogDescription>Pick a variant to add to the sale.</DialogDescription>
            </DialogHeader>
            <ul className="flex flex-col gap-2">
              {product.variants.map((variant) => (
                <li key={variant.id}>
                  <Button variant="secondary" size="md" className="min-h-11 w-full justify-between" onClick={() => onPick(product, variant)}>
                    <span>{variant.name}</span>
                    <span>
                      {money(variant.price)}
                      {variant.track && variant.quantity <= 0 ? " · out of stock" : ""}
                    </span>
                  </Button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
