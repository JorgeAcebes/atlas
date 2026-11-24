import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://atlas-log.vercel.app";

  return {
    rules: {
      userAgent: "*",
      allow: [
        "/",
        "/picos",
        "/ranking",
        "/social",
        "/perfil/",
        "/terminos",
        "/privacidad",
        "/developers",
        "/llms.txt",
        "/llms-full.txt",
        "/openapi.json",
        "/mcp",
        "/.well-known/",
        "/api/v1/catalog/",
        "/api/v1/openapi.json",
      ],
      disallow: ["/api/account/", "/api/auth/", "/api/keepalive", "/api/push/", "/reset-password"],
    },
    sitemap: `${baseUrl}/sitemap.xml`,
  };
}
