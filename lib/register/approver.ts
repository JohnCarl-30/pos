import "server-only";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from "@/lib/env";

export async function verifyApprover(email: string, password: string, storeId: string): Promise<{ ok: true; approverId: string } | { ok: false; error: string }> {
  const verifier = createSupabaseClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: signedIn, error: signInError } = await verifier.auth.signInWithPassword({ email, password });
  if (signInError || !signedIn.user) return { ok: false, error: "Email or password is incorrect." };
  try {
    const admin = createAdminClient();
    const { data: approver } = await admin.from("staff").select("id, role, active, staff_stores(store_id)").eq("user_id", signedIn.user.id).maybeSingle();
    if (!approver || !approver.active || (approver.role !== "manager" && approver.role !== "owner")) {
      return { ok: false, error: "Only an active manager or owner can approve this." };
    }
    if (approver.role === "manager" && !approver.staff_stores.some((entry) => entry.store_id === storeId)) {
      return { ok: false, error: "That manager doesn't work in this store." };
    }
    return { ok: true, approverId: approver.id };
  } finally {
    await verifier.auth.signOut({ scope: "local" });
  }
}
