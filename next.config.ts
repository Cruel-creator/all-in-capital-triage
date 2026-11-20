import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // server-only packages used by data loaders and the pipeline
  serverExternalPackages: ["unpdf", "firecrawl", "@opentelemetry/sdk-node", "@langfuse/otel"],
};

export default nextConfig;
