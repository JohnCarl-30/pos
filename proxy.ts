import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { decideRoute } from "@/lib/auth/routes";
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from "@/lib/env";

const SETUP_COOKIE = "pos-setup-complete";
const NO_STORE_HEADERS = ["cache-control", "expires", "pragma"];

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (cookiesToSet, headers) => {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        Object.entries(headers).forEach(([key, value]) => response.headers.set(key, value));
      },
    },
  });

  const { data } = await supabase.auth.getClaims();
  const signedIn = Boolean(data?.claims?.sub);

  const setupCookie = request.cookies.get(SETUP_COOKIE)?.value;
  let setupComplete = setupCookie === "1";
  let confirmedSetupComplete = setupComplete;
  if (!setupComplete) {
    const { data: status, error } = await supabase.rpc("setup_status");
    if (error) {
      setupComplete = true;
    } else {
      setupComplete = status === true;
      confirmedSetupComplete = setupComplete;
    }
  }

  const decision = decideRoute({
    pathname: request.nextUrl.pathname,
    search: request.nextUrl.search,
    signedIn,
    setupComplete,
  });

  let result = response;
  if (decision.type === "redirect") {
    result = NextResponse.redirect(new URL(decision.to, request.url));
    response.cookies.getAll().forEach((cookie) => result.cookies.set(cookie));
    NO_STORE_HEADERS.forEach((header) => {
      const value = response.headers.get(header);
      if (value) result.headers.set(header, value);
    });
  }

  if (confirmedSetupComplete && setupCookie !== "1") {
    result.cookies.set(SETUP_COOKIE, "1", {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
    });
  }
  return result;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|manifest.webmanifest|icon.svg|apple-icon.png|assets/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|avif|woff2)$).*)",
  ],
};
