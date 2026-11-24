import type { MetadataRoute } from "next";
import { supabase } from "@/lib/supabase";

export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://atlas-log.vercel.app";
  const now = new Date();

  const staticEntries: MetadataRoute.Sitemap = [
    {
      url: baseUrl,
      lastModified: now,
      changeFrequency: "daily",
      priority: 1.0,
    },
    {
      url: `${baseUrl}/picos`,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 0.9,
    },
    {
      url: `${baseUrl}/ranking`,
      lastModified: now,
      changeFrequency: "daily",
      priority: 0.8,
    },
    {
      url: `${baseUrl}/social`,
      lastModified: now,
      changeFrequency: "daily",
      priority: 0.7,
    },
    {
      url: `${baseUrl}/terminos`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.4,
    },
    {
      url: `${baseUrl}/privacidad`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.4,
    },
  ];

  let profileEntries: MetadataRoute.Sitemap = [];
  if (supabase) {
    try {
      const { data: profiles } = await supabase
        .from("profiles")
        .select("username, updated_at")
        .eq("is_public", true)
        .neq("is_test", true)
        .order("updated_at", { ascending: false })
        .limit(1000);

      if (profiles && profiles.length > 0) {
        profileEntries = profiles
          .filter((p) => Boolean(p.username))
          .map((p) => ({
            url: `${baseUrl}/perfil/${encodeURIComponent(p.username)}`,
            lastModified: p.updated_at ? new Date(p.updated_at) : now,
            changeFrequency: "weekly",
            priority: 0.6,
          }));
      }
    } catch {
      // Ignore connection issues during build
    }
  }

  return [...staticEntries, ...profileEntries];
}
