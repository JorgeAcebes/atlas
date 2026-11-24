import type { Country } from "@/data/countries";
import type { Peak } from "@/data/peaks";

export type Ascent = {
  id?: string;
  summit_id: string;
  trip_group_id?: string | null;
  achieved_on: string;
  end_date?: string | null;
  notes: string | null;
  is_wishlist: boolean;
  record_id?: string;
  lat?: number | null;
  lng?: number | null;
  location_name?: string | null;
  sub_item_id?: string | null;
  link?: string | null;
  link_name?: string | null;
  link_2?: string | null;
  link_name_2?: string | null;
};

export type SelectedItem = {
  id: string;
  sub_item_id?: string;
  title: string;
  subtitle: string;
  label: string;
  detail: string;
  note: string;
  iconName?: string;
  subItems?: any;
  itemType?: "peak" | "country" | "experience";
};

export type SummitPhoto = {
  id: string;
  summit_id: string;
  public_url: string;
  taken_on: string;
  caption: string | null;
  created_at: string;
  storage_path: string;
  shot_at?: string | null;
};

export type HiddenItem = {
  id: string;
  user_id: string;
  item_id: string;
  item_type: "category" | "experience";
};

export type ExperienceRecord = {
  id: string;
  user_id: string;
  experience_id: string;
  sub_item_id?: string;
  lat: number;
  lng: number;
  achieved_on: string;
  notes?: string;
  link?: string;
  link_name?: string;
  link_2?: string;
  link_name_2?: string;
  is_wishlist: boolean;
  location_name?: string | null;
  trip_group_id?: string | null;
  created_at: string;
};

export type ChallengeMode = "peaks" | "countries";
export type ListFilter = "all" | "done" | "pending" | "wishlist";

export type TargetProfile = {
  id: string;
  username: string;
  enable_peaks?: boolean;
  enable_countries?: boolean;
  is_public?: boolean;
};

export type InitialTrackerData = {
  userId: string;
  ascents: Ascent[];
  photos: SummitPhoto[];
  experienceRecords: ExperienceRecord[];
  customExperiences: any[];
  customCategories: any[];
  hiddenItems: HiddenItem[];
};

export type SummitTrackerProps = {
  mode: ChallengeMode;
  targetProfile?: TargetProfile;
  onSwitchMode?: (mode: ChallengeMode) => void;
  onNavigate?: (tab: string) => void;
  isActive?: boolean;
  initialExperiencesMode?: boolean;
  experiencesMode?: boolean;
  onToggleExperiences?: (active: boolean) => void;
  fromTab?: "ranking" | "social" | "mapa";
  initialTargetConnStatus?: "pending" | "accepted" | null;
  initialTrackerData?: InitialTrackerData | null;
};

export function peakToItem(peak: Peak): SelectedItem {
  return {
    id: peak.id,
    label: peak.province,
    title: peak.name,
    subtitle: `${peak.altitude.toLocaleString("es-ES")} m`,
    detail: peak.range,
    note: peak.note,
    itemType: "peak",
  };
}

export function countryToItem(country: Country): SelectedItem {
  return {
    id: country.id,
    label: country.continent,
    title: country.name,
    subtitle: "",
    detail: "",
    note: "",
    itemType: "country",
  };
}
