import type { Metadata } from "next";
import { getSupabaseServerClient } from "./supabase-server";
import { getPhotoDisplayUrl } from "./photo-client";
import { peaks } from "@/data/peaks";
import { countries } from "@/data/countries";
import { predefinedCategories } from "@/data/experiences";

interface ResolveRecordMetadataOptions {
  username: string;
  challenge?: string;
  recordId?: string;
}

function toAbsoluteImageUrl(rawUrl: string, appUrl: string): string {
  if (!rawUrl) return `${appUrl}/icon-512.png`;
  if (rawUrl.startsWith("http://") || rawUrl.startsWith("https://")) {
    return rawUrl;
  }
  return `${appUrl}${rawUrl.startsWith("/") ? "" : "/"}${rawUrl}`;
}

export async function resolveRecordMetadata(
  options: ResolveRecordMetadataOptions
): Promise<Metadata> {
  const { username, challenge, recordId } = options;
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL || "https://atlas-log.vercel.app").replace(/\/+$/, "");
  const defaultImage = `${appUrl}/icon-512.png`;

  let cleanId = "";
  if (recordId) {
    try {
      cleanId = decodeURIComponent(recordId).trim();
    } catch {
      cleanId = recordId.trim();
    }
  }

  let displayTitle = cleanId;
  let categoryName = "";
  let effectiveChallenge = challenge || "countries";

  const matchedPeak = cleanId
    ? peaks.find(
        (p) =>
          p.id.toLowerCase() === cleanId.toLowerCase() ||
          p.code === cleanId ||
          p.name.toLowerCase() === cleanId.toLowerCase()
      )
    : null;

  const matchedCountry =
    cleanId && !matchedPeak
      ? countries.find(
          (c) =>
            c.id.toLowerCase() === cleanId.toLowerCase() ||
            c.iso_a2.toLowerCase() === cleanId.toLowerCase() ||
            c.name.toLowerCase() === cleanId.toLowerCase()
        )
      : null;

  let isExperience = effectiveChallenge === "experiences" || cleanId.startsWith("exp-");
  let expSubItemTitle = "";

  if (matchedPeak) {
    effectiveChallenge = "peaks";
    const altStr = Math.round(matchedPeak.altitude)
      .toString()
      .replace(/\B(?=(\d{3})+(?!\d))/g, ".");
    displayTitle = `${matchedPeak.name} (${altStr} m)`;
    categoryName = matchedPeak.province;
  } else if (matchedCountry) {
    effectiveChallenge = "countries";
    displayTitle = matchedCountry.name;
    categoryName = matchedCountry.continent;
  } else if (cleanId) {
    isExperience = true;
    effectiveChallenge = "experiences";
    const [baseExpId, subId] = cleanId.split("::");

    let foundExp: { id: string; name: string } | null = null;
    for (const cat of predefinedCategories) {
      const exp = cat.experiences.find((e) => e.id === baseExpId);
      if (exp) {
        foundExp = exp;
        categoryName = cat.name;
        if (subId && exp.subItems) {
          const sub = exp.subItems.find((s) => s.id === subId);
          if (sub) expSubItemTitle = sub.name;
        }
        break;
      }
    }

    if (foundExp) {
      displayTitle = expSubItemTitle ? `${foundExp.name} (${expSubItemTitle})` : foundExp.name;
    }
  }

  const genericTitle = `@${username} en Atlas`;
  const genericDesc = `Explora el perfil de @${username} en Atlas.`;

  const fallbackTitle = displayTitle ? `${displayTitle} · @${username} en Atlas` : genericTitle;
  const fallbackDesc = displayTitle
    ? `${displayTitle} · Registro de actividad en Atlas.`
    : genericDesc;

  const fallbackMetadata: Metadata = {
    title: fallbackTitle,
    description: fallbackDesc,
    openGraph: {
      title: fallbackTitle,
      description: fallbackDesc,
      url: `${appUrl}/perfil/${encodeURIComponent(username)}`,
      siteName: "Atlas",
      locale: "es_ES",
      type: "article",
      images: [
        {
          url: defaultImage,
          width: 512,
          height: 512,
          alt: fallbackTitle,
        },
      ],
    },
    twitter: {
      card: "summary",
      title: fallbackTitle,
      description: fallbackDesc,
      images: [defaultImage],
    },
  };

  const supabase = getSupabaseServerClient();
  if (!supabase) return fallbackMetadata;

  try {
    const { data: profile, error: profileErr } = await supabase
      .from("profiles")
      .select("id, username, avatar_url, is_public, share_photos, share_notes, is_test")
      .eq("username", username)
      .maybeSingle();

    if (profileErr || !profile || profile.is_test) {
      return {
        title: genericTitle,
        description: genericDesc,
        openGraph: {
          title: genericTitle,
          description: genericDesc,
          url: `${appUrl}/perfil/${encodeURIComponent(username)}`,
          siteName: "Atlas",
          locale: "es_ES",
          type: "profile",
          images: [{ url: defaultImage, width: 512, height: 512, alt: "Atlas" }],
        },
        twitter: {
          card: "summary",
          title: genericTitle,
          description: genericDesc,
          images: [defaultImage],
        },
      };
    }

    // Strictly enforce privacy: never expose custom experiences, notes, dates, or photos for private profiles
    if (profile.is_public === false) {
      const privateTitle = `@${profile.username} en Atlas`;
      const privateDesc = `Perfil privado de @${profile.username} en Atlas.`;
      return {
        title: privateTitle,
        description: privateDesc,
        openGraph: {
          title: privateTitle,
          description: privateDesc,
          url: `${appUrl}/perfil/${encodeURIComponent(profile.username)}`,
          siteName: "Atlas",
          locale: "es_ES",
          type: "profile",
          images: [{ url: defaultImage, width: 512, height: 512, alt: privateTitle }],
        },
        twitter: {
          card: "summary",
          title: privateTitle,
          description: privateDesc,
          images: [defaultImage],
        },
      };
    }

    if (!cleanId) {
      const profileTitle = `@${profile.username} en Atlas`;
      const profileDesc = `Explora los ascensos a cumbres, países del mundo y aventuras registradas por @${profile.username} en Atlas.`;
      const avatarDisplay = profile.avatar_url ? getPhotoDisplayUrl(profile.avatar_url) : "";
      const fullAvatarUrl = avatarDisplay
        ? toAbsoluteImageUrl(avatarDisplay, appUrl)
        : defaultImage;
      const profileImages = avatarDisplay
        ? [
            {
              url: fullAvatarUrl,
              width: 400,
              height: 400,
              alt: `@${profile.username}`,
            },
          ]
        : [
            {
              url: defaultImage,
              width: 512,
              height: 512,
              alt: "Atlas",
            },
          ];

      return {
        title: profileTitle,
        description: profileDesc,
        openGraph: {
          title: profileTitle,
          description: profileDesc,
          url: `${appUrl}/perfil/${encodeURIComponent(profile.username)}`,
          siteName: "Atlas",
          locale: "es_ES",
          type: "profile",
          images: profileImages,
        },
        twitter: {
          card: "summary",
          title: profileTitle,
          description: profileDesc,
          images: profileImages.map((img) => img.url),
        },
      };
    }

    if (isExperience && !matchedPeak && !matchedCountry) {
      const [baseExpId] = cleanId.split("::");
      const { data: customExp } = await supabase
        .from("custom_experiences")
        .select("name")
        .eq("id", baseExpId)
        .eq("user_id", profile.id)
        .maybeSingle();

      if (customExp?.name) {
        displayTitle = customExp.name;
      }
    }

    let notes: string | null = null;
    let achievedOn: string | null = null;
    let endDate: string | null = null;

    if (effectiveChallenge === "experiences") {
      const [baseExpId, subId] = cleanId.split("::");
      let query = supabase
        .from("experience_records")
        .select("achieved_on, end_date, notes")
        .eq("user_id", profile.id)
        .eq("experience_id", baseExpId)
        .eq("is_wishlist", false);

      if (subId) {
        query = query.eq("sub_item_id", subId);
      }

      const { data: expRows } = await query
        .order("achieved_on", { ascending: false })
        .limit(1);
      const expRec = Array.isArray(expRows) ? expRows[0] : null;
      if (expRec) {
        notes = expRec.notes;
        achievedOn = expRec.achieved_on;
        endDate = expRec.end_date;
      }
    } else {
      const targetSummitId = matchedPeak?.id || matchedCountry?.id || cleanId;
      const { data: ascentRows } = await supabase
        .from("ascents")
        .select("achieved_on, end_date, notes")
        .eq("user_id", profile.id)
        .eq("summit_id", targetSummitId)
        .eq("is_wishlist", false)
        .order("achieved_on", { ascending: false })
        .limit(1);
      const ascent = Array.isArray(ascentRows) ? ascentRows[0] : null;
      if (ascent) {
        notes = ascent.notes;
        achievedOn = ascent.achieved_on;
        endDate = ascent.end_date;
      }
    }

    let photoUrls: Array<{ url: string; caption: string | null }> = [];
    if (profile.share_photos !== false) {
      const targetSummitId = matchedPeak?.id || matchedCountry?.id || cleanId;
      const [baseExpId] = cleanId.split("::");

      let photoQuery = supabase
        .from("summit_photos")
        .select("public_url, storage_path, caption")
        .eq("user_id", profile.id);

      if (effectiveChallenge === "experiences") {
        const expSummitIds = Array.from(new Set([cleanId, baseExpId].filter(Boolean)));
        photoQuery = photoQuery.in("summit_id", expSummitIds);
      } else {
        photoQuery = photoQuery.eq("summit_id", targetSummitId);
      }

      const { data: photos } = await photoQuery
        .order("created_at", { ascending: false })
        .limit(4);
      if (photos && photos.length > 0) {
        photoUrls = photos
          .map((p: any) => {
            const display = getPhotoDisplayUrl(p.public_url, p.storage_path);
            return {
              url: toAbsoluteImageUrl(display, appUrl),
              caption: p.caption,
            };
          })
          .filter((p) => Boolean(p.url));
      }
    }

    const pageTitle = `${displayTitle} · @${profile.username} en Atlas`;

    let description = "";
    if (profile.share_notes !== false && notes) {
      description = `"${notes}"`;
    }

    if (achievedOn && !achievedOn.startsWith("1900-")) {
      const d = new Date(`${achievedOn}T12:00:00`);
      const dateText = new Intl.DateTimeFormat("es-ES", {
        day: "numeric",
        month: "short",
        year: "numeric",
      }).format(d);

      let fullDateText = dateText;
      if (endDate && !endDate.startsWith("1900-") && endDate !== achievedOn) {
        const ed = new Date(`${endDate}T12:00:00`);
        const endDateText = new Intl.DateTimeFormat("es-ES", {
          day: "numeric",
          month: "short",
          year: "numeric",
        }).format(ed);
        fullDateText = `${dateText} - ${endDateText}`;
      }

      description = description
        ? `${description} (${fullDateText})`
        : `Registro del ${fullDateText} por @${profile.username} en Atlas.`;
    }

    if (!description) {
      description = categoryName
        ? `${categoryName} · Registrado por @${profile.username} en Atlas.`
        : `Registro de actividad de @${profile.username} en Atlas.`;
    }

    const ogImages =
      photoUrls.length > 0
        ? photoUrls.map((p) => ({
            url: p.url,
            width: 1200,
            height: 800,
            alt: p.caption || displayTitle,
            type: p.url.endsWith(".webp") ? "image/webp" : "image/jpeg",
          }))
        : profile.avatar_url
        ? [
            {
              url: toAbsoluteImageUrl(getPhotoDisplayUrl(profile.avatar_url), appUrl),
              width: 400,
              height: 400,
              alt: `@${profile.username}`,
            },
          ]
        : [
            {
              url: defaultImage,
              width: 512,
              height: 512,
              alt: "Atlas",
            },
          ];

    const shareUrl = `${appUrl}/perfil/${encodeURIComponent(
      profile.username
    )}?challenge=${encodeURIComponent(effectiveChallenge)}&record=${encodeURIComponent(cleanId)}`;

    return {
      title: pageTitle,
      description,
      openGraph: {
        title: pageTitle,
        description,
        url: shareUrl,
        siteName: "Atlas",
        locale: "es_ES",
        type: "article",
        images: ogImages,
      },
      twitter: {
        card: photoUrls.length > 0 ? "summary_large_image" : "summary",
        title: pageTitle,
        description,
        images: [ogImages[0].url],
      },
    };
  } catch (err) {
    console.error("Error resolving record metadata:", err);
    return fallbackMetadata;
  }
}
