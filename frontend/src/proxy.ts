import { NextResponse } from "next/server";
import { auth, isOwnerSession } from "@/lib/auth";

// Request-level gate in front of /dashboard (Next 16 proxy, formerly
// middleware). Defense in depth: the dashboard layout and every server action
// still re-verify the session; this layer stops unauthenticated requests —
// including server-action POSTs to /dashboard — before any of that code runs.
export const proxy = auth((req) => {
  if (isOwnerSession(req.auth)) return NextResponse.next();

  return NextResponse.redirect(new URL("/login", req.nextUrl));
});

export const config = {
  matcher: ["/dashboard/:path*"],
};
