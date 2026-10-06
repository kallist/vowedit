import type { NextConfig } from "next";
const apiPort = Number(process.env.VOWEDIT_API_PORT || "8000");
if (!Number.isInteger(apiPort) || apiPort < 1024 || apiPort > 65535)
  throw new Error("VOWEDIT_API_PORT must be an unprivileged local port.");
const config: NextConfig = {
  poweredByHeader: false,
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `http://127.0.0.1:${apiPort}/api/:path*`,
      },
    ];
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "X-Frame-Options", value: "DENY" },
        ],
      },
    ];
  },
};
export default config;
