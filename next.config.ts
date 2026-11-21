import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // server-only packages used by data loaders and the pipeline
  serverExternalPackages: ["unpdf", "firecrawl", "@opentelemetry/sdk-node", "@langfuse/otel"],
  poweredByHeader: false,
  async headers() {
    const h = [
      { key: "X-Frame-Options", value: "DENY" },
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
      ...(process.env.NODE_ENV === "production" ? [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" }] : []),
    ];
    return [{ source: "/:path*", headers: h }];
  },
};

export default nextConfig;
