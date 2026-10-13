import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { LOGIN_ERRORS } from "@/lib/auth/schemas";

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  await supabase.auth.signOut();
  const error = request.nextUrl.searchParams.get("error");
  const target = error && error in LOGIN_ERRORS ? `/login?error=${error}` : "/login";
  return NextResponse.redirect(new URL(target, request.url));
}
