import type { Metadata } from "next";
import { getSupabaseServerClient } from "./supabase-server";
import { peaks } from "@/data/peaks";
import { countries } from "@/data/countries";
import { predefinedCategories } from "@/data/experiences";

interface ResolveRecordMetadataOptions {
  username: string;
  challenge?: string;
  recordId?: string;
}

export async function resolveRecordMetadata(
  options: ResolveRecordMetadataOptions
): Promise<Metadata> {
  const { username, challenge, recordId } = options;
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL || "https://atlas-log.vercel.app").replace(/\/+$/, "");
  const defaultImage = `${appUrl}/icon-512.png`;

  // 1. Identificar si hay un registro específico solicitado
  const cleanId = recordId ? decodeURIComponent(recordId).trim() : "";
  let displayTitle = cleanId;
  let categoryName = "";
  let effectiveChallenge = challenge || "countries";

  // A) Cumbre provincial
  const matchedPeak = cleanId
    ? peaks.find(
        (p) =>
          p.id.toLowerCase() === cleanId.toLowerCase() ||
          p.code === cleanId ||
          p.name.toLowerCase() === cleanId.toLowerCase()
      )
    : null;

  // B) País
  const matchedCountry = cleanId && !matchedPeak
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
    const altStr = Math.round(matchedPeak.altitude).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
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

  // Fallback metadata estructurada (si la BD falla o el usuario no existe)
  const fallbackTitle = displayTitle
    ? `${displayTitle} · @${username} en Atlas`
    : `@${username} en Atlas`;
  const fallbackDesc = displayTitle
    ? `${displayTitle} · Registro de actividad en Atlas.`
    : `Explora el perfil de @${username} en Atlas.`;

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
    // 2. Obtener datos del perfil en Supabase (sin columna full_name que no existe)
    const { data: profile, error: profileErr } = await supabase
      .from("profiles")
      .select("id, username, avatar_url, is_public, share_photos, share_notes, is_test")
      .eq("username", username)
      .maybeSingle();

    if (profileErr || !profile) {
      return fallbackMetadata;
    }

    // Si no hay recordId específico: metadata general del perfil del usuario
    if (!cleanId) {
      const profileTitle = `@${profile.username} en Atlas`;
      const profileDesc = `Explora los ascensos a cumbres, países del mundo y aventuras registradas por @${profile.username} en Atlas.`;
      const profileImages = profile.avatar_url
        ? [
            {
              url: profile.avatar_url,
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

    // Si es experiencia personalizada, buscar su nombre en custom_experiences
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

    // 3. Consultar notas y fechas de la actividad
    let notes: string | null = null;
    let achievedOn: string | null = null;
    let endDate: string | null = null;

    if (effectiveChallenge === "experiences") {
      const [baseExpId, subId] = cleanId.split("::");
      let query = supabase
        .from("experience_records")
        .select("achieved_on, end_date, notes")
        .eq("user_id", profile.id)
        .eq("experience_id", baseExpId);

      if (subId) {
        query = query.eq("sub_item_id", subId);
      }

      const { data: expRec } = await query.maybeSingle();
      if (expRec) {
        notes = expRec.notes;
        achievedOn = expRec.achieved_on;
        endDate = expRec.end_date;
      }
    } else {
      const targetSummitId = matchedPeak?.id || matchedCountry?.id || cleanId;
      const { data: ascent } = await supabase
        .from("ascents")
        .select("achieved_on, end_date, notes")
        .eq("user_id", profile.id)
        .eq("summit_id", targetSummitId)
        .maybeSingle();

      if (ascent) {
        notes = ascent.notes;
        achievedOn = ascent.achieved_on;
        endDate = ascent.end_date;
      }
    }

    // 4. Consultar fotos del registro
    let photoUrls: Array<{ url: string; caption: string | null }> = [];
    if (profile.share_photos !== false) {
      const targetSummitId = matchedPeak?.id || matchedCountry?.id || cleanId;
      const [baseExpId] = cleanId.split("::");

      let photoQuery = supabase
        .from("summit_photos")
        .select("public_url, caption")
        .eq("user_id", profile.id);

      if (effectiveChallenge === "experiences") {
        photoQuery = photoQuery.or(`summit_id.eq.${cleanId},summit_id.eq.${baseExpId}`);
      } else {
        photoQuery = photoQuery.eq("summit_id", targetSummitId);
      }

      const { data: photos } = await photoQuery.order("created_at", { ascending: false }).limit(4);
      if (photos && photos.length > 0) {
        photoUrls = photos.map((p) => ({ url: p.public_url, caption: p.caption }));
      }
    }

    // 5. Construir textos descriptivos para el overview
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

    // 6. Configurar imágenes para Open Graph y Twitter
    // WhatsApp da máxima prioridad a la primera imagen en og:image
    const ogImages =
      photoUrls.length > 0
        ? [
            {
              url: photoUrls[0].url,
              width: 1200,
              height: 800,
              alt: photoUrls[0].caption || displayTitle,
              type: photoUrls[0].url.endsWith(".webp") ? "image/webp" : "image/jpeg",
            },
            ...photoUrls.slice(1).map((p) => ({
              url: p.url,
              width: 1200,
              height: 800,
              alt: p.caption || displayTitle,
              type: p.url.endsWith(".webp") ? "image/webp" : "image/jpeg",
            })),
          ]
        : profile.avatar_url
        ? [
            {
              url: profile.avatar_url,
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

    const shareUrl = `${appUrl}/perfil/${encodeURIComponent(profile.username)}?challenge=${encodeURIComponent(
      effectiveChallenge
    )}&record=${encodeURIComponent(cleanId)}`;

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
