import { roleAtLeast, type StaffRole } from "@/lib/auth/roles";

export type NavKey = "register" | "products" | "orders" | "customers" | "reports" | "settings";

export type NavItem = { key: NavKey; label: string; href: string; minRole: StaffRole };

export const NAV_ITEMS: NavItem[] = [
  { key: "register", label: "Register", href: "/register", minRole: "cashier" },
  { key: "products", label: "Products", href: "/products", minRole: "manager" },
  { key: "orders", label: "Orders", href: "/orders", minRole: "cashier" },
  { key: "customers", label: "Customers", href: "/customers", minRole: "cashier" },
  { key: "reports", label: "Reports", href: "/reports", minRole: "manager" },
  { key: "settings", label: "Settings", href: "/settings", minRole: "owner" },
];

export function navItemsFor(role: StaffRole): NavItem[] {
  return NAV_ITEMS.filter((item) => roleAtLeast(role, item.minRole));
}
