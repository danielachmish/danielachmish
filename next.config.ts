import type { NextConfig } from "next";

const securityHeaders = [
  // Personal links carry their token in the URL fragment; never leak any URL to other sites.
  { key: "Referrer-Policy", value: "no-referrer" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      // connect.facebook.net / facebook.com: Meta's WhatsApp Embedded Signup popup (settings screens only).
      "script-src 'self' 'unsafe-inline' https://connect.facebook.net" + (process.env.NODE_ENV === "development" ? " 'unsafe-eval'" : ""),
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data:",
      "font-src 'self'",
      "connect-src 'self' https://*.facebook.com https://graph.facebook.com",
      "frame-src https://www.facebook.com https://web.facebook.com https://*.facebook.com",
      "frame-ancestors 'none'",
      // wa.me: "send from my WhatsApp" hand-off (form POST → redirect).
      "form-action 'self' https://*.payplus.co.il https://wa.me https://api.whatsapp.com",
      "base-uri 'self'",
    ].join("; "),
  },
];

const noStore = [{ key: "Cache-Control", value: "private, no-store, max-age=0" }];

const config: NextConfig = {
  poweredByHeader: false,
  serverExternalPackages: ["pg", "pg-boss", "@prisma/client", "@prisma/adapter-pg"],
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      // Personal / financial pages must never be stored by shared caches.
      { source: "/(dashboard|congregants|pledges|payments|tasks|reminders|settings|admin|me|p|pay|enter)(.*)", headers: noStore },
      { source: "/api/:path*", headers: noStore },
    ];
  },
};

export default config;
