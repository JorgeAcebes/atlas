import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "*.supabase.co" },
      { protocol: "https", hostname: "*.r2.dev" },
      { protocol: "https", hostname: "*.cloudflarestorage.com" },
    ],
  },
  transpilePackages: ["lucide-react"],
};

export default nextConfig;
