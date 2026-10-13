export const PUBLIC_PATHS = ["/login", "/forgot-password", "/reset-password", "/auth"] as const;

export const HOME_PATH = "/register";

export type RouteDecision = { type: "next" } | { type: "redirect"; to: string };

type RouteInput = {
  pathname: string;
  search: string;
  signedIn: boolean;
  setupComplete: boolean;
};

function matches(pathname: string, base: string) {
  return pathname === base || pathname.startsWith(`${base}/`);
}

export function decideRoute({ pathname, search, signedIn, setupComplete }: RouteInput): RouteDecision {
  if (!setupComplete) {
    return matches(pathname, "/setup") ? { type: "next" } : { type: "redirect", to: "/setup" };
  }
  if (matches(pathname, "/setup")) return { type: "next" };

  const isPublic = PUBLIC_PATHS.some((base) => matches(pathname, base));
  if (!signedIn) {
    if (isPublic) return { type: "next" };
    if (pathname === "/") return { type: "redirect", to: "/login" };
    return { type: "redirect", to: `/login?next=${encodeURIComponent(pathname + search)}` };
  }
  if (matches(pathname, "/login")) return { type: "redirect", to: HOME_PATH };
  return { type: "next" };
}

const UNSAFE_NEXT_CHARS = /[\u0000-\u001F\u007F\\]/;

export function safeNext(next: string | null | undefined): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || UNSAFE_NEXT_CHARS.test(next)) {
    return HOME_PATH;
  }
  const url = new URL(next, "http://n");
  if (url.origin !== "http://n") return HOME_PATH;
  const path = url.pathname + url.search + url.hash;
  if (path.startsWith("//")) return HOME_PATH;
  return path;
}
