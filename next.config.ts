import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Micro-otimização: remove header X-Powered-By das respostas.
  poweredByHeader: false,
  experimental: {
    // Reduz o JS inicial agrupando imports de libs pesadas (lucide + recharts).
    optimizePackageImports: ['lucide-react', 'recharts'],
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "uxtnuigrlgeizblayysi.supabase.co",
        pathname: "/storage/v1/object/public/**",
      },
      {
        protocol: "https",
        hostname: "itzjkraqbsdxhznqihoz.supabase.co",
        pathname: "/storage/v1/object/public/**",
      },
    ],
  },
  async headers() {
    // Headers aditivos de segurança — não alteram rotas nem comportamento.
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
    ];
  },
};

export default nextConfig;
