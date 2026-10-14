import type { ComponentType, SVGProps } from "react";
import type { NavKey } from "@/lib/nav";
import RegisterIcon from "@/public/assets/images/_common/nav/register.svg";
import ProductsIcon from "@/public/assets/images/_common/nav/products.svg";
import OrdersIcon from "@/public/assets/images/_common/nav/orders.svg";
import CustomersIcon from "@/public/assets/images/_common/nav/customers.svg";
import ReportsIcon from "@/public/assets/images/_common/nav/reports.svg";
import SettingsIcon from "@/public/assets/images/_common/nav/settings.svg";

export const NAV_ICONS: Record<NavKey, ComponentType<SVGProps<SVGSVGElement>>> = {
  register: RegisterIcon,
  products: ProductsIcon,
  orders: OrdersIcon,
  customers: CustomersIcon,
  reports: ReportsIcon,
  settings: SettingsIcon,
};
