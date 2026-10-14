import type { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { LOGIN_ERRORS } from "@/lib/auth/schemas";
import { relativeRedirect } from "@/lib/http/relative-redirect";

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  await supabase.auth.signOut({ scope: "local" });
  const error = request.nextUrl.searchParams.get("error");
  const target = error && Object.hasOwn(LOGIN_ERRORS, error) ? `/login?error=${error}` : "/login";
  return relativeRedirect(target);
}
