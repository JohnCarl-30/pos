"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { requireStaff, STORE_COOKIE } from "./staff";

export async function selectStore(storeId: string): Promise<void> {
  const staff = await requireStaff();
  if (!staff.stores.some((store) => store.id === storeId)) return;
  const cookieStore = await cookies();
  cookieStore.set(STORE_COOKIE, storeId, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 365 });
  revalidatePath("/", "layout");
}
