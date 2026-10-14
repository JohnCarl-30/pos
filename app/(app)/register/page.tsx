import type { Metadata } from "next";
import { cookies } from "next/headers";
import PageHeader from "@/components/_common/page-header";
import EmptyState from "@/components/_common/empty-state";
import RegisterPicker from "@/components/register/register-picker";
import OpenTillForm from "@/components/register/open-till-form";
import ChangeRegisterButton from "@/components/register/change-register-button";
import RegisterScreen from "@/components/register/register-screen";
import { getCurrentStore, requireRole } from "@/lib/auth/staff";
import { createClient } from "@/lib/supabase/server";
import { loadCategories } from "@/lib/catalog/queries";
import { loadRegisterCatalog } from "@/lib/register/queries";
import { REGISTER_COOKIE, pickRegister } from "@/lib/register/pick-register";

export const metadata: Metadata = { title: "Register" };

export default async function RegisterPage() {
  const staff = await requireRole("cashier");
  const store = await getCurrentStore(staff);
  if (!store) {
    return (
      <section id="register" className="flex min-h-0 min-w-0 flex-1 flex-col">
        <PageHeader title="Register" />
        <EmptyState title="No store yet" description="Ask an owner to add you to a store." />
      </section>
    );
  }

  const supabase = await createClient();
  const cookieStore = await cookies();
  const [{ data: registers }, { data: storeRow }] = await Promise.all([
    supabase.from("registers").select("id, name").eq("store_id", store.id).order("name"),
    supabase.from("stores").select("max_cashier_discount_bps").eq("id", store.id).maybeSingle(),
  ]);
  const register = pickRegister(registers ?? [], cookieStore.get(REGISTER_COOKIE)?.value);

  if (!register) {
    return (
      <section id="register" className="flex min-h-0 min-w-0 flex-1 flex-col">
        <PageHeader title="Register" />
        {(registers ?? []).length === 0 ? (
          <EmptyState title="This store has no registers" description="An owner can add one in Settings, under Stores." />
        ) : (
          <RegisterPicker registers={registers ?? []} />
        )}
      </section>
    );
  }

  const { data: session } = await supabase.from("register_sessions").select("id").eq("register_id", register.id).is("closed_at", null).maybeSingle();
  if (!session) {
    return (
      <section id="register" className="flex min-h-0 min-w-0 flex-1 flex-col">
        <PageHeader title={`Register · ${register.name}`} actions={<ChangeRegisterButton />} />
        <OpenTillForm registerId={register.id} registerName={register.name} currency={store.currency} />
      </section>
    );
  }

  const [products, categories, { data: lastOrder }] = await Promise.all([
    loadRegisterCatalog(supabase, store.id),
    loadCategories(supabase),
    supabase.from("orders").select("id").eq("session_id", session.id).order("created_at", { ascending: false }).limit(1).maybeSingle(),
  ]);

  return (
    <RegisterScreen
      sessionId={session.id}
      registerName={register.name}
      role={staff.role}
      currency={store.currency}
      pricesIncludeTax={store.pricesIncludeTax}
      maxCashierDiscountBps={storeRow?.max_cashier_discount_bps ?? 2000}
      products={products}
      categories={categories.map((entry) => ({ id: entry.id, name: entry.name }))}
      lastOrderId={lastOrder?.id ?? null}
    />
  );
}
