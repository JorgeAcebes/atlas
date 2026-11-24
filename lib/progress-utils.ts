import { peaks, type Peak } from "@/data/peaks";
import { countries, type Country } from "@/data/countries";
import { predefinedCategories, type Experience, type ExperienceCategory } from "@/data/experiences";

export const TOTAL_PHYSICAL_PEAKS = 47;
export const TOTAL_WORLD_COUNTRIES = countries.length;

export const peaksById = new Map<string, Peak>(peaks.map((p) => [p.id, p]));
export const peaksByCode = new Map<string, Peak>(peaks.map((p) => [p.code, p]));
export const countriesById = new Map<string, Country>(countries.map((c) => [c.id, c]));

// Shared summits (e.g. Peñalara: Madrid/Segovia) share an `id` across two province `code`s.
export const peakCodesById = new Map<string, string[]>();
export const peakProvincesById = new Map<string, string[]>();
for (const p of peaks) {
  const codes = peakCodesById.get(p.id) || [];
  if (!codes.includes(p.code)) codes.push(p.code);
  peakCodesById.set(p.id, codes);

  const provinces = peakProvincesById.get(p.id) || [];
  if (!provinces.includes(p.province)) provinces.push(p.province);
  peakProvincesById.set(p.id, provinces);
}

/**
 * Computes completed physical summits using unique peak names (47 unique summits across 52 demarcations).
 */
export function countCompletedPeaksUnique(
  ascents: ReadonlyArray<{ summit_id: string; is_wishlist?: boolean }>
): number {
  const uniqueNames = new Set<string>();
  for (const a of ascents) {
    if (a.is_wishlist) continue;
    const peak = peaksById.get(a.summit_id);
    if (peak) uniqueNames.add(peak.name);
  }
  return uniqueNames.size;
}

/**
 * Computes completed countries using unique country IDs (196 total).
 */
export function countCompletedCountriesUnique(
  ascents: ReadonlyArray<{ summit_id: string; is_wishlist?: boolean }>
): number {
  const uniqueIds = new Set<string>();
  for (const a of ascents) {
    if (a.is_wishlist) continue;
    if (a.summit_id?.startsWith("country-") && countriesById.has(a.summit_id)) {
      uniqueIds.add(a.summit_id);
    }
  }
  return uniqueIds.size;
}

export type MergedExperience = Experience & { isCustom?: boolean };

export interface MergedCategory extends Omit<ExperienceCategory, "experiences"> {
  isCustomCat?: boolean;
  experiences: MergedExperience[];
}

export function buildVisibleExperienceCategories(
  customExperiences: ReadonlyArray<any>,
  customCategories: ReadonlyArray<any>,
  hiddenItems: ReadonlyArray<{ item_id: string; item_type: string }>
): MergedCategory[] {
  const hiddenCategoryIds = new Set<string>();
  const hiddenExperienceIds = new Set<string>();
  for (const h of hiddenItems) {
    if (h.item_type === "category") hiddenCategoryIds.add(h.item_id);
    if (h.item_type === "experience") hiddenExperienceIds.add(h.item_id);
  }

  const customByStaticCat = new Map<string, MergedExperience[]>();
  const customByCustomCat = new Map<string, MergedExperience[]>();
  const orphanCustom: MergedExperience[] = [];

  for (const ce of customExperiences) {
    if (hiddenExperienceIds.has(ce.id)) continue;
    const item: MergedExperience = {
      id: ce.id,
      name: ce.name,
      subItems: ce.sub_items || [],
      isCustom: true,
    };
    if (ce.static_category_id) {
      const list = customByStaticCat.get(ce.static_category_id) || [];
      list.push(item);
      customByStaticCat.set(ce.static_category_id, list);
    } else if (ce.category_id) {
      const list = customByCustomCat.get(ce.category_id) || [];
      list.push(item);
      customByCustomCat.set(ce.category_id, list);
    } else {
      orphanCustom.push(item);
    }
  }

  // Immutable predefinedCategories (name & icon never overridden)
  const visiblePredefined: MergedCategory[] = [];
  for (const cat of predefinedCategories) {
    if (hiddenCategoryIds.has(cat.id)) continue;
    const linked = customByStaticCat.get(cat.id) || [];
    visiblePredefined.push({
      ...cat,
      experiences: [
        ...cat.experiences.filter((e) => !hiddenExperienceIds.has(e.id)),
        ...linked,
      ],
    });
  }

  const visibleCustomCats: MergedCategory[] = [];
  for (const cc of customCategories) {
    if (hiddenCategoryIds.has(cc.id)) continue;
    visibleCustomCats.push({
      id: cc.id,
      name: cc.name,
      iconName: cc.icon_name || "star",
      isCustomCat: true,
      experiences: customByCustomCat.get(cc.id) || [],
    });
  }

  if (orphanCustom.length > 0 && !hiddenCategoryIds.has("cat-custom-other")) {
    visibleCustomCats.push({
      id: "cat-custom-other",
      name: "Otras Experiencias",
      iconName: "star",
      isCustomCat: true,
      experiences: orphanCustom,
    });
  }

  return [...visiblePredefined, ...visibleCustomCats];
}

/**
 * Invariant 4.2: An experience with sub-items is completed ONLY when ALL sub-items are completed.
 */
export function isExperienceItemCompleted(
  exp: Pick<Experience, "id"> & { subItems?: { id: string }[] },
  completedExpRecords: ReadonlyArray<{ experience_id?: string; summit_id?: string; sub_item_id?: string | null; is_wishlist?: boolean }>
): boolean {
  const expId = exp.id;
  if (!exp.subItems || exp.subItems.length === 0) {
    return completedExpRecords.some(
      (r) => !r.is_wishlist && (r.experience_id === expId || r.summit_id === expId)
    );
  }
  const doneSubs = new Set<string>();
  for (const r of completedExpRecords) {
    if (r.is_wishlist) continue;
    if ((r.experience_id === expId || r.summit_id === expId) && r.sub_item_id) {
      doneSubs.add(r.sub_item_id);
    }
  }
  return exp.subItems.length > 0 && exp.subItems.every((s: { id: string }) => doneSubs.has(s.id));
}

export function countCompletedExperiences(
  categories: ReadonlyArray<ExperienceCategory>,
  completedExpRecords: ReadonlyArray<{ experience_id?: string; summit_id?: string; sub_item_id?: string | null; is_wishlist?: boolean }>
): number {
  let count = 0;
  for (const cat of categories) {
    for (const exp of cat.experiences) {
      if (isExperienceItemCompleted(exp, completedExpRecords)) {
        count++;
      }
    }
  }
  return count;
}

export function getPredefinedExperienceTotalCount(): number {
  return predefinedCategories.reduce((acc, cat) => acc + cat.experiences.length, 0);
}
