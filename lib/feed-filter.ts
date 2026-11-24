import { format } from "date-fns";
import { es } from "date-fns/locale";
import { formatRecordDateRange, isUnknownDate, parseLocalNoonDate } from "@/lib/date-utils";
import { countriesById, peakProvincesById, peaksById } from "@/lib/progress-utils";

export interface FilterFeedOptions {
  feedItems: ReadonlyArray<any>;
  enablePeaks: boolean;
  enableCountries: boolean;
  enableExperiences: boolean;
  mode: "countries" | "peaks";
  experiencesMode: boolean;
  searchQuery: string;
  followingOnly: boolean;
  followingUserIdsSet: ReadonlySet<string>;
}

/**
 * Pure O(N) feed filter using Set/Map lookups across modalities and search tokens.
 */
export function filterFeedItems({
  feedItems,
  enablePeaks,
  enableCountries,
  enableExperiences,
  mode,
  experiencesMode,
  searchQuery,
  followingOnly,
  followingUserIdsSet,
}: FilterFeedOptions): any[] {
  let items = feedItems.filter((item) => {
    if (item.type === "error") return true;

    if (followingOnly && (!item.user_id || !followingUserIdsSet.has(item.user_id))) {
      return false;
    }

    const summitIdLower = (item.summit_id || "").toLowerCase();
    const isPeak = item.type === "ascent" && peaksById.has(summitIdLower);
    const isCountry =
      item.type === "ascent" &&
      (countriesById.has(summitIdLower) || summitIdLower.startsWith("country-"));
    const isExperience =
      item.type === "experience" ||
      (item.type === "ascent" &&
        (summitIdLower.startsWith("exp-") || summitIdLower.startsWith("custom-")));

    if (item.type === "ascent") {
      if (!enablePeaks && isPeak) return false;
      if (!enableCountries && isCountry) return false;
    }
    if (!enableExperiences && isExperience) return false;

    if (mode === "peaks") {
      return isPeak;
    }
    if (isPeak) return false;
    if (experiencesMode && enableExperiences) {
      return isExperience;
    }
    return isCountry;
  });

  const trimmedQuery = searchQuery.trim().toLowerCase();
  if (!trimmedQuery) return items;

  const tokens = trimmedQuery.split(/\s+/).filter(Boolean);
  items = items.filter((item) => {
    const username = item.profiles?.username || "";
    const summitIdLower = (item.summit_id || "").toLowerCase();

    let locName = "";
    let extraLoc = "";
    if (item.type === "ascent") {
      const country = countriesById.get(summitIdLower);
      if (country) {
        locName = country.name;
      } else {
        const peak = peaksById.get(summitIdLower);
        if (peak) {
          locName = peak.name;
          extraLoc = peakProvincesById.get(summitIdLower)?.join(" ") || peak.province || "";
        }
      }
    } else if (item.type === "experience") {
      locName = item.experience_title || item.location_name || "";
      extraLoc = item.sub_item_title || "";
    }

    const dateRangeStr = formatRecordDateRange(item.achieved_on, item.end_date);

    let dateWords = "";
    if (item.achieved_on && !isUnknownDate(item.achieved_on)) {
      const d = parseLocalNoonDate(item.achieved_on);
      if (d) {
        try {
          dateWords += " " + format(d, "MMMM yyyy d", { locale: es });
        } catch {
          /* ignore */
        }
      }
    }
    if (item.end_date && !isUnknownDate(item.end_date)) {
      const d2 = parseLocalNoonDate(item.end_date);
      if (d2) {
        try {
          dateWords += " " + format(d2, "MMMM yyyy d", { locale: es });
        } catch {
          /* ignore */
        }
      }
    }

    const searchable = [
      username,
      `@${username}`,
      locName,
      extraLoc,
      item.location_name || "",
      item.notes || "",
      dateRangeStr,
      dateWords,
      item.achieved_on || "",
      item.end_date || "",
    ]
      .join(" ")
      .toLowerCase();

    return tokens.every((t) => searchable.includes(t));
  });

  return items;
}
