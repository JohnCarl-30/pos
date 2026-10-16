import type { ComponentType, SVGProps } from "react";
import type { NavKey } from "@/lib/nav";
import RegisterIcon from "@/public/assets/images/_common/nav/register.svg";
import ProductsIcon from "@/public/assets/images/_common/nav/products.svg";
import OrdersIcon from "@/public/assets/images/_common/nav/orders.svg";
import CustomersIcon from "@/public/assets/images/_common/nav/customers.svg";
import ReportsIcon from "@/public/assets/images/_common/nav/reports.svg";
import SettingsIcon from "@/public/assets/images/_common/nav/settings.svg";
import TablesIcon from "@/public/assets/images/_common/nav/tables.svg";
import KitchenIcon from "@/public/assets/images/_common/nav/kitchen.svg";

export const NAV_ICONS: Record<NavKey, ComponentType<SVGProps<SVGSVGElement>>> = {
  register: RegisterIcon,
  tables: TablesIcon,
  kitchen: KitchenIcon,
  products: ProductsIcon,
  orders: OrdersIcon,
  customers: CustomersIcon,
  reports: ReportsIcon,
  settings: SettingsIcon,
};
