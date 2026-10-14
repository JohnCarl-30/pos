import { NextResponse } from "next/server";

export function relativeRedirect(location: string, status = 303): NextResponse {
  if (!location.startsWith("/") || location.startsWith("//")) {
    throw new Error(`relativeRedirect needs a same-origin path, got "${location}"`);
  }
  return new NextResponse(null, { status, headers: { Location: location } });
}
