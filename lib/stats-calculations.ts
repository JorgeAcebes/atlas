import { peaks, type Peak } from "@/data/peaks";
import { countries, type Country } from "@/data/countries";
import { predefinedCategories } from "@/data/experiences";
import { getCountryForAscent, getLocationInfo, getPeakForAscent } from "@/lib/stats-utils";
import { isUnknownDate, parseLocalNoonDate } from "@/lib/date-utils";

export const SHARED_PEAKS = [
  { name: "Gorbea", provinces: "Álava / Vizcaya", altitude: 1482 },
  { name: "Torre Cerredo", provinces: "León / Asturias", altitude: 2652 },
  { name: "Peñalara", provinces: "Madrid / Segovia", altitude: 2428 },
  { name: "Peña Trevinca", provinces: "Orense / Zamora", altitude: 2127 },
  { name: "Moncayo", provinces: "Soria / Zaragoza", altitude: 2314 },
];

export const MOUNTAIN_RANGES = [
  {
    id: "pirineos",
    name: "Pirineos",
    peakIds: ["huesca", "lleida", "girona", "navarra"],
  },
  {
    id: "cantabrica",
    name: "Cordillera Cantábrica & Macizo Galaico",
    peakIds: ["cerredo", "cantabria", "palencia", "trevinca", "burgos", "lugo", "gorbea", "gipuzkoa", "pontevedra", "coruna"],
  },
  {
    id: "central",
    name: "Sistema Central & Montes de Toledo",
    peakIds: ["avila", "penalara", "salamanca", "caceres", "guadalajara", "toledo", "ciudad-real"],
  },
  {
    id: "betica",
    name: "Cordilleras Béticas & Sierra Morena",
    peakIds: ["granada", "almeria", "jaen", "malaga", "albacete", "murcia", "cadiz", "cordoba", "alicante", "valencia", "sevilla", "huelva", "badajoz"],
  },
  {
    id: "iberico",
    name: "Sistema Ibérico & Costero-Catalana",
    peakIds: ["moncayo", "rioja", "teruel", "cuenca", "castellon", "barcelona", "tarragona", "valladolid"],
  },
  {
    id: "islas",
    name: "Islas & Ciudades Autónomas",
    peakIds: ["santa-cruz-tenerife", "las-palmas", "illes-balears", "ceuta", "melilla"],
  },
];

export const CONTINENT_COLOR_MAP: Record<string, { bg: string; text: string; dot: string }> = {
  Europa: { bg: "rgba(0, 129, 200, 0.12)", text: "#006bb3", dot: "#0081C8" },
  Asia: { bg: "rgba(252, 177, 34, 0.16)", text: "#9a6a00", dot: "#FCB132" },
  África: { bg: "rgba(17, 24, 39, 0.08)", text: "#111827", dot: "#111827" },
  Oceanía: { bg: "rgba(0, 166, 81, 0.12)", text: "#008a43", dot: "#00A651" },
  América: { bg: "rgba(238, 51, 78, 0.12)", text: "#c91d37", dot: "#EE334E" },
};

const peakByIdMap = new Map<string, Peak>(peaks.map((p) => [p.id, p]));
const provincesByName = new Map<string, string[]>();
const peakProvincesByNameMap = new Map<string, string>();
for (const p of peaks) {
  const list = provincesByName.get(p.name) || [];
  list.push(p.province);
  provincesByName.set(p.name, list);
}
for (const [name, provs] of provincesByName.entries()) {
  peakProvincesByNameMap.set(name, provs.join(" / "));
}

const countriesByContinentCount = new Map<string, number>();
for (const c of countries) {
  countriesByContinentCount.set(c.continent, (countriesByContinentCount.get(c.continent) || 0) + 1);
}

export interface TimelineGroup<TItem> {
  item: TItem;
  summitId: string;
  count: number;
  earliestTime: number;
  createdTime: number;
  sortLabel: string;
}

export interface YearMonthTimelineResult<TItem> {
  years: {
    year: number;
    months: { month: number; items: TimelineGroup<TItem>[] }[];
    totalCount: number;
  }[];
  undated: TimelineGroup<TItem>[];
  totalUndated: number;
  totalCount: number;
}

/**
 * Single generic timeline aggregator shared across Countries, Peaks, and Experiences tabs.
 */
export function buildYearMonthTimeline<TItem>(
  records: ReadonlyArray<{
    groupKey: string;
    item: TItem;
    summitId: string;
    sortLabel: string;
    achievedOn?: string | null;
    createdAt?: string | null;
  }>
): YearMonthTimelineResult<TItem> {
  const yearMap = new Map<number, Map<number, Map<string, TimelineGroup<TItem>>>>();
  const undatedMap = new Map<string, TimelineGroup<TItem>>();

  for (const r of records) {
    const rawDate = r.achievedOn || r.createdAt;
    const createdMs = r.createdAt ? new Date(r.createdAt).getTime() : 0;
    const validCreatedMs = Number.isFinite(createdMs) ? createdMs : 0;

    if (rawDate && !isUnknownDate(rawDate)) {
      const parsed = parseLocalNoonDate(rawDate);
      if (parsed && !isNaN(parsed.getTime())) {
        const y = parsed.getFullYear();
        const m = parsed.getMonth();
        const time = parsed.getTime();

        let monthsMap = yearMap.get(y);
        if (!monthsMap) {
          monthsMap = new Map();
          yearMap.set(y, monthsMap);
        }
        let itemsMap = monthsMap.get(m);
        if (!itemsMap) {
          itemsMap = new Map();
          monthsMap.set(m, itemsMap);
        }

        const existing = itemsMap.get(r.groupKey);
        if (!existing) {
          itemsMap.set(r.groupKey, {
            item: r.item,
            summitId: r.summitId,
            count: 1,
            earliestTime: time,
            createdTime: validCreatedMs || time,
            sortLabel: r.sortLabel,
          });
        } else {
          existing.count += 1;
          if (time < existing.earliestTime) {
            existing.earliestTime = time;
            existing.summitId = r.summitId;
          }
        }
        continue;
      }
    }

    const existingUndated = undatedMap.get(r.groupKey);
    if (!existingUndated) {
      undatedMap.set(r.groupKey, {
        item: r.item,
        summitId: r.summitId,
        count: 1,
        earliestTime: 0,
        createdTime: validCreatedMs,
        sortLabel: r.sortLabel,
      });
    } else {
      existingUndated.count += 1;
    }
  }

  const years = Array.from(yearMap.entries())
    .sort((a, b) => b[0] - a[0])
    .map(([year, monthsMap]) => {
      const months = Array.from(monthsMap.entries())
        .sort((a, b) => b[0] - a[0])
        .map(([month, itemsMap]) => {
          const items = Array.from(itemsMap.values()).sort((a, b) => {
            if (a.earliestTime !== b.earliestTime) return a.earliestTime - b.earliestTime;
            if (a.createdTime !== b.createdTime) return a.createdTime - b.createdTime;
            return a.sortLabel.localeCompare(b.sortLabel);
          });
          return { month, items };
        });

      let totalCount = 0;
      for (const m of months) {
        for (const item of m.items) {
          totalCount += item.count;
        }
      }
      return { year, months, totalCount };
    });

  const undated = Array.from(undatedMap.values()).sort((a, b) =>
    a.sortLabel.localeCompare(b.sortLabel)
  );
  let totalUndated = 0;
  for (const item of undated) {
    totalUndated += item.count;
  }

  let totalCount = totalUndated;
  for (const y of years) {
    totalCount += y.totalCount;
  }

  return { years, undated, totalUndated, totalCount };
}

/**
 * Single-pass O(M + 196 + 52) Peaks & Countries metrics calculation.
 */
export function computePeaksAndCountriesStats(ascents: ReadonlyArray<any>) {
  const validDoneAscents = ascents.filter((a) => !a.is_wishlist);

  const completedPeakIds = new Set<string>();
  const completedCountryById = new Map<string, Country>();

  // O(M) single pass over completed ascents
  for (const a of validDoneAscents) {
    if (a.summit_id && peakByIdMap.has(a.summit_id)) completedPeakIds.add(a.summit_id);
    if (a.peak_id && peakByIdMap.has(a.peak_id)) completedPeakIds.add(a.peak_id);
    if (a.country_id && peakByIdMap.has(a.country_id)) completedPeakIds.add(a.country_id);

    const matchedPeak = getPeakForAscent(a);
    if (matchedPeak) {
      completedPeakIds.add(matchedPeak.id);
    }

    const matchedCountry = getCountryForAscent(a);
    if (matchedCountry && !completedCountryById.has(matchedCountry.id)) {
      completedCountryById.set(matchedCountry.id, matchedCountry);
    }
  }

  const completedUniquePeakNames = new Set<string>();
  let totalAltitudeAscended = 0;
  let highestPeak: Peak | null = null;
  let twoThousandersTotal = 0;
  let twoThousandersCount = 0;
  let midTotal = 0;
  let midCount = 0;
  let lowTotal = 0;
  let lowCount = 0;

  for (const peak of peaks) {
    const isDone = completedPeakIds.has(peak.id);
    if (peak.altitude >= 2000) {
      twoThousandersTotal++;
      if (isDone) twoThousandersCount++;
    } else if (peak.altitude >= 1000) {
      midTotal++;
      if (isDone) midCount++;
    } else {
      lowTotal++;
      if (isDone) lowCount++;
    }

    if (isDone && !completedUniquePeakNames.has(peak.name)) {
      completedUniquePeakNames.add(peak.name);
      totalAltitudeAscended += peak.altitude;
      if (!highestPeak || peak.altitude > highestPeak.altitude) {
        highestPeak = peak;
      }
    }
  }

  const completedPeaksCount = completedUniquePeakNames.size;
  const peaksPct = Math.round((completedPeaksCount / 47) * 100);

  const threeThousanders = [
    {
      id: "santa-cruz-tenerife",
      name: "Teide",
      altitude: 3718,
      province: "Santa Cruz de Tenerife",
      completed: completedPeakIds.has("santa-cruz-tenerife") || completedPeakIds.has("teide") || completedUniquePeakNames.has("Teide"),
    },
    {
      id: "granada",
      name: "Mulhacén",
      altitude: 3479,
      province: "Granada",
      completed: completedPeakIds.has("granada"),
    },
    {
      id: "huesca",
      name: "Aneto",
      altitude: 3404,
      province: "Huesca",
      completed: completedPeakIds.has("huesca"),
    },
    {
      id: "lleida",
      name: "Pica d'Estats",
      altitude: 3143,
      province: "Lleida",
      completed: completedPeakIds.has("lleida"),
    },
  ];

  const sharedPeaksStatus = SHARED_PEAKS.map((sp) => ({
    ...sp,
    completed: completedUniquePeakNames.has(sp.name),
  }));
  const sharedPeaksCount = sharedPeaksStatus.filter((s) => s.completed).length;

  const rangesStatus = MOUNTAIN_RANGES.map((r) => {
    const seenNames = new Set<string>();
    const uniqueRangePeaks: {
      id: string;
      name: string;
      province: string;
      altitude: number;
      completed: boolean;
    }[] = [];

    for (const id of r.peakIds) {
      const p = peakByIdMap.get(id);
      if (!p || seenNames.has(p.name)) continue;
      seenNames.add(p.name);
      uniqueRangePeaks.push({
        id: p.id,
        name: p.name,
        province: peakProvincesByNameMap.get(p.name) || p.province,
        altitude: p.altitude,
        completed: completedUniquePeakNames.has(p.name) || completedPeakIds.has(p.id),
      });
    }

    const total = uniqueRangePeaks.length;
    const done = uniqueRangePeaks.filter((p) => p.completed).length;
    return {
      id: r.id,
      name: r.name,
      done,
      total,
      pct: total > 0 ? Math.round((done / total) * 100) : 0,
      peaksList: uniqueRangePeaks,
    };
  });

  const completedCountriesList = Array.from(completedCountryById.values());
  const completedCountriesCount = completedCountriesList.length;
  const countriesPct = Math.round((completedCountriesCount / 196) * 100);

  const continentList = ["Europa", "América", "Asia", "África", "Oceanía"];
  const doneByContinent = new Map<string, string[]>();
  for (const c of completedCountriesList) {
    const arr = doneByContinent.get(c.continent) || [];
    arr.push(c.name);
    doneByContinent.set(c.continent, arr);
  }

  const continentsBreakdown = continentList.map((cont) => {
    const total = countriesByContinentCount.get(cont) || 0;
    const doneNames = doneByContinent.get(cont) || [];
    return {
      continent: cont,
      done: doneNames.length,
      total,
      pct: total > 0 ? Math.round((doneNames.length / total) * 100) : 0,
      countries: doneNames,
    };
  });

  return {
    completedPeaksCount,
    peaksPct,
    totalAltitudeAscended,
    highestPeak,
    threeThousanders,
    twoThousandersCount,
    twoThousandersTotal,
    midCount,
    midTotal,
    lowCount,
    lowTotal,
    sharedPeaksStatus,
    sharedPeaksCount,
    rangesStatus,
    completedCountriesCount,
    countriesPct,
    continentsBreakdown,
  };
}

export function computeExperienceStats(
  experienceRecords: ReadonlyArray<any>,
  ascents: ReadonlyArray<any>,
  customExperiences: ReadonlyArray<any>,
  customCategories: ReadonlyArray<any>
) {
  const customByStaticCat = new Map<string, any[]>();
  const customByCustomCat = new Map<string, any[]>();
  const orphanedCustom: any[] = [];

  for (const ce of customExperiences) {
    const mapped = { id: ce.id, name: ce.name, subItems: ce.sub_items };
    if (ce.static_category_id) {
      const list = customByStaticCat.get(ce.static_category_id) || [];
      list.push(mapped);
      customByStaticCat.set(ce.static_category_id, list);
    } else if (ce.category_id) {
      const list = customByCustomCat.get(ce.category_id) || [];
      list.push(mapped);
      customByCustomCat.set(ce.category_id, list);
    } else {
      orphanedCustom.push(mapped);
    }
  }

  const allPredefined = predefinedCategories.map((cat) => ({
    ...cat,
    experiences: [...cat.experiences, ...(customByStaticCat.get(cat.id) || [])],
  }));

  const customCats = customCategories.map((cat) => ({
    id: cat.id,
    name: cat.name,
    iconName: cat.icon_name || "star",
    experiences: customByCustomCat.get(cat.id) || [],
  }));

  const orphanCategories =
    orphanedCustom.length > 0
      ? [
          {
            id: "cat-custom-other",
            name: "Otras Experiencias",
            iconName: "star",
            experiences: orphanedCustom,
          },
        ]
      : [];

  const allCategories = [...allPredefined, ...customCats, ...orphanCategories];

  // O(N) lookup maps instead of nested filter inside every experience
  const directDoneExpIds = new Set<string>();
  const doneSubIdsByExp = new Map<string, Set<string>>();

  const indexCompletedRecord = (expId?: string, subId?: string | null) => {
    if (!expId) return;
    directDoneExpIds.add(expId);
    if (subId) {
      let set = doneSubIdsByExp.get(expId);
      if (!set) {
        set = new Set<string>();
        doneSubIdsByExp.set(expId, set);
      }
      set.add(subId);
    }
  };

  for (const r of experienceRecords) {
    if (!r.is_wishlist) indexCompletedRecord(r.experience_id, r.sub_item_id);
  }
  for (const a of ascents) {
    if (!a.is_wishlist && (a.summit_id?.startsWith("exp-") || a.summit_id?.startsWith("custom-"))) {
      indexCompletedRecord(a.summit_id, a.sub_item_id);
    }
  }

  let totalCount = 0;
  let completedCount = 0;

  const categoriesStatus = allCategories.map((cat) => {
    let catDone = 0;
    const experiencesList = cat.experiences.map((exp: any) => {
      totalCount++;
      const subItemsTotal = exp.subItems?.length || 0;
      let isExpDone = false;
      let subItemsDone = 0;

      if (subItemsTotal === 0) {
        isExpDone = directDoneExpIds.has(exp.id);
      } else {
        const doneSubSet = doneSubIdsByExp.get(exp.id);
        if (doneSubSet) {
          for (const s of exp.subItems) {
            if (doneSubSet.has(s.id)) subItemsDone++;
          }
          isExpDone = subItemsDone === subItemsTotal;
        }
      }

      if (isExpDone) {
        catDone++;
        completedCount++;
      }

      return {
        id: exp.id,
        name: exp.name,
        completed: isExpDone,
        subItemsDone,
        subItemsTotal,
      };
    });

    const catTotal = experiencesList.length;
    return {
      id: cat.id,
      name: cat.name,
      iconName: cat.iconName,
      done: catDone,
      total: catTotal,
      pct: catTotal > 0 ? Math.round((catDone / catTotal) * 100) : 0,
      experiencesList,
    };
  });

  return {
    totalCount,
    completedCount,
    pct: totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0,
    categoriesStatus,
  };
}

export function buildAllTimelines(ascents: ReadonlyArray<any>, experienceRecords: ReadonlyArray<any>) {
  const countryRecords: any[] = [];
  const peakRecords: any[] = [];
  const expTimelineRecords: any[] = [];

  for (const a of ascents) {
    if (a.is_wishlist) continue;

    if (a.summit_id?.startsWith("exp-") || a.summit_id?.startsWith("custom-")) {
      const summitId = a.sub_item_id ? `${a.summit_id}::${a.sub_item_id}` : a.summit_id;
      const loc = getLocationInfo(summitId);
      expTimelineRecords.push({
        groupKey: summitId,
        item: { name: loc.name },
        summitId,
        sortLabel: loc.name,
        achievedOn: a.achieved_on,
        createdAt: a.created_at,
      });
      continue;
    }

    const country = getCountryForAscent(a);
    if (country) {
      countryRecords.push({
        groupKey: country.id,
        item: country,
        summitId: a.summit_id || country.id,
        sortLabel: country.name,
        achievedOn: a.achieved_on,
        createdAt: a.created_at,
      });
      continue;
    }

    const peak = getPeakForAscent(a);
    if (peak) {
      peakRecords.push({
        groupKey: peak.name,
        item: peak,
        summitId: a.summit_id || peak.id,
        sortLabel: peak.name,
        achievedOn: a.achieved_on,
        createdAt: a.created_at,
      });
    }
  }

  for (const r of experienceRecords) {
    if (r.is_wishlist) continue;
    const summitId = r.sub_item_id ? `${r.experience_id}::${r.sub_item_id}` : r.experience_id;
    const loc = getLocationInfo(summitId);
    expTimelineRecords.push({
      groupKey: summitId,
      item: { name: loc.name },
      summitId,
      sortLabel: loc.name,
      achievedOn: r.achieved_on,
      createdAt: r.created_at,
    });
  }

  return {
    visitsTimeline: buildYearMonthTimeline<Country>(countryRecords),
    peaksTimeline: buildYearMonthTimeline<Peak>(peakRecords),
    experiencesTimeline: buildYearMonthTimeline<{ name: string }>(expTimelineRecords),
  };
}
