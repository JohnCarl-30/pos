"use client";

import { usePathname } from "next/navigation";
import Button from "@/components/_ui/button";

const LINKS = [
  { href: "/settings/stores", label: "Stores" },
  { href: "/settings/tax", label: "Tax" },
  { href: "/settings/staff", label: "Staff" },
];

export default function SettingsNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="Settings" className="border-line-strong flex shrink-0 gap-1 border-b px-4 py-2">
      {LINKS.map((link) => {
        const active = pathname.startsWith(link.href);
        return (
          <Button
            key={link.href}
            href={link.href}
            variant="ghost"
            size="md"
            aria-current={active ? "page" : undefined}
            className="aria-[current=page]:bg-white/6 aria-[current=page]:text-foreground"
          >
            {link.label}
          </Button>
        );
      })}
    </nav>
  );
}
