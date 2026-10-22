import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactCompiler: true,
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "images.unsplash.com",
      },
    ],
  },
  async redirects() {
    return [
      // `:path*` also matches zero segments, so this covers /dashboard/budgeting
      // itself. Old sub-paths land on the Budget overview rather than being mapped.
      {
        source: "/dashboard/budgeting/:path*",
        destination: "/dashboard/budget",
        permanent: false,
      },
    ];
  },
};

export default nextConfig;

