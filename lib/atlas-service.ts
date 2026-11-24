import crypto from "node:crypto";
import { countries } from "@/data/countries";
import { predefinedCategories } from "@/data/experiences";
import {
  buildVisibleExperienceCategories,
  countCompletedCountriesUnique,
  countCompletedExperiences,
  countCompletedPeaksUnique,
  countriesById,
  getPredefinedExperienceTotalCount,
  peakCodesById,
  peakProvincesById,
  peaksById,
} from "@/lib/progress-utils";
import { normalizeSafeExternalUrl } from "@/lib/link-utils";
import { SAFE_RASTER_IMAGE_MIMES } from "@/lib/photo-security";
import {
  checkStorageLimit,
  createPresignedR2UploadUrl,
  deleteR2Object,
  deleteR2Objects,
  getR2ObjectBuffer,
  isR2Configured,
  uploadR2Object,
} from "@/lib/r2-storage";
import {
  ImageValidationError,
  MAX_PHOTO_UPLOAD_BYTES,
  sanitizeUploadFileName,
  validateAndOptimizeImageBuffer,
} from "@/lib/server-image";
import {
  signUploadIntentToken,
  verifyUploadIntentToken,
} from "@/lib/upload-intent-token";
import { toAbsoluteDisplayUrl } from "@/lib/api-http";
import { isPushConfigured, notifyFollowersOfNewPost } from "@/lib/push-notifications";
import type { AuthenticatedApiContext } from "@/lib/api-auth";

export const MAX_PHOTOS_PER_RECORD = 4;

export class AtlasServiceError extends Error {
  public readonly status: number;
  public readonly code: string;
  public readonly title: string;
  public readonly resolution?: string;
  public readonly extra?: Record<string, unknown>;

  constructor(options: {
    status: number;
    code: string;
    title: string;
    detail: string;
    resolution?: string;
    extra?: Record<string, unknown>;
  }) {
    super(options.detail);
    this.name = "AtlasServiceError";
    this.status = options.status;
    this.code = options.code;
    this.title = options.title;
    this.resolution = options.resolution;
    this.extra = options.extra;
  }
}

export function normalizeSearchText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function clampLimit(limit: unknown, defaultVal = 50, maxVal = 250): number {
  const num = typeof limit === "number" ? limit : Number(limit);
  if (!Number.isFinite(num) || num <= 0) return defaultVal;
  return Math.min(Math.floor(num), maxVal);
}

export function searchCountries(params: {
  q?: string | null;
  continent?: string | null;
  limit?: number;
}) {
  const qNorm = params.q ? normalizeSearchText(params.q) : "";
  const contNorm = params.continent ? normalizeSearchText(params.continent) : "";
  const limit = clampLimit(params.limit, 196, 250);

  const filtered = countries.filter((c) => {
    if (contNorm && normalizeSearchText(c.continent) !== contNorm) {
      return false;
    }
    if (!qNorm) return true;
    const haystack = normalizeSearchText(
      `${c.id} ${c.name} ${c.capital} ${c.continent} ${c.iso_a2}`
    );
    return haystack.includes(qNorm);
  });

  return {
    total_countries: countries.length,
    count: Math.min(filtered.length, limit),
    items: filtered.slice(0, limit).map((c) => ({
      id: c.id,
      type: "country" as const,
      name: c.name,
      capital: c.capital,
      continent: c.continent,
      iso_a2: c.iso_a2,
      iso_n3: c.iso_n3,
      coordinates: c.coordinates || null,
    })),
  };
}

export function searchPeaks(params: {
  q?: string | null;
  province?: string | null;
  limit?: number;
}) {
  const qNorm = params.q ? normalizeSearchText(params.q) : "";
  const provNorm = params.province ? normalizeSearchText(params.province) : "";
  const limit = clampLimit(params.limit, 47, 100);

  const uniquePeaks = Array.from(peaksById.values()).map((peak) => {
    const provinces = peakProvincesById.get(peak.id) || [peak.province];
    const codes = peakCodesById.get(peak.id) || [peak.code];
    return {
      id: peak.id,
      type: "peak" as const,
      name: peak.name,
      altitude: peak.altitude,
      range: peak.range,
      provinces,
      codes,
      shared: provinces.length > 1,
      coordinates: peak.coordinates,
      note: peak.note,
    };
  });

  const filtered = uniquePeaks.filter((p) => {
    if (
      provNorm &&
      !p.provinces.some((prov) => normalizeSearchText(prov).includes(provNorm))
    ) {
      return false;
    }
    if (!qNorm) return true;
    const haystack = normalizeSearchText(
      `${p.id} ${p.name} ${p.range} ${p.provinces.join(" ")} ${p.codes.join(" ")}`
    );
    return haystack.includes(qNorm);
  });

  return {
    total_physical_peaks: 47,
    total_demarcations: 52,
    count: Math.min(filtered.length, limit),
    items: filtered.slice(0, limit),
  };
}

export async function searchExperiences(
  params: {
    q?: string | null;
    category?: string | null;
    limit?: number;
  },
  auth?: AuthenticatedApiContext | null
) {
  const qNorm = params.q ? normalizeSearchText(params.q) : "";
  const catNorm = params.category ? normalizeSearchText(params.category) : "";
  const limit = clampLimit(params.limit, 100, 250);

  let categories = predefinedCategories.map((cat) => ({
    id: cat.id,
    name: cat.name,
    iconName: cat.iconName,
    isCustomCat: false,
    experiences: cat.experiences.map((e) => ({ ...e, isCustom: false })),
  }));

  if (auth) {
    const [customExpRes, customCatRes, hiddenRes] = await Promise.all([
      auth.supabase
        .from("custom_experiences")
        .select("*")
        .eq("user_id", auth.userId),
      auth.supabase
        .from("custom_experience_categories")
        .select("*")
        .eq("user_id", auth.userId),
      auth.supabase
        .from("hidden_items")
        .select("item_id, item_type")
        .eq("user_id", auth.userId),
    ]);

    categories = buildVisibleExperienceCategories(
      customExpRes.data || [],
      customCatRes.data || [],
      hiddenRes.data || []
    ).map((c) => ({
      id: c.id,
      name: c.name,
      iconName: c.iconName,
      isCustomCat: Boolean(c.isCustomCat),
      experiences: c.experiences.map((e) => ({
        ...e,
        isCustom: Boolean(e.isCustom),
      })),
    }));
  }

  const results: Array<{
    id: string;
    type: "experience";
    name: string;
    category_id: string;
    category_name: string;
    is_custom: boolean;
    sub_items: Array<{ id: string; name: string }>;
  }> = [];

  for (const cat of categories) {
    if (
      catNorm &&
      normalizeSearchText(cat.id) !== catNorm &&
      !normalizeSearchText(cat.name).includes(catNorm)
    ) {
      continue;
    }

    for (const exp of cat.experiences) {
      const subItems = Array.isArray(exp.subItems) ? exp.subItems : [];
      if (qNorm) {
        const subText = subItems.map((s) => `${s.id} ${s.name}`).join(" ");
        const haystack = normalizeSearchText(
          `${exp.id} ${exp.name} ${cat.name} ${subText}`
        );
        if (!haystack.includes(qNorm)) continue;
      }

      results.push({
        id: exp.id,
        type: "experience",
        name: exp.name,
        category_id: cat.id,
        category_name: cat.name,
        is_custom: Boolean(exp.isCustom),
        sub_items: subItems.map((s) => ({ id: s.id, name: s.name })),
      });
    }
  }

  return {
    total_predefined: getPredefinedExperienceTotalCount(),
    count: Math.min(results.length, limit),
    items: results.slice(0, limit),
  };
}

export interface ResolvedTarget {
  baseId: string;
  subItemId: string | null;
  expectedSummitId: string;
  itemType: "country" | "peak" | "experience";
  title: string;
  folder: string;
}

const predefinedExpMap = new Map<
  string,
  { id: string; name: string; subItems?: Array<{ id: string; name: string }> }
>();
for (const cat of predefinedCategories) {
  for (const exp of cat.experiences) {
    predefinedExpMap.set(exp.id, exp);
  }
}

export async function resolveTargetItem(
  input: { summit_id: string; sub_item_id?: string | null },
  auth?: AuthenticatedApiContext | null
): Promise<ResolvedTarget> {
  const rawId = typeof input.summit_id === "string" ? input.summit_id.trim() : "";
  if (!rawId) {
    throw new AtlasServiceError({
      status: 400,
      code: "invalid_target",
      title: "Identificador requerido",
      detail: "Debes indicar 'summit_id' (p. ej. 'country-jp', 'granada' o 'exp-aurora').",
      resolution: "Consulta GET /api/v1/catalog/countries, /peaks o /experiences (o search_catalog).",
    });
  }

  let baseId = rawId;
  let subItemId =
    typeof input.sub_item_id === "string" && input.sub_item_id.trim()
      ? input.sub_item_id.trim()
      : null;

  if (rawId.includes("::")) {
    const [left, right] = rawId.split("::");
    baseId = left.trim();
    if (!subItemId && right?.trim()) {
      subItemId = right.trim();
    }
  }

  // 1. Country
  const country = countriesById.get(baseId);
  if (country) {
    if (subItemId) {
      throw new AtlasServiceError({
        status: 400,
        code: "invalid_sub_item",
        title: "Sub-item no aplicable",
        detail: `El país '${baseId}' no admite sub_item_id.`,
      });
    }
    return {
      baseId: country.id,
      subItemId: null,
      expectedSummitId: country.id,
      itemType: "country",
      title: country.name,
      folder: country.id,
    };
  }

  // 2. Peak
  const peak = peaksById.get(baseId);
  if (peak) {
    if (subItemId) {
      throw new AtlasServiceError({
        status: 400,
        code: "invalid_sub_item",
        title: "Sub-item no aplicable",
        detail: `La cumbre '${baseId}' no admite sub_item_id.`,
      });
    }
    return {
      baseId: peak.id,
      subItemId: null,
      expectedSummitId: peak.id,
      itemType: "peak",
      title: peak.name,
      folder: peak.id,
    };
  }

  // 3. Predefined Experience
  let exp = predefinedExpMap.get(baseId);

  // 4. Custom Experience (authenticated user)
  if (!exp && auth) {
    const { data: customExp } = await auth.supabase
      .from("custom_experiences")
      .select("id, name, sub_items")
      .eq("id", baseId)
      .eq("user_id", auth.userId)
      .maybeSingle();

    if (customExp) {
      exp = {
        id: customExp.id,
        name: customExp.name,
        subItems: Array.isArray(customExp.sub_items) ? customExp.sub_items : [],
      };
    }
  }

  if (!exp) {
    throw new AtlasServiceError({
      status: 400,
      code: "invalid_target",
      title: "Destino o experiencia no encontrado",
      detail: `No se reconoce el summit_id '${rawId}'.`,
      resolution:
        "Usa GET /api/v1/catalog/countries, /peaks o /experiences (o la herramienta search_catalog) para obtener un ID válido.",
    });
  }

  const subItems = Array.isArray(exp.subItems) ? exp.subItems : [];
  if (subItems.length > 0 && subItemId) {
    const validSub = subItems.find((s) => s.id === subItemId);
    if (!validSub) {
      throw new AtlasServiceError({
        status: 400,
        code: "invalid_sub_item",
        title: "Sub-item inválido",
        detail: `El sub_item_id '${subItemId}' no pertenece a '${exp.id}'.`,
        extra: { allowed_sub_items: subItems.map((s) => s.id) },
      });
    }
  } else if (subItems.length === 0 && subItemId) {
    throw new AtlasServiceError({
      status: 400,
      code: "invalid_sub_item",
      title: "Sub-item no aplicable",
      detail: `La experiencia '${exp.id}' no tiene sub-items.`,
    });
  }

  const expectedSummitId = subItemId ? `${exp.id}::${subItemId}` : exp.id;
  const folder = expectedSummitId.replace(/[^a-zA-Z0-9._-]/g, "-");

  return {
    baseId: exp.id,
    subItemId,
    expectedSummitId,
    itemType: "experience",
    title: exp.name,
    folder,
  };
}

export function normalizeDateInput(
  rawDate?: string | null,
  dateUnknown?: boolean
): string {
  if (dateUnknown || rawDate === "unknown" || rawDate === "1900-01-01") {
    return "1900-01-01";
  }

  if (!rawDate || (typeof rawDate === "string" && !rawDate.trim())) {
    return new Date().toISOString().slice(0, 10);
  }

  const trimmed = String(rawDate).trim();
  const match = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) {
    throw new AtlasServiceError({
      status: 400,
      code: "invalid_date",
      title: "Formato de fecha inválido",
      detail: `La fecha '${trimmed}' debe tener formato YYYY-MM-DD (o '1900-01-01' si se desconoce).`,
    });
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() + 1 !== month ||
    parsed.getUTCDate() !== day
  ) {
    throw new AtlasServiceError({
      status: 400,
      code: "invalid_date",
      title: "Fecha inválida",
      detail: `La fecha '${trimmed}' no existe en el calendario.`,
    });
  }

  return trimmed;
}

function normalizeOptionalLink(rawLink: unknown): string | null {
  if (rawLink === undefined || rawLink === null) return null;
  if (typeof rawLink !== "string" || !rawLink.trim()) return null;
  const safe = normalizeSafeExternalUrl(rawLink);
  if (!safe) {
    throw new AtlasServiceError({
      status: 400,
      code: "invalid_link",
      title: "Enlace inválido",
      detail: "Los enlaces deben ser URLs HTTP o HTTPS válidas.",
    });
  }
  return safe;
}

function normalizeCaption(rawCaption: unknown): string | null {
  if (rawCaption === undefined || rawCaption === null) return null;
  if (typeof rawCaption !== "string") return null;
  const trimmed = rawCaption.trim();
  return trimmed ? trimmed.slice(0, 500) : null;
}

function normalizeShotAt(rawShotAt: unknown): string {
  if (typeof rawShotAt === "string" && rawShotAt.trim()) {
    const ms = Date.parse(rawShotAt.trim());
    if (!Number.isNaN(ms)) {
      return new Date(ms).toISOString();
    }
  }
  return new Date().toISOString();
}

export async function getAuthenticatedUserSummary(
  auth: AuthenticatedApiContext,
  baseUrl: string
) {
  const [
    profileRes,
    ascentsRes,
    expRecordsRes,
    customExpRes,
    customCatRes,
    hiddenRes,
    photosRes,
  ] = await Promise.all([
    auth.supabase
      .from("profiles")
      .select(
        "id, username, avatar_url, is_public, enable_peaks, enable_countries, enable_experiences, share_photos, share_notes, created_at, updated_at"
      )
      .eq("id", auth.userId)
      .maybeSingle(),
    auth.supabase
      .from("ascents")
      .select("summit_id, is_wishlist")
      .eq("user_id", auth.userId),
    auth.supabase
      .from("experience_records")
      .select("experience_id, sub_item_id, is_wishlist")
      .eq("user_id", auth.userId),
    auth.supabase
      .from("custom_experiences")
      .select("*")
      .eq("user_id", auth.userId),
    auth.supabase
      .from("custom_experience_categories")
      .select("*")
      .eq("user_id", auth.userId),
    auth.supabase
      .from("hidden_items")
      .select("item_id, item_type")
      .eq("user_id", auth.userId),
    auth.supabase
      .from("summit_photos")
      .select("id", { count: "exact", head: true })
      .eq("user_id", auth.userId),
  ]);

  if (profileRes.error) {
    throw new AtlasServiceError({
      status: 500,
      code: "database_error",
      title: "Error al leer perfil",
      detail: profileRes.error.message,
    });
  }

  const ascents = ascentsRes.data || [];
  const expRecords = expRecordsRes.data || [];
  const visibleExpCats = buildVisibleExperienceCategories(
    customExpRes.data || [],
    customCatRes.data || [],
    hiddenRes.data || []
  );

  const completedPeaks = countCompletedPeaksUnique(ascents);
  const completedCountries = countCompletedCountriesUnique(ascents);
  const completedExperiences = countCompletedExperiences(visibleExpCats, expRecords);
  const totalExperiences = visibleExpCats.reduce(
    (sum, c) => sum + c.experiences.length,
    0
  );

  const profile = profileRes.data;

  return {
    user_id: auth.userId,
    auth_type: auth.authType,
    scopes: auth.scopes,
    profile: profile
      ? {
          id: profile.id,
          username: profile.username,
          avatar_url: profile.avatar_url
            ? toAbsoluteDisplayUrl(profile.avatar_url, null, baseUrl)
            : null,
          is_public: Boolean(profile.is_public),
          enable_peaks: profile.enable_peaks ?? true,
          enable_countries: profile.enable_countries ?? true,
          enable_experiences: profile.enable_experiences ?? false,
          share_photos: profile.share_photos ?? true,
          share_notes: profile.share_notes ?? true,
        }
      : null,
    progress: {
      peaks: { completed: completedPeaks, total: 47 },
      countries: { completed: completedCountries, total: 196 },
      experiences: { completed: completedExperiences, total: totalExperiences },
      photos_count: photosRes.count ?? 0,
    },
  };
}

function formatPhotoRow(row: any, baseUrl: string) {
  return {
    id: row.id,
    summit_id: row.summit_id,
    storage_path: row.storage_path,
    public_url: row.public_url,
    display_url: toAbsoluteDisplayUrl(row.public_url, row.storage_path, baseUrl),
    taken_on: row.taken_on,
    shot_at: row.shot_at || null,
    caption: row.caption || null,
    file_size: typeof row.file_size === "number" ? row.file_size : Number(row.file_size) || 0,
    created_at: row.created_at,
  };
}

export async function listUserRecords(
  auth: AuthenticatedApiContext,
  params: {
    type?: "all" | "country" | "peak" | "experience";
    summit_id?: string | null;
    include_wishlist?: boolean;
    baseUrl: string;
  }
) {
  const filterType = params.type || "all";
  const includeWishlist = Boolean(params.include_wishlist);

  const [ascentsRes, expRes, photosRes] = await Promise.all([
    filterType === "experience"
      ? Promise.resolve({ data: [], error: null })
      : auth.supabase
          .from("ascents")
          .select("*")
          .eq("user_id", auth.userId)
          .order("achieved_on", { ascending: false }),
    filterType === "country" || filterType === "peak"
      ? Promise.resolve({ data: [], error: null })
      : auth.supabase
          .from("experience_records")
          .select("*")
          .eq("user_id", auth.userId)
          .order("achieved_on", { ascending: false }),
    auth.supabase
      .from("summit_photos")
      .select("*")
      .eq("user_id", auth.userId)
      .order("created_at", { ascending: true }),
  ]);

  if (ascentsRes.error) {
    throw new AtlasServiceError({
      status: 500,
      code: "database_error",
      title: "Error al listar registros",
      detail: ascentsRes.error.message,
    });
  }
  if (expRes.error) {
    throw new AtlasServiceError({
      status: 500,
      code: "database_error",
      title: "Error al listar experiencias",
      detail: expRes.error.message,
    });
  }

  const allPhotos = (photosRes.data || []).map((p: any) =>
    formatPhotoRow(p, params.baseUrl)
  );

  const records: Array<Record<string, unknown>> = [];

  for (const a of ascentsRes.data || []) {
    if (!includeWishlist && a.is_wishlist) continue;
    if (params.summit_id && a.summit_id !== params.summit_id) continue;

    const isCountry = a.summit_id?.startsWith("country-");
    const isPeak = !isCountry && peaksById.has(a.summit_id);
    const kind = isCountry ? "country" : isPeak ? "peak" : "other";
    if (filterType === "country" && kind !== "country") continue;
    if (filterType === "peak" && kind !== "peak") continue;

    const catalogItem = isCountry
      ? countriesById.get(a.summit_id)
      : peaksById.get(a.summit_id);

    const matchingPhotos = allPhotos.filter(
      (p: any) => p.summit_id === a.summit_id && p.taken_on === a.achieved_on
    );

    records.push({
      id: a.id || null,
      record_kind: kind,
      summit_id: a.summit_id,
      title: catalogItem?.name || a.summit_id,
      achieved_on: a.achieved_on,
      end_date: a.end_date || null,
      notes: a.notes || null,
      link: a.link || null,
      link_name: a.link_name || null,
      link_2: a.link_2 || null,
      link_name_2: a.link_name_2 || null,
      is_wishlist: Boolean(a.is_wishlist),
      photos: matchingPhotos,
      created_at: a.created_at || null,
    });
  }

  for (const r of expRes.data || []) {
    if (!includeWishlist && r.is_wishlist) continue;
    const expectedSummitId = r.sub_item_id
      ? `${r.experience_id}::${r.sub_item_id}`
      : r.experience_id;
    if (
      params.summit_id &&
      r.experience_id !== params.summit_id &&
      expectedSummitId !== params.summit_id
    ) {
      continue;
    }

    const predefined = predefinedExpMap.get(r.experience_id);
    const matchingPhotos = allPhotos.filter(
      (p: any) =>
        (p.summit_id === expectedSummitId ||
          (!r.sub_item_id && p.summit_id === r.experience_id)) &&
        p.taken_on === r.achieved_on
    );

    records.push({
      id: r.id,
      record_kind: "experience",
      summit_id: expectedSummitId,
      experience_id: r.experience_id,
      sub_item_id: r.sub_item_id || null,
      title: predefined?.name || r.location_name || r.experience_id,
      achieved_on: r.achieved_on,
      location_name: r.location_name || null,
      lat: r.lat ?? null,
      lng: r.lng ?? null,
      notes: r.notes || null,
      link: r.link || null,
      link_name: r.link_name || null,
      link_2: r.link_2 || null,
      link_name_2: r.link_name_2 || null,
      is_wishlist: Boolean(r.is_wishlist),
      photos: matchingPhotos,
      created_at: r.created_at || null,
    });
  }

  return {
    count: records.length,
    records,
  };
}

export interface UpsertRecordInput {
  summit_id: string;
  sub_item_id?: string | null;
  achieved_on?: string | null;
  date_unknown?: boolean;
  end_date?: string | null;
  notes?: string | null;
  link?: string | null;
  link_name?: string | null;
  link_2?: string | null;
  link_name_2?: string | null;
  is_wishlist?: boolean;
  lat?: number | null;
  lng?: number | null;
  location_name?: string | null;
  record_id?: string | null;
}

export async function upsertUserRecord(
  auth: AuthenticatedApiContext,
  input: UpsertRecordInput
) {
  const target = await resolveTargetItem(
    { summit_id: input.summit_id, sub_item_id: input.sub_item_id },
    auth
  );

  const isWishlist = Boolean(input.is_wishlist);
  const achievedOn = isWishlist
    ? normalizeDateInput(input.achieved_on || new Date().toISOString().slice(0, 10), false)
    : normalizeDateInput(input.achieved_on, input.date_unknown);

  let endDate: string | null = null;
  if (input.end_date) {
    endDate = normalizeDateInput(input.end_date, false);
    if (endDate < achievedOn) {
      throw new AtlasServiceError({
        status: 400,
        code: "invalid_date_range",
        title: "Rango de fechas inválido",
        detail: "end_date no puede ser anterior a achieved_on.",
      });
    }
  }

  const notes =
    typeof input.notes === "string" && input.notes.trim()
      ? input.notes.trim()
      : null;
  const link = normalizeOptionalLink(input.link);
  const linkName =
    typeof input.link_name === "string" && input.link_name.trim()
      ? input.link_name.trim()
      : null;
  const link2 = normalizeOptionalLink(input.link_2);
  const linkName2 =
    typeof input.link_name_2 === "string" && input.link_name_2.trim()
      ? input.link_name_2.trim()
      : null;

  if (target.itemType === "experience") {
    const lat = input.lat !== undefined && input.lat !== null ? Number(input.lat) : null;
    const lng = input.lng !== undefined && input.lng !== null ? Number(input.lng) : null;

    if (!isWishlist) {
      if (
        lat === null ||
        lng === null ||
        !Number.isFinite(lat) ||
        !Number.isFinite(lng) ||
        lat < -90 ||
        lat > 90 ||
        lng < -180 ||
        lng > 180
      ) {
        throw new AtlasServiceError({
          status: 400,
          code: "coordinates_required",
          title: "Coordenadas requeridas",
          detail:
            "Los registros de experiencia requieren coordenadas válidas 'lat' (-90..90) y 'lng' (-180..180).",
          resolution:
            "Proporciona lat y lng en el cuerpo de la petición o establece is_wishlist: true.",
        });
      }
    }

    const locationName =
      typeof input.location_name === "string" && input.location_name.trim()
        ? input.location_name.trim()
        : null;

    if (input.record_id) {
      const { data: updated, error } = await auth.supabase
        .from("experience_records")
        .update({
          achieved_on: achievedOn,
          notes,
          link,
          link_name: linkName,
          link_2: link2,
          link_name_2: linkName2,
          lat,
          lng,
          location_name: locationName,
          is_wishlist: isWishlist,
        })
        .eq("id", input.record_id)
        .eq("user_id", auth.userId)
        .select()
        .maybeSingle();

      if (error || !updated) {
        throw new AtlasServiceError({
          status: error ? 500 : 404,
          code: error ? "database_error" : "record_not_found",
          title: error ? "Error al actualizar experiencia" : "Registro no encontrado",
          detail: error?.message || "No se encontró un registro propio con ese record_id.",
        });
      }

      return { target, record: updated, created: false };
    }

    const { data: inserted, error } = await auth.supabase
      .from("experience_records")
      .insert({
        user_id: auth.userId,
        experience_id: target.baseId,
        sub_item_id: target.subItemId,
        achieved_on: achievedOn,
        notes,
        link,
        link_name: linkName,
        link_2: link2,
        link_name_2: linkName2,
        lat,
        lng,
        location_name: locationName,
        is_wishlist: isWishlist,
      })
      .select()
      .single();

    if (error) {
      throw new AtlasServiceError({
        status: 500,
        code: "database_error",
        title: "Error al guardar experiencia",
        detail: error.message,
      });
    }

    if (!isWishlist && isPushConfigured()) {
      void notifyFollowersOfNewPost(auth.supabase, {
        actorUserId: auth.userId,
        itemKind: "experience",
        itemId: target.baseId,
        subItemId: target.subItemId,
        title: target.title,
      }).catch(() => {});
    }

    return { target, record: inserted, created: true };
  }

  // Country or Peak ascent
  let existingAscentBefore: any = null;
  if (!isWishlist && isPushConfigured()) {
    const { data: existingRow } = await auth.supabase
      .from("ascents")
      .select("id")
      .eq("user_id", auth.userId)
      .eq("summit_id", target.baseId)
      .eq("achieved_on", achievedOn)
      .eq("is_wishlist", false)
      .maybeSingle();
    existingAscentBefore = existingRow;
  }

  const { data: upserted, error } = await auth.supabase
    .from("ascents")
    .upsert(
      {
        user_id: auth.userId,
        summit_id: target.baseId,
        achieved_on: achievedOn,
        end_date: endDate,
        notes,
        link,
        link_name: linkName,
        link_2: link2,
        link_name_2: linkName2,
        is_wishlist: isWishlist,
      },
      { onConflict: "user_id,summit_id,achieved_on" }
    )
    .select()
    .single();

  if (error) {
    throw new AtlasServiceError({
      status: 500,
      code: "database_error",
      title: "Error al guardar registro",
      detail: error.message,
    });
  }

  if (!isWishlist) {
    await auth.supabase
      .from("ascents")
      .delete()
      .match({ user_id: auth.userId, summit_id: target.baseId, is_wishlist: true });

    if (!existingAscentBefore && isPushConfigured()) {
      void notifyFollowersOfNewPost(auth.supabase, {
        actorUserId: auth.userId,
        itemKind: target.itemType,
        itemId: target.baseId,
        title: target.title,
      }).catch(() => {});
    }
  }

  return { target, record: upserted, created: true };
}

async function countExistingRecordPhotos(
  supabase: any,
  userId: string,
  target: ResolvedTarget,
  takenOn: string
): Promise<number> {
  const { data, error } = await supabase
    .from("summit_photos")
    .select("id, summit_id")
    .eq("user_id", userId)
    .eq("taken_on", takenOn);

  if (error || !Array.isArray(data)) {
    throw new AtlasServiceError({
      status: 500,
      code: "database_error",
      title: "Error al verificar fotos del registro",
      detail: error?.message || "No se pudo consultar el límite de fotos por registro.",
    });
  }

  return data.filter((p: any) =>
    target.subItemId
      ? p.summit_id === target.expectedSummitId
      : p.summit_id === target.expectedSummitId || p.summit_id === target.baseId
  ).length;
}

async function recordExistsForPhoto(
  supabase: any,
  userId: string,
  target: ResolvedTarget,
  takenOn: string
): Promise<boolean> {
  if (target.itemType === "experience") {
    const query = supabase
      .from("experience_records")
      .select("id")
      .eq("user_id", userId)
      .eq("experience_id", target.baseId)
      .eq("achieved_on", takenOn)
      .eq("is_wishlist", false);
    const { data } = await query;
    return Array.isArray(data) && data.length > 0;
  }

  const { data } = await supabase
    .from("ascents")
    .select("id")
    .eq("user_id", userId)
    .eq("summit_id", target.baseId)
    .eq("achieved_on", takenOn)
    .eq("is_wishlist", false);
  return Array.isArray(data) && data.length > 0;
}

async function uploadToR2WithRetry(options: {
  key: string;
  buffer: Buffer;
  contentType: string;
}) {
  let lastError: any = null;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      return await uploadR2Object(options);
    } catch (err: any) {
      lastError = err;
      if (attempt < 3) {
        await new Promise((res) => setTimeout(res, 300 * attempt));
      }
    }
  }
  throw new AtlasServiceError({
    status: 502,
    code: "storage_upload_failed",
    title: "Error al subir a Cloudflare R2",
    detail: lastError?.message || "Error al subir la imagen a Cloudflare R2.",
  });
}

export async function listUserPhotos(
  auth: AuthenticatedApiContext,
  params: {
    summit_id?: string | null;
    taken_on?: string | null;
    limit?: number;
    baseUrl: string;
  }
) {
  const limit = clampLimit(params.limit, 100, 500);
  let query = auth.supabase
    .from("summit_photos")
    .select("*")
    .eq("user_id", auth.userId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (params.summit_id?.trim()) {
    query = query.eq("summit_id", params.summit_id.trim());
  }
  if (params.taken_on?.trim()) {
    query = query.eq("taken_on", normalizeDateInput(params.taken_on, false));
  }

  const { data, error } = await query;
  if (error) {
    throw new AtlasServiceError({
      status: 500,
      code: "database_error",
      title: "Error al listar fotos",
      detail: error.message,
    });
  }

  const photos = (data || []).map((row: any) =>
    formatPhotoRow(row, params.baseUrl)
  );
  return { count: photos.length, photos };
}

export interface UploadPhotoBufferInput {
  buffer: Buffer;
  fileName: string;
  summit_id: string;
  sub_item_id?: string | null;
  taken_on?: string | null;
  date_unknown?: boolean;
  caption?: string | null;
  shot_at?: string | null;
  auto_create_record?: boolean;
  notes?: string | null;
  end_date?: string | null;
  link?: string | null;
  link_name?: string | null;
  link_2?: string | null;
  link_name_2?: string | null;
  lat?: number | null;
  lng?: number | null;
  location_name?: string | null;
  baseUrl: string;
}

export async function uploadUserPhotoBuffer(
  auth: AuthenticatedApiContext,
  input: UploadPhotoBufferInput
) {
  const target = await resolveTargetItem(
    { summit_id: input.summit_id, sub_item_id: input.sub_item_id },
    auth
  );
  const takenOn = normalizeDateInput(input.taken_on, input.date_unknown);
  const caption = normalizeCaption(input.caption);
  const shotAt = normalizeShotAt(input.shot_at);

  const hasCoords =
    input.lat !== undefined &&
    input.lat !== null &&
    input.lng !== undefined &&
    input.lng !== null &&
    Number.isFinite(Number(input.lat)) &&
    Number.isFinite(Number(input.lng));

  if (target.itemType === "experience" && input.auto_create_record === true && !hasCoords) {
    throw new AtlasServiceError({
      status: 400,
      code: "coordinates_required",
      title: "Coordenadas requeridas",
      detail:
        "Para crear automáticamente un registro de experiencia debes indicar 'lat' y 'lng', o bien establecer 'auto_create_record: false' si ya existe el registro.",
    });
  }

  const existingCount = await countExistingRecordPhotos(
    auth.supabase,
    auth.userId,
    target,
    takenOn
  );
  if (existingCount >= MAX_PHOTOS_PER_RECORD) {
    throw new AtlasServiceError({
      status: 409,
      code: "photo_limit_exceeded",
      title: "Límite de fotos por registro alcanzado",
      detail: `Este registro (${target.expectedSummitId} · ${takenOn}) ya tiene el máximo de ${MAX_PHOTOS_PER_RECORD} fotos.`,
      resolution: "Elimina alguna foto existente de este registro o elige otra fecha.",
    });
  }

  let optimized;
  try {
    optimized = await validateAndOptimizeImageBuffer(input.buffer, input.fileName);
  } catch (err) {
    if (err instanceof ImageValidationError) {
      throw new AtlasServiceError({
        status: err.status,
        code: err.code,
        title: "Imagen inválida",
        detail: err.message,
      });
    }
    throw err;
  }

  const storageCheck = await checkStorageLimit(optimized.fileSize, auth.supabase);
  if (!storageCheck.allowed) {
    throw new AtlasServiceError({
      status: 507,
      code: "storage_limit_exceeded",
      title: "Límite de almacenamiento alcanzado",
      detail:
        "Límite de almacenamiento alcanzado (9,5 GB). Se han bloqueado nuevas subidas para evitar costes.",
      extra: {
        current_bytes: storageCheck.currentBytes,
        max_bytes: storageCheck.maxBytes,
        remaining_bytes: 0,
      },
    });
  }

  if (!isR2Configured()) {
    throw new AtlasServiceError({
      status: 500,
      code: "storage_not_configured",
      title: "Almacenamiento no configurado",
      detail:
        "El almacenamiento Cloudflare R2 no está configurado en las variables de entorno.",
    });
  }

  const storageKey = `${auth.userId}/${target.folder}/${crypto.randomUUID()}-${optimized.cleanFileName}`;
  const r2Result = await uploadToR2WithRetry({
    key: storageKey,
    buffer: optimized.buffer,
    contentType: optimized.contentType,
  });

  const { data: insertedPhoto, error: dbError } = await auth.supabase
    .from("summit_photos")
    .insert({
      user_id: auth.userId,
      summit_id: target.expectedSummitId,
      storage_path: r2Result.storagePath,
      public_url: r2Result.publicUrl,
      file_size: optimized.fileSize,
      taken_on: takenOn,
      shot_at: shotAt,
      caption,
    })
    .select()
    .single();

  if (dbError || !insertedPhoto) {
    await deleteR2Object(r2Result.storagePath).catch(() => {});
    throw new AtlasServiceError({
      status: 500,
      code: "database_error",
      title: "Error al registrar la foto",
      detail: dbError?.message || "No se pudo guardar la foto en la base de datos.",
    });
  }

  let recordCreated = false;
  let createdRecord: any = null;
  const shouldAutoCreate =
    target.itemType === "experience"
      ? input.auto_create_record !== false && hasCoords
      : input.auto_create_record !== false;

  if (shouldAutoCreate) {
    const exists = await recordExistsForPhoto(
      auth.supabase,
      auth.userId,
      target,
      takenOn
    );
    if (!exists) {
      const upsertRes = await upsertUserRecord(auth, {
        summit_id: target.baseId,
        sub_item_id: target.subItemId,
        achieved_on: takenOn,
        end_date: input.end_date,
        notes: input.notes,
        link: input.link,
        link_name: input.link_name,
        link_2: input.link_2,
        link_name_2: input.link_name_2,
        lat: input.lat,
        lng: input.lng,
        location_name: input.location_name,
        is_wishlist: false,
      });
      recordCreated = true;
      createdRecord = upsertRes.record;
    }
  }

  return {
    photo: formatPhotoRow(insertedPhoto, input.baseUrl),
    record_created: recordCreated,
    record: createdRecord,
    optimization: {
      optimized: optimized.optimized,
      original_bytes: optimized.originalBytes,
      stored_bytes: optimized.fileSize,
      content_type: optimized.contentType,
      width: optimized.width,
      height: optimized.height,
    },
    storage: {
      remaining_bytes: storageCheck.remainingBytes,
    },
  };
}

export interface CreateUploadIntentInput {
  summit_id: string;
  sub_item_id?: string | null;
  file_name: string;
  content_type: string;
  file_size: number;
  taken_on?: string | null;
  date_unknown?: boolean;
  caption?: string | null;
  shot_at?: string | null;
  auto_create_record?: boolean;
  notes?: string | null;
  end_date?: string | null;
  link?: string | null;
  link_name?: string | null;
  link_2?: string | null;
  link_name_2?: string | null;
  lat?: number | null;
  lng?: number | null;
  location_name?: string | null;
}

export async function createPhotoUploadIntent(
  auth: AuthenticatedApiContext,
  input: CreateUploadIntentInput
) {
  const target = await resolveTargetItem(
    { summit_id: input.summit_id, sub_item_id: input.sub_item_id },
    auth
  );
  const takenOn = normalizeDateInput(input.taken_on, input.date_unknown);
  const contentType = String(input.content_type || "").split(";")[0].trim().toLowerCase();

  if (!SAFE_RASTER_IMAGE_MIMES.has(contentType)) {
    throw new AtlasServiceError({
      status: 400,
      code: "unsupported_image_format",
      title: "Formato no permitido",
      detail: "Solo se aceptan image/jpeg, image/png, image/webp, image/gif o image/avif.",
    });
  }

  const fileSize = Number(input.file_size);
  if (!Number.isFinite(fileSize) || fileSize <= 0) {
    throw new AtlasServiceError({
      status: 400,
      code: "invalid_file_size",
      title: "Tamaño inválido",
      detail: "file_size debe ser un número entero positivo en bytes.",
    });
  }
  if (fileSize > MAX_PHOTO_UPLOAD_BYTES) {
    throw new AtlasServiceError({
      status: 413,
      code: "payload_too_large",
      title: "Archivo demasiado grande",
      detail: "La imagen supera el límite máximo permitido (15 MB).",
    });
  }

  const hasCoords =
    input.lat !== undefined &&
    input.lat !== null &&
    input.lng !== undefined &&
    input.lng !== null &&
    Number.isFinite(Number(input.lat)) &&
    Number.isFinite(Number(input.lng));

  if (target.itemType === "experience" && input.auto_create_record === true && !hasCoords) {
    throw new AtlasServiceError({
      status: 400,
      code: "coordinates_required",
      title: "Coordenadas requeridas",
      detail:
        "Para crear automáticamente un registro de experiencia debes indicar 'lat' y 'lng'.",
    });
  }

  const existingCount = await countExistingRecordPhotos(
    auth.supabase,
    auth.userId,
    target,
    takenOn
  );
  if (existingCount >= MAX_PHOTOS_PER_RECORD) {
    throw new AtlasServiceError({
      status: 409,
      code: "photo_limit_exceeded",
      title: "Límite de fotos por registro alcanzado",
      detail: `Este registro ya tiene el máximo de ${MAX_PHOTOS_PER_RECORD} fotos.`,
    });
  }

  const storageCheck = await checkStorageLimit(fileSize, auth.supabase);
  if (!storageCheck.allowed) {
    throw new AtlasServiceError({
      status: 507,
      code: "storage_limit_exceeded",
      title: "Límite de almacenamiento alcanzado",
      detail:
        "Límite de almacenamiento alcanzado (9,5 GB). Se han bloqueado nuevas subidas para evitar costes.",
    });
  }

  if (!isR2Configured()) {
    throw new AtlasServiceError({
      status: 500,
      code: "storage_not_configured",
      title: "Almacenamiento no configurado",
      detail: "El almacenamiento Cloudflare R2 no está configurado.",
    });
  }

  const cleanFileName = sanitizeUploadFileName(input.file_name || "photo.jpg");
  const storagePath = `${auth.userId}/${target.folder}/${crypto.randomUUID()}-${cleanFileName}`;
  const presigned = await createPresignedR2UploadUrl({
    key: storagePath,
    contentType,
    contentLength: Math.floor(fileSize),
    expiresInSeconds: 600,
  });

  const endDate = input.end_date ? normalizeDateInput(input.end_date, false) : null;
  if (endDate && endDate < takenOn) {
    throw new AtlasServiceError({
      status: 400,
      code: "invalid_date_range",
      title: "Rango de fechas inválido",
      detail: "end_date no puede ser anterior a taken_on.",
    });
  }

  const uploadToken = signUploadIntentToken({
    userId: auth.userId,
    storagePath: presigned.storagePath,
    summitId: target.baseId,
    expectedSummitId: target.expectedSummitId,
    subItemId: target.subItemId,
    itemType: target.itemType,
    takenOn,
    caption: normalizeCaption(input.caption),
    shotAt: normalizeShotAt(input.shot_at),
    autoCreateRecord:
      target.itemType === "experience"
        ? input.auto_create_record !== false && hasCoords
        : input.auto_create_record !== false,
    recordMeta: {
      notes: typeof input.notes === "string" ? input.notes.trim() || null : null,
      endDate,
      link: normalizeOptionalLink(input.link),
      linkName: typeof input.link_name === "string" ? input.link_name.trim() || null : null,
      link2: normalizeOptionalLink(input.link_2),
      linkName2:
        typeof input.link_name_2 === "string" ? input.link_name_2.trim() || null : null,
      lat: hasCoords ? Number(input.lat) : null,
      lng: hasCoords ? Number(input.lng) : null,
      locationName:
        typeof input.location_name === "string"
          ? input.location_name.trim() || null
          : null,
    },
    contentType,
    declaredFileSize: Math.floor(fileSize),
    exp: Date.now() + 10 * 60 * 1000,
  });

  return {
    upload_url: presigned.uploadUrl,
    method: "PUT" as const,
    headers: {
      "Content-Type": contentType,
    },
    storage_path: presigned.storagePath,
    upload_token: uploadToken,
    expires_at: presigned.expiresAt,
    next_step:
      "PUT raw image bytes to upload_url with the Content-Type header, then call POST /api/v1/photos/confirm (or MCP confirm_photo_upload) with upload_token.",
  };
}

export async function confirmPhotoUploadIntent(
  auth: AuthenticatedApiContext,
  input: { upload_token: string; baseUrl: string }
) {
  const verified = verifyUploadIntentToken(input.upload_token, auth.userId);
  if (!verified.ok) {
    throw new AtlasServiceError({
      status: verified.code === "forbidden" ? 403 : 400,
      code: verified.code,
      title: "Token de subida inválido",
      detail: verified.detail,
    });
  }

  const payload = verified.payload;

  // Prevent replay on an already confirmed upload
  const { data: existingPhoto } = await auth.supabase
    .from("summit_photos")
    .select("id")
    .eq("storage_path", payload.storagePath)
    .maybeSingle();

  if (existingPhoto) {
    throw new AtlasServiceError({
      status: 409,
      code: "upload_already_confirmed",
      title: "Subida ya confirmada",
      detail: "Este upload_token ya fue confirmado anteriormente.",
    });
  }

  const r2Obj = await getR2ObjectBuffer(payload.storagePath);
  if (!r2Obj) {
    throw new AtlasServiceError({
      status: 404,
      code: "uploaded_object_not_found",
      title: "Archivo no encontrado en almacenamiento",
      detail:
        "No se encontró el archivo en Cloudflare R2. Asegúrate de completar el HTTP PUT a upload_url antes de confirmar.",
    });
  }

  const rawName = payload.storagePath.split("/").pop() || "photo.webp";
  let optimized;
  try {
    optimized = await validateAndOptimizeImageBuffer(r2Obj.buffer, rawName);
  } catch (err) {
    await deleteR2Object(payload.storagePath).catch(() => {});
    if (err instanceof ImageValidationError) {
      throw new AtlasServiceError({
        status: err.status,
        code: err.code,
        title: "Archivo subido inválido",
        detail: `${err.message} El objeto temporal ha sido eliminado de R2.`,
      });
    }
    throw err;
  }

  let finalStoragePath = payload.storagePath;
  let finalPublicUrl = toAbsoluteDisplayUrl(null, finalStoragePath, input.baseUrl);
  let storedPublicUrl = `/api/photos/view/${finalStoragePath}`;

  if (optimized.optimized || optimized.contentType !== payload.contentType) {
    if (optimized.contentType === payload.contentType) {
      const r2Res = await uploadToR2WithRetry({
        key: payload.storagePath,
        buffer: optimized.buffer,
        contentType: optimized.contentType,
      });
      finalStoragePath = r2Res.storagePath;
      storedPublicUrl = r2Res.publicUrl;
      finalPublicUrl = toAbsoluteDisplayUrl(
        r2Res.publicUrl,
        r2Res.storagePath,
        input.baseUrl
      );
    } else {
      const target = await resolveTargetItem(
        { summit_id: payload.summitId, sub_item_id: payload.subItemId },
        auth
      );
      const newKey = `${auth.userId}/${target.folder}/${crypto.randomUUID()}-${optimized.cleanFileName}`;
      const r2Res = await uploadToR2WithRetry({
        key: newKey,
        buffer: optimized.buffer,
        contentType: optimized.contentType,
      });
      await deleteR2Object(payload.storagePath).catch(() => {});
      finalStoragePath = r2Res.storagePath;
      storedPublicUrl = r2Res.publicUrl;
      finalPublicUrl = toAbsoluteDisplayUrl(
        r2Res.publicUrl,
        r2Res.storagePath,
        input.baseUrl
      );
    }
  } else {
    storedPublicUrl = `/api/photos/view/${finalStoragePath}`;
  }

  const target = await resolveTargetItem(
    { summit_id: payload.summitId, sub_item_id: payload.subItemId },
    auth
  );

  const existingCount = await countExistingRecordPhotos(
    auth.supabase,
    auth.userId,
    target,
    payload.takenOn
  );
  if (existingCount >= MAX_PHOTOS_PER_RECORD) {
    await deleteR2Object(finalStoragePath).catch(() => {});
    throw new AtlasServiceError({
      status: 409,
      code: "photo_limit_exceeded",
      title: "Límite de fotos por registro alcanzado",
      detail: `Este registro ya alcanzó el máximo de ${MAX_PHOTOS_PER_RECORD} fotos.`,
    });
  }

  const storageCheck = await checkStorageLimit(optimized.fileSize, auth.supabase);
  if (!storageCheck.allowed) {
    await deleteR2Object(finalStoragePath).catch(() => {});
    throw new AtlasServiceError({
      status: 507,
      code: "storage_limit_exceeded",
      title: "Límite de almacenamiento alcanzado",
      detail:
        "Límite de almacenamiento alcanzado (9,5 GB). Se han bloqueado nuevas subidas.",
    });
  }

  const { data: insertedPhoto, error: dbError } = await auth.supabase
    .from("summit_photos")
    .insert({
      user_id: auth.userId,
      summit_id: payload.expectedSummitId,
      storage_path: finalStoragePath,
      public_url: storedPublicUrl,
      file_size: optimized.fileSize,
      taken_on: payload.takenOn,
      shot_at: payload.shotAt || new Date().toISOString(),
      caption: payload.caption,
    })
    .select()
    .single();

  if (dbError || !insertedPhoto) {
    await deleteR2Object(finalStoragePath).catch(() => {});
    throw new AtlasServiceError({
      status: 500,
      code: "database_error",
      title: "Error al confirmar foto",
      detail: dbError?.message || "No se pudo guardar la foto en la base de datos.",
    });
  }

  let recordCreated = false;
  let createdRecord: any = null;
  if (payload.autoCreateRecord) {
    const exists = await recordExistsForPhoto(
      auth.supabase,
      auth.userId,
      target,
      payload.takenOn
    );
    if (!exists) {
      const upsertRes = await upsertUserRecord(auth, {
        summit_id: target.baseId,
        sub_item_id: target.subItemId,
        achieved_on: payload.takenOn,
        end_date: payload.recordMeta?.endDate,
        notes: payload.recordMeta?.notes,
        link: payload.recordMeta?.link,
        link_name: payload.recordMeta?.linkName,
        link_2: payload.recordMeta?.link2,
        link_name_2: payload.recordMeta?.linkName2,
        lat: payload.recordMeta?.lat,
        lng: payload.recordMeta?.lng,
        location_name: payload.recordMeta?.locationName,
        is_wishlist: false,
      });
      recordCreated = true;
      createdRecord = upsertRes.record;
    }
  }

  return {
    photo: {
      ...formatPhotoRow(insertedPhoto, input.baseUrl),
      display_url: finalPublicUrl,
    },
    record_created: recordCreated,
    record: createdRecord,
    optimization: {
      optimized: optimized.optimized,
      original_bytes: optimized.originalBytes,
      stored_bytes: optimized.fileSize,
      content_type: optimized.contentType,
      width: optimized.width,
      height: optimized.height,
    },
    storage: {
      remaining_bytes: storageCheck.remainingBytes,
    },
  };
}

export async function updateUserPhotoCaption(
  auth: AuthenticatedApiContext,
  params: { photo_id: string; caption: string | null; baseUrl: string }
) {
  const nextCaption = normalizeCaption(params.caption);
  const { data, error } = await auth.supabase
    .from("summit_photos")
    .update({ caption: nextCaption })
    .eq("id", params.photo_id)
    .eq("user_id", auth.userId)
    .select()
    .maybeSingle();

  if (error) {
    throw new AtlasServiceError({
      status: 500,
      code: "database_error",
      title: "Error al actualizar descripción",
      detail: error.message,
    });
  }

  if (!data) {
    throw new AtlasServiceError({
      status: 404,
      code: "photo_not_found",
      title: "Foto no encontrada",
      detail: "No existe ninguna foto perteneciente al usuario con ese photo_id.",
    });
  }

  return { photo: formatPhotoRow(data, params.baseUrl) };
}

export async function deleteUserPhoto(
  auth: AuthenticatedApiContext,
  params: { photo_id: string }
) {
  const { data: existing, error: fetchErr } = await auth.supabase
    .from("summit_photos")
    .select("id, storage_path")
    .eq("id", params.photo_id)
    .eq("user_id", auth.userId)
    .maybeSingle();

  if (fetchErr) {
    throw new AtlasServiceError({
      status: 500,
      code: "database_error",
      title: "Error al buscar foto",
      detail: fetchErr.message,
    });
  }

  if (!existing) {
    throw new AtlasServiceError({
      status: 404,
      code: "photo_not_found",
      title: "Foto no encontrada",
      detail: "No existe ninguna foto perteneciente al usuario con ese photo_id.",
    });
  }

  if (existing.storage_path) {
    await deleteR2Objects([existing.storage_path]).catch(() => {});
    try {
      await auth.supabase.storage.from("summit-photos").remove([existing.storage_path]);
    } catch {
      /* ignore legacy cleanup error */
    }
  }

  const { error: delErr } = await auth.supabase
    .from("summit_photos")
    .delete()
    .eq("id", existing.id)
    .eq("user_id", auth.userId);

  if (delErr) {
    throw new AtlasServiceError({
      status: 500,
      code: "database_error",
      title: "Error al eliminar foto",
      detail: delErr.message,
    });
  }

  return { deleted: true, photo_id: existing.id };
}
