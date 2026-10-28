import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "export",
  experimental: { globalNotFound: true },
  allowedDevOrigins: process.env.VMAP_DEV_HOSTS?.split(",") ?? [],
  ...(process.env.VMAP_DEV_API && {
    rewrites: () => Promise.resolve([{ source: "/api/:path*", destination: `${process.env.VMAP_DEV_API}/api/:path*` }]),
  }),
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
