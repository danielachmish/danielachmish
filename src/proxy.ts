import { NextResponse, type NextRequest } from "next/server";

// Personal / financial responses must never be stored by browsers or shared caches.
export function proxy(_req: NextRequest) {
  const res = NextResponse.next();
  res.headers.set("Cache-Control", "private, no-store, max-age=0");
  return res;
}

export const config = {
  matcher: ["/(dashboard|congregants|pledges|payments|tasks|reminders|settings|admin|me|p|pay|enter|invite)(.*)", "/api/:path*"],
};
