"use client";

import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createPortal } from "react-dom";
import { useAuth } from "./auth-context";
import {
  ChangeEvent,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";

const useIsomorphicLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;
import { peaks, type Peak } from "@/data/peaks";
import { countries, type Country } from "@/data/countries";
import {
  predefinedCategories,
  CustomExperience,
  ExperienceCategory,
} from "@/data/experiences";
import { isSupabaseConfigured, supabase } from "@/lib/supabase";
import { AuthDialog } from "./auth-dialog";
import { ProfileSettings } from "./profile-settings";
import { InstallPrompt, isStandalone } from "./install-prompt";
import { getInstallPrompt, clearInstallPrompt } from "./install-prompt";
import { ConfirmModal } from "./confirm-modal";
import { StatsModal } from "./stats-modal";
import { getLocationInfo } from "@/lib/stats-utils";
import PhotoEditor from "./photo-editor";
import { PhotoLightbox } from "./photo-lightbox";
import { getIconComponent, IconLogo } from "./icons";
import { LocationSearch } from "./location-search";
import {
  Link as LinkIcon,
  Camera,
  MapPin,
  Briefcase,
  Video,
  RotateCcw,
  Footprints,
  Check,
  Star,
  Triangle,
  Diamond,
  X,
  UserRoundPlus,
  UserRoundCheck,
  UserRoundMinus,
  UserRoundArrowLeft,
  NotebookPen,
  Share2,
  ChartNoAxesColumn, Download,
} from "lucide-react";
import { usePendingRequests } from "./use-pending-requests";
import { CompanionSelector } from "./companion-selector";
import { sanitizeDateForShare, sanitizeTextForShare, buildRecordShareUrl, executeShare } from "@/lib/share-utils";
import { CompanionProfile, datesOverlap, syncMutualTripInvitations, getMutualFollowers } from "@/lib/companions";
import { compressImage, sortPhotosByTime, sortFilesByCaptureTime } from "@/lib/image-utils";
import { uploadPhotoBlob, deleteStoragePhotos, getPhotoDisplayUrl } from "@/lib/photo-client";
import { lockScroll, unlockScroll } from "@/lib/scroll-lock";
import { MarqueeText } from "./marquee-text";

const SpainMap = dynamic(
  () => import("./spain-map").then((module) => module.SpainMap),
  {
    ssr: false,
    loading: () => (
      <div className="map map-loading">
        Cargando el mapa de los 52 territorios…
      </div>
    ),
  },
);

const WorldMap = dynamic(
  () => import("./world-map").then((module) => module.WorldMap),
  {
    ssr: false,
    loading: () => (
      <div className="map map-loading">Cargando el mapa del mundo…</div>
    ),
  },
);

type Ascent = {
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
  itemType?: 'peak' | 'country' | 'experience';
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

type ChallengeMode = "peaks" | "countries";

type TargetProfile = {
  id: string;
  username: string;
  enable_peaks?: boolean;
  enable_countries?: boolean;
  is_public?: boolean;
};

type Props = {
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
};

function peakToItem(peak: Peak): SelectedItem {
  return {
    id: peak.id,
    label: peak.province,
    title: peak.name,
    subtitle: `${peak.altitude.toLocaleString("es-ES")} m`,
    detail: peak.range,
    note: peak.note,
    itemType: 'peak',
  };
}

function countryToItem(country: Country): SelectedItem {
  return {
    id: country.id,
    label: country.continent,
    title: country.name,
    subtitle: "",
    detail: "",
    note: "",
    itemType: 'country',
  };
}

function formatDate(date: string) {
  if (date === "1900-01-01") return "Fecha desconocida";
  return new Intl.DateTimeFormat("es-ES", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(`${date}T12:00:00`));
}

function isVideoLink(link?: string | null, linkName?: string | null) {
  if (!link) return false;
  const urlStr = link.toLowerCase();
  const nameStr = (linkName || "").toLowerCase();
  return (
    urlStr.includes("youtube.com") ||
    urlStr.includes("youtu.be") ||
    urlStr.includes("vimeo.com") ||
    urlStr.includes("tiktok.com") ||
    nameStr.includes("vídeo") ||
    nameStr.includes("video")
  );
}

function renderRecordLink(link?: string | null, linkName?: string | null) {
  if (!link) return null;
  let Icon = LinkIcon;
  const urlStr = link.toLowerCase();
  if (urlStr.includes("youtube.com") || urlStr.includes("youtu.be"))
    Icon = Video;
  else if (urlStr.includes("instagram.com")) Icon = Camera;
  else if (urlStr.includes("linkedin.com")) Icon = Briefcase;
  else if (
    urlStr.includes("strava.com") ||
    urlStr.includes("strava.app.link") ||
    urlStr.includes("wikiloc.com") ||
    urlStr.includes("komoot.com") ||
    urlStr.includes("alltrails.com") ||
    urlStr.includes("garmin.com") ||
    urlStr.includes("outdooractive.com") ||
    urlStr.includes("relive.cc") ||
    urlStr.includes("fatmap.com") ||
    urlStr.includes("trailforks.com")
  )
    Icon = Footprints;
  else if (
    urlStr.includes("google.com/maps") ||
    urlStr.includes("maps.google.") ||
    urlStr.includes("maps.apple.com") ||
    urlStr.includes("openstreetmap.org")
  )
    Icon = MapPin;

  const displayName =
    linkName ||
    (urlStr.includes("youtube.com") || urlStr.includes("youtu.be")
      ? "Vídeo en YouTube"
      : urlStr.includes("instagram.com")
        ? "Publicación en Instagram"
        : urlStr.includes("linkedin.com")
          ? "Publicación en LinkedIn"
          : urlStr.includes("google.com/maps") || urlStr.includes("maps.google.") || urlStr.includes("maps.apple.com") || urlStr.includes("openstreetmap.org")
            ? "Ver en mapa"
            : urlStr.includes("wikiloc.com")
              ? "Ruta en Wikiloc"
              : urlStr.includes("strava.com") || urlStr.includes("strava.app.link")
                ? "Actividad en Strava"
                : urlStr.includes("komoot.com")
                  ? "Ruta en Komoot"
                  : urlStr.includes("alltrails.com")
                    ? "Ruta en AllTrails"
                    : urlStr.includes("garmin.com")
                      ? "Actividad en Garmin"
                      : "Enlace adjunto");

  const href =
    link.startsWith("http://") || link.startsWith("https://")
      ? link
      : `https://${link}`;

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        fontSize: "13px",
        color: "var(--pine)",
        textDecoration: "none",
        fontWeight: 500,
        padding: "4px 10px",
        backgroundColor: "rgba(35, 78, 82, 0.05)",
        borderRadius: 16,
        border: "1px solid rgba(35, 78, 82, 0.1)",
        width: "fit-content",
      }}
    >
      <Icon size={14} />
      <span style={{ textDecoration: "underline" }}>{displayName}</span>
    </a>
  );
}

export function getLinkPlaceholders(
  isPeaks: boolean,
  isExp: boolean,
): { link1: string; link2: string } {
  if (isPeaks) {
    return {
      link1: "Ej: Track de la Ruta",
      link2: "Ej: Equipamiento utilizado",
    };
  }
  if (isExp) {
    return {
      link1: "Ej: Vídeo de la experiencia",
      link2: "Ej: Guía para la experiencia",
    };
  }
  return {
    link1: "Ej: Restaurante favorito",
    link2: "Ej: Alojamiento recomendado",
  };
}

/* ── SVG icon components ────────────────── */

function IconMountain({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M8 3l4 8 5-5 2 4H2L8 3z" />
      <path d="M4.14 15.08l2.6-3.51L8 13l4-5.5 4 5.5 2.74-2.42L21.86 15.08" />
    </svg>
  );
}

function IconGlobe({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="10" />
      <path d="M2 12h20" />
      <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10A15.3 15.3 0 0 1 12 2z" />
    </svg>
  );
}

function IconClose({
  className,
  style,
}: {
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <svg
      className={className}
      style={style}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

function IconCalendar({
  className,
  style,
}: {
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <svg
      className={className}
      style={style}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  );
}

function IconTrash({
  className,
  style,
}: {
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <svg
      className={className}
      style={style}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6l-2 14a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2L5 6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    </svg>
  );
}

function IconFolderMove({
  className,
  style,
}: {
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <svg
      className={className}
      style={style}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
      <polyline points="12 11 12 17" />
      <polyline points="9 14 12 11 15 14" />
    </svg>
  );
}

function IconSearch({
  className,
  style,
}: {
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <svg
      className={className}
      style={style}
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  );
}

function IconCheck({ style }: { style?: React.CSSProperties } = {}) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="3"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={style}
    >
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function IconCamera(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"></path>
      <circle cx="12" cy="13" r="4"></circle>
    </svg>
  );
}

function IconEdit(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
    </svg>
  );
}

function IconShare(props: { style?: React.CSSProperties; strokeWidth?: number; size?: number; className?: string }) {
  const { size = 15, strokeWidth = 1.75, ...rest } = props;
  return <Share2 size={size} strokeWidth={strokeWidth} {...rest} />;
}

function IconGithub() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="16"
      height="16"
      stroke="currentColor"
      strokeWidth="2"
      fill="none"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="footer-icon"
    >
      <path d="M15 22v-4a4.8 4.8 0 0 0-1-3.2c3-.3 6-1.5 6-6.5a5.5 5.5 0 0 0-1.5-3.8 5.5 5.5 0 0 0-.1-3.8s-1.2-.4-3.9 1.4a13.4 13.4 0 0 0-7 0C6.2 1.5 5 1.5 5 1.5a5.5 5.5 0 0 0-.1 3.8A5.5 5.5 0 0 0 3.4 9c0 5 3 6.2 6 6.5a4.8 4.8 0 0 0-1 3.2v4"></path>
    </svg>
  );
}

function IconLinkedin() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="16"
      height="16"
      stroke="currentColor"
      strokeWidth="2"
      fill="none"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="footer-icon"
    >
      <path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z"></path>
      <rect x="2" y="9" width="4" height="12"></rect>
      <circle cx="4" cy="4" r="2"></circle>
    </svg>
  );
}

const cachedAscentsByUser: Record<string, Ascent[]> = {};
const cachedPhotosByUser: Record<string, SummitPhoto[]> = {};
const cachedExperienceRecordsByUser: Record<string, ExperienceRecord[]> = {};
const cachedCustomExperiencesByUser: Record<string, any[]> = {};
const cachedCustomCategoriesByUser: Record<string, any[]> = {};
const cachedHiddenItemsByUser: Record<string, HiddenItem[]> = {};
let cachedTrackerLastFetched: Record<string, number> = {};
const TRACKER_CACHE_TTL = 60 * 1000;

function getStoredUserId(): string | undefined {
  if (typeof window === "undefined") return undefined;
  try {
    const raw = localStorage.getItem("app_user_profile");
    if (raw) {
      const p = JSON.parse(raw);
      if (p?.id) return p.id;
    }
    const sessionRaw = localStorage.getItem("app_user_session");
    if (sessionRaw) {
      const s = JSON.parse(sessionRaw);
      if (s?.user?.id) return s.user.id;
    }
  } catch { /* ignore */ }
  return undefined;
}

function getStoredTrackerData<T>(key: string, userId: string): T | null {
  if (typeof window === "undefined" || !userId) return null;
  try {
    const raw = localStorage.getItem(`app_tracker_${key}_${userId}`);
    if (raw) return JSON.parse(raw) as T;
  } catch { /* ignore */ }
  return null;
}

function setStoredTrackerData(key: string, userId: string, data: any) {
  if (typeof window === "undefined" || !userId) return;
  try {
    localStorage.setItem(`app_tracker_${key}_${userId}`, JSON.stringify(data));
  } catch { /* ignore */ }
}

function getInitialTrackerList<T>(key: string, userId?: string, memoryCache?: Record<string, T[]>): T[] {
  const effectiveUserId = userId || getStoredUserId();
  if (!effectiveUserId) return [];
  if (memoryCache && memoryCache[effectiveUserId] && memoryCache[effectiveUserId].length > 0) return memoryCache[effectiveUserId];
  const stored = getStoredTrackerData<T[]>(key, effectiveUserId);
  if (stored && Array.isArray(stored)) {
    if (memoryCache) memoryCache[effectiveUserId] = stored;
    return stored;
  }
  return [];
}

function areRecordsEqual(a: any[] | null | undefined, b: any[] | null | undefined): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  if (a.length !== b.length) return false;
  try {
    return JSON.stringify(a) === JSON.stringify(b);
  } catch {
    return false;
  }
}

export function SummitTracker({
  mode: initialModeProp,
  targetProfile,
  onSwitchMode,
  onNavigate,
  isActive = true,
  initialExperiencesMode = false,
  experiencesMode: controlledExperiencesMode,
  onToggleExperiences,
  fromTab,
  initialTargetConnStatus,
}: Props) {
  const router = useRouter();
  const { session, profile: authProfile, refreshProfile, loading: authLoading } = useAuth();
  const [mounted, setMounted] = useState(false);
  const [myProfile, setMyProfile] = useState<{
    username: string;
    avatar_url: string | null;
    enable_experiences?: boolean;
    enable_peaks?: boolean;
    enable_countries?: boolean;
  } | null>(() => authProfile);

  const isReadOnly = !!targetProfile;
  const enablePeaks = !myProfile || myProfile.enable_peaks !== false;
  const enableCountries = !myProfile || myProfile.enable_countries !== false;
  const targetEnablePeaks = !targetProfile || targetProfile.enable_peaks !== false;
  const targetEnableCountries = !targetProfile || targetProfile.enable_countries !== false;

  const canShowPeaks = isReadOnly ? (enablePeaks && targetEnablePeaks) : enablePeaks;
  const canShowCountries = isReadOnly ? (enableCountries && targetEnableCountries) : enableCountries;
  const hasBothModes = canShowPeaks && canShowCountries;

  const [currentMode, setCurrentMode] = useState<ChallengeMode>(() => {
    const authEnablePeaks = !authProfile || authProfile.enable_peaks !== false;
    const authEnableCountries = !authProfile || authProfile.enable_countries !== false;
    const targetPeaks = !targetProfile || targetProfile.enable_peaks !== false;
    const targetCountries = !targetProfile || targetProfile.enable_countries !== false;
    const effectivePeaks = isReadOnly ? (authEnablePeaks && targetPeaks) : authEnablePeaks;
    const effectiveCountries = isReadOnly ? (authEnableCountries && targetCountries) : authEnableCountries;

    if (!effectivePeaks && initialModeProp === "peaks") return "countries";
    if (!effectiveCountries && initialModeProp === "countries") return "peaks";
    return initialModeProp;
  });

  const isPeaks = currentMode === "peaks";
  const hasPendingRequests = usePendingRequests();
  const [selectedCompanions, setSelectedCompanions] = useState<CompanionProfile[]>([]);
  const [companionStatuses, setCompanionStatuses] = useState<Record<string, "pending" | "accepted" | "rejected" | "separated">>({});
  const [currentTripGroupId, setCurrentTripGroupId] = useState<string | null>(null);
  const [originalTripDates, setOriginalTripDates] = useState<{ start: string; end?: string | null } | null>(null);
  const [tripCompanionsMap, setTripCompanionsMap] = useState<Record<string, CompanionProfile[]>>({});
  const [userFollowingSet, setUserFollowingSet] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!supabase || !session) return;
    supabase
      .from("connections")
      .select("following_id")
      .eq("follower_id", session.user.id)
      .eq("status", "accepted")
      .then(({ data }) => {
        if (data) {
          setUserFollowingSet(new Set(data.map((c: any) => c.following_id)));
        }
      });
  }, [session]);



  useEffect(() => {
    if (initialModeProp && initialModeProp !== currentMode) {
      if (initialModeProp === "peaks" && canShowPeaks) {
        setCurrentMode("peaks");
      } else if (initialModeProp === "countries" && canShowCountries) {
        setCurrentMode("countries");
      }
    }
  }, [initialModeProp, canShowPeaks, canShowCountries, currentMode]);

  useEffect(() => {
    if (!isActive) return;
    const handlePopState = () => {
      if (window.location.pathname === "/picos") {
        if (canShowPeaks) setCurrentMode("peaks");
      } else if (window.location.pathname === "/") {
        if (canShowCountries) setCurrentMode("countries");
      }
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [isActive, canShowPeaks, canShowCountries]);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    setMyProfile(authProfile);
  }, [authProfile]);

  const targetId = targetProfile ? targetProfile.id : (session?.user.id || authProfile?.id);
  const [ascents, setAscents] = useState<Ascent[]>(() => getInitialTrackerList<Ascent>("ascents", targetId, cachedAscentsByUser));
  const [photos, setPhotos] = useState<SummitPhoto[]>(() => getInitialTrackerList<SummitPhoto>("photos", targetId, cachedPhotosByUser));
  const [selectedPeak, setSelectedPeak] = useState<SelectedItem | null>(null);
  const [selectedCountry, setSelectedCountry] = useState<SelectedItem | null>(null);
  const [selectedExperience, setSelectedExperience] = useState<SelectedItem | null>(null);
  const panelPushedRef = useRef(false);
  const panelOpenedFromStatsRef = useRef(false);
  const recordOpenedFromPanelRef = useRef(false);
  const isClosingPanelRef = useRef(false);
  const initialPanelRestoredRef = useRef(false);
  const [panelIdToOpen, setPanelIdToOpen] = useState<string | null>(() => {
    if (typeof window !== "undefined") {
      try {
        const stored = sessionStorage.getItem("auto_open_panel");
        if (stored) {
          sessionStorage.removeItem("auto_open_panel");
          return stored;
        }
        const searchRecord = new URLSearchParams(window.location.search).get("record");
        if (searchRecord) {
          return searchRecord;
        }
      } catch (e) {
        console.warn(e);
      }
    }
    return null;
  });

  useEffect(() => {
    if (panelIdToOpen && !isClosingPanelRef.current) {
      const targetHash = `#panel=${encodeURIComponent(panelIdToOpen)}`;
      if (window.location.hash !== targetHash) {
        if (panelPushedRef.current || (typeof window !== "undefined" && window.location.hash.startsWith("#panel"))) {
          window.history.replaceState(
            { hasPanel: true },
            "",
            targetHash,
          );
        } else {
          panelPushedRef.current = true;
          window.history.pushState(
            { hasPanel: true },
            "",
            targetHash,
          );
        }
      }
    }
  }, [panelIdToOpen]);
  const [authOpen, setAuthOpen] = useState<"login" | "register" | false>(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [installPromptOpen, setInstallPromptOpen] = useState(false);
  const [canInstallMobile, setCanInstallMobile] = useState(false);

  useEffect(() => {
    const checkMobileBrowser = () => {
      if (typeof window === "undefined") return;
      const standalone = isStandalone();
      const isMobileWidth = window.innerWidth <= 700;
      const alreadyInstalled = typeof localStorage !== "undefined" && localStorage.getItem("pwa_app_installed") === "true";
      setCanInstallMobile(!standalone && isMobileWidth && !alreadyInstalled);

      if (!standalone && isMobileWidth && typeof navigator !== "undefined" && "getInstalledRelatedApps" in navigator) {
        (navigator as any).getInstalledRelatedApps().then((apps: any[]) => {
          if (apps && apps.length > 0) {
            setCanInstallMobile(false);
          }
        }).catch(() => {});
      }
    };
    checkMobileBrowser();
    window.addEventListener("resize", checkMobileBrowser);
    const handleInstalled = () => {
      try {
        localStorage.setItem("pwa_app_installed", "true");
      } catch {
        /* ignore */
      }
      setCanInstallMobile(false);
      setInstallPromptOpen(false);
    };
    window.addEventListener("appinstalled", handleInstalled);
    window.addEventListener("atlas-app-installed", handleInstalled);
    return () => {
      window.removeEventListener("resize", checkMobileBrowser);
      window.removeEventListener("appinstalled", handleInstalled);
      window.removeEventListener("atlas-app-installed", handleInstalled);
    };
  }, []);
  const handleHeroInstallClick = async (e: React.MouseEvent) => {
    e.stopPropagation();
    let promptEvent = getInstallPrompt();
    if (!promptEvent) {
      await new Promise<void>((resolve) => {
        let done = false;
        const onReady = () => {
          if (!done) {
            done = true;
            window.removeEventListener("atlas-install-prompt-ready", onReady);
            resolve();
          }
        };
        window.addEventListener("atlas-install-prompt-ready", onReady);
        setTimeout(() => {
          if (!done) {
            done = true;
            window.removeEventListener("atlas-install-prompt-ready", onReady);
            resolve();
          }
        }, 300);
      });
      promptEvent = getInstallPrompt();
    }

    if (promptEvent) {
      try {
        await promptEvent.prompt();
        const { outcome } = await promptEvent.userChoice;
        if (outcome === "accepted") {
          try {
            localStorage.setItem("pwa_app_installed", "true");
          } catch {
            /* ignore */
          }
          clearInstallPrompt();
          setCanInstallMobile(false);
          setInstallPromptOpen(false);
        }
        return;
      } catch (err) {
        console.error("Hero direct install error:", err);
      }
    }

    setInstallPromptOpen(true);
  };
  const [statsOpen, setStatsOpen] = useState(() => {
    if (typeof window !== "undefined") {
      return window.location.hash === "#estadisticas";
    }
    return false;
  });
  const [recordOpen, setRecordOpen] = useState(false);
  const [climbDate, setClimbDate] = useState<Date | null>(new Date());
  const [climbEndDate, setClimbEndDate] = useState<Date | null>(null);
  const [isEndDateEnabled, setIsEndDateEnabled] = useState(false);
  const [originalAchievedOn, setOriginalAchievedOn] = useState<string | null>(
    null,
  );
  const [isDateUnknown, setIsDateUnknown] = useState(false);
  const [isDateModified, setIsDateModified] = useState(false);
  const [confirmConfig, setConfirmConfig] = useState<{
    isOpen: boolean;
    message: string;
    onConfirm: () => void;
  } | null>(null);
  const [notes, setNotes] = useState("");
  const [wishlistNoteText, setWishlistNoteText] = useState("");
  const [showWishlistNoteEditor, setShowWishlistNoteEditor] = useState(false);
  const [link, setLink] = useState("");
  const [linkName, setLinkName] = useState("");
  const [link2, setLink2] = useState("");
  const [linkName2, setLinkName2] = useState("");
  const [showSecondLink, setShowSecondLink] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [listFilter, setListFilter] = useState<string>("all");
  const [selectedPhotoFiles, setSelectedPhotoFiles] = useState<File[]>([]);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [showTrashModal, setShowTrashModal] = useState(false);
  const [lightboxPhoto, setLightboxPhoto] = useState<SummitPhoto | null>(null);
  const [lightboxCaptionModalOpen, setLightboxCaptionModalOpen] =
    useState(false);
  const [lightboxDateModalOpen, setLightboxDateModalOpen] = useState(false);

  const [lightboxNewCaption, setLightboxNewCaption] = useState("");
  const [lightboxNewDate, setLightboxNewDate] = useState<string | null>(null);
  const [selectedPhotosForEdit, setSelectedPhotosForEdit] = useState<string[]>(
    [],
  );
  const [deletedRecordPhotoIds, setDeletedRecordPhotoIds] = useState<string[]>(
    [],
  );

  // Experience features
  const [experienceRecords, setExperienceRecords] = useState<ExperienceRecord[]>(
    () => getInitialTrackerList<ExperienceRecord>("exp_records", targetId, cachedExperienceRecordsByUser)
  );
  const [customExperiences, setCustomExperiences] = useState<any[]>(
    () => getInitialTrackerList<any>("custom_exp", targetId, cachedCustomExperiencesByUser)
  );
  const [customCategories, setCustomCategories] = useState<any[]>(
    () => getInitialTrackerList<any>("custom_cat", targetId, cachedCustomCategoriesByUser)
  );
  const [hiddenItems, setHiddenItems] = useState<HiddenItem[]>(
    () => getInitialTrackerList<HiddenItem>("hidden_items", targetId, cachedHiddenItemsByUser)
  );

  const prevTargetIdRef = useRef(targetId);
  useEffect(() => {
    if (prevTargetIdRef.current !== targetId) {
      prevTargetIdRef.current = targetId;
      setAscents(getInitialTrackerList<Ascent>("ascents", targetId, cachedAscentsByUser));
      setPhotos(getInitialTrackerList<SummitPhoto>("photos", targetId, cachedPhotosByUser));
      setExperienceRecords(getInitialTrackerList<ExperienceRecord>("exp_records", targetId, cachedExperienceRecordsByUser));
      setCustomExperiences(getInitialTrackerList<any>("custom_exp", targetId, cachedCustomExperiencesByUser));
      setCustomCategories(getInitialTrackerList<any>("custom_cat", targetId, cachedCustomCategoriesByUser));
      setHiddenItems(getInitialTrackerList<HiddenItem>("hidden_items", targetId, cachedHiddenItemsByUser));
    }
  }, [targetId]);

  useEffect(() => {
    if (targetId && prevTargetIdRef.current === targetId) {
      cachedAscentsByUser[targetId] = ascents;
      setStoredTrackerData("ascents", targetId, ascents);
    }
  }, [ascents, targetId]);

  useEffect(() => {
    if (targetId) {
      cachedExperienceRecordsByUser[targetId] = experienceRecords;
      setStoredTrackerData("exp_records", targetId, experienceRecords);
    }
  }, [experienceRecords, targetId]);

  useEffect(() => {
    if (targetId && prevTargetIdRef.current === targetId) {
      cachedPhotosByUser[targetId] = photos;
      setStoredTrackerData("photos", targetId, photos);
    }
  }, [photos, targetId]);

  useEffect(() => {
    if (targetId) {
      cachedCustomExperiencesByUser[targetId] = customExperiences;
      setStoredTrackerData("custom_exp", targetId, customExperiences);
    }
  }, [customExperiences, targetId]);

  useEffect(() => {
    if (targetId) {
      cachedCustomCategoriesByUser[targetId] = customCategories;
      setStoredTrackerData("custom_cat", targetId, customCategories);
    }
  }, [customCategories, targetId]);

  useEffect(() => {
    if (targetId) {
      cachedHiddenItemsByUser[targetId] = hiddenItems;
      setStoredTrackerData("hidden_items", targetId, hiddenItems);
    }
  }, [hiddenItems, targetId]);
  const [editingCustomCategory, setEditingCustomCategory] = useState<any>(null); // null, 'new', or existing category object
  const [editingCustomExp, setEditingCustomExp] = useState<any>(null); // null, 'new', or existing custom experience
  const [confirmAction, setConfirmAction] = useState<{
    message: string;
    onConfirm: () => void;
  } | null>(null);
  const [creatingCustomExp, setCreatingCustomExp] = useState(false);
  const [customExpName, setCustomExpName] = useState("");
  const [customExpIcon, setCustomExpIcon] = useState("star");
  const [selectingLocationForExp, setSelectingLocationForExp] = useState<
    string | null
  >(null);
  const selectingFromRecordRef = useRef(false);
  const [selectingCategoryForNewExp, setSelectingCategoryForNewExp] =
    useState(false);
  const [expSelectorOpen, setExpSelectorOpen] = useState(false);
  const [expandedExpCategory, setExpandedExpCategory] = useState<string | null>(
    null,
  );
  const [selectedLatLng, setSelectedLatLng] = useState<{
    lat: number;
    lng: number;
  } | null>(null);
  const [editingExpRecordId, setEditingExpRecordId] = useState<string | null>(
    null,
  );
  const [locationName, setLocationName] = useState("");

  const [assignToRecordModalOpen, setAssignToRecordModalOpen] = useState(false);
  const [editorPhoto, setEditorPhoto] = useState<SummitPhoto | null>(null);
  const [diffMode, setDiffMode] = useState(false);
  const [experiencesMode, setExperiencesMode] = useState(
    initialExperiencesMode || (controlledExperiencesMode !== undefined ? controlledExperiencesMode : false),
  );
  const [isEditingExperiences, setIsEditingExperiences] = useState(false);
  const [iconDropdownOpen, setIconDropdownOpen] = useState(false);

  const prevModeRef = useRef<ChallengeMode>(currentMode);
  const prevExperiencesModeRef = useRef<boolean>(experiencesMode);

  useEffect(() => {
    if (prevModeRef.current !== currentMode) {
      prevModeRef.current = currentMode;
      setRecordOpen(false);
      setProfileOpen(false);
      setAuthOpen(false);
      setPanelIdToOpen(null);
      panelPushedRef.current = false;
      recordOpenedFromPanelRef.current = false;
    }
  }, [currentMode]);

  useEffect(() => {
    if (prevExperiencesModeRef.current !== experiencesMode) {
      prevExperiencesModeRef.current = experiencesMode;
      setRecordOpen(false);
      setProfileOpen(false);
      setAuthOpen(false);
      setPanelIdToOpen(null);
      panelPushedRef.current = false;
      recordOpenedFromPanelRef.current = false;
    }
  }, [experiencesMode]);

  const isExp = experiencesMode && !isPeaks;

  const selected = useMemo<SelectedItem | null>(() => {
    if (isPeaks) return selectedPeak;
    if (isExp) return selectedExperience;
    return selectedCountry;
  }, [isPeaks, isExp, selectedPeak, selectedCountry, selectedExperience]);

  const selectedRef = useRef(selected);
  selectedRef.current = selected;
  const panelIdToOpenRef = useRef(panelIdToOpen);
  panelIdToOpenRef.current = panelIdToOpen;

  useEffect(() => {
    if (!supabase || !selected) return;
    const currentAscents = ascents.filter((a) => a.summit_id === selected.id);
    const currentExp = (experienceRecords || []).filter((e: any) => e.experience_id === selected.id);
    const tripGroupIds = Array.from(
      new Set(
        [
          ...currentAscents.map((a: any) => a.trip_group_id),
          ...currentExp.map((e: any) => e.trip_group_id),
        ].filter(Boolean)
      )
    );

    if (tripGroupIds.length === 0) return;

    supabase
      .from("record_companions")
      .select(`
        trip_group_id,
        companion_id,
        status,
        companion_profile:profiles!record_companions_companion_id_fkey(id, username, avatar_url, is_public),
        inviter_profile:profiles!record_companions_inviter_id_fkey(id, username, avatar_url, is_public)
      `)
      .in("trip_group_id", tripGroupIds)
      .eq("status", "accepted")
      .then(({ data }) => {
        if (data) {
          const map: Record<string, CompanionProfile[]> = {};
          data.forEach((row: any) => {
            const gid = row.trip_group_id;
            if (!map[gid]) map[gid] = [];
            if (row.companion_profile && !map[gid].some((p: any) => p.id === row.companion_profile.id)) {
              map[gid].push(row.companion_profile);
            }
            if (row.inviter_profile && !map[gid].some((p: any) => p.id === row.inviter_profile.id)) {
              map[gid].push(row.inviter_profile);
            }
          });
          setTripCompanionsMap((prev) => ({ ...prev, ...map }));
        }
      });
  }, [selected, ascents, experienceRecords]);

  const customExperiencesRef = useRef(customExperiences);
  customExperiencesRef.current = customExperiences;

  const setSelected = useCallback(
    (
      val:
        | SelectedItem
        | null
        | ((prev: SelectedItem | null) => SelectedItem | null),
    ) => {
      const item = typeof val === "function" ? val(selectedRef.current) : val;
      if (!item) {
        setSelectedPeak(null);
        setSelectedCountry(null);
        setSelectedExperience(null);
        return;
      }

      const isItemExp =
        (item as any).itemType === "experience" ||
        item.id.startsWith("exp-") ||
        predefinedCategories.some((cat) =>
          cat.experiences.some((exp) => exp.id === item.id),
        ) ||
        customExperiencesRef.current.some((exp) => exp.id === item.id);

      const isItemPeak =
        item.itemType === "peak" ||
        peaks.some((p) => p.id === item.id);

      if (isItemPeak) {
        setSelectedPeak(item);
      } else if (isItemExp) {
        setSelectedExperience(item);
      } else {
        setSelectedCountry(item);
      }
    },
    [],
  );

  const isSelectedValidForCurrentMode = Boolean(
    selected &&
    (isPeaks
      ? (selected.itemType === 'peak' || peaks.some((p) => p.id === selected.id))
      : isExp
        ? (selected.itemType === 'experience' ||
           predefinedCategories.some((cat) => cat.experiences.some((exp) => exp.id === selected.id)) ||
           customExperiences.some((exp) => exp.id === selected.id) ||
           selected.id.startsWith("exp-"))
        : (selected.itemType === 'country' ||
           countries.some((c) => c.id === selected.id) ||
           selected.id.startsWith("country-")))
  );

  const activeSelected = isSelectedValidForCurrentMode ? selected : null;

  useEffect(() => {
    if (selected && !isSelectedValidForCurrentMode) {
      setSelected(null);
      setRecordOpen(false);
      setPanelIdToOpen(null);
      panelPushedRef.current = false;
      recordOpenedFromPanelRef.current = false;
      if (typeof window !== "undefined" && window.location.hash.startsWith("#panel")) {
        window.history.replaceState(
          null,
          "",
          window.location.pathname + window.location.search,
        );
      }
    }
  }, [selected, isSelectedValidForCurrentMode]);

  const [targetConnStatus, setTargetConnStatus] = useState<"pending" | "accepted" | null>(() => {
    return initialTargetConnStatus !== undefined ? initialTargetConnStatus : null;
  });
  const [targetConnLoading, setTargetConnLoading] = useState(false);
  const [justFollowed, setJustFollowed] = useState(false);
  const [touchUnfollowActive, setTouchUnfollowActive] = useState(false);
  const touchHoldTimerRef = useRef<NodeJS.Timeout | null>(null);
  const justFollowedTimerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (initialTargetConnStatus !== undefined) {
      setTargetConnStatus(initialTargetConnStatus);
    }
  }, [initialTargetConnStatus]);

  useEffect(() => {
    return () => {
      if (touchHoldTimerRef.current) clearTimeout(touchHoldTimerRef.current);
      if (justFollowedTimerRef.current) clearTimeout(justFollowedTimerRef.current);
    };
  }, []);

  useEffect(() => {
    setJustFollowed(false);
    setTouchUnfollowActive(false);
    if (!targetProfile || !session?.user?.id || !supabase) return;
    if (session.user.id === targetProfile.id) return;

    supabase
      .from("connections")
      .select("status")
      .eq("follower_id", session.user.id)
      .eq("following_id", targetProfile.id)
      .maybeSingle()
      .then(({ data }) => {
        if (data) {
          setTargetConnStatus(data.status as "pending" | "accepted");
        } else {
          setTargetConnStatus(null);
        }
      });
  }, [targetProfile?.id, session?.user?.id]);

  async function handleFollowTarget() {
    if (!session || !supabase) {
      setAuthOpen("login");
      return;
    }
    if (!targetProfile || targetConnLoading) return;
    setTargetConnLoading(true);
    const newStatus = targetProfile.is_public !== false ? "accepted" : "pending";
    const { error } = await supabase
      .from("connections")
      .insert({
        follower_id: session.user.id,
        following_id: targetProfile.id,
        status: newStatus,
      });
    setTargetConnLoading(false);
    if (!error) {
      setTargetConnStatus(newStatus);
      if (newStatus === "accepted") {
        setJustFollowed(true);
      }
    }
  }

  async function handleUnfollowTarget() {
    if (!session || !supabase || !targetProfile || targetConnLoading) return;
    setTargetConnLoading(true);
    const { error } = await supabase
      .from("connections")
      .delete()
      .eq("follower_id", session.user.id)
      .eq("following_id", targetProfile.id);
    setTargetConnLoading(false);
    if (!error) {
      setTargetConnStatus(null);
      setJustFollowed(false);
      setTouchUnfollowActive(false);
    }
  }

  useEffect(() => {
    if (!mounted) return;
    if (!canShowPeaks && currentMode === "peaks") {
      switchMode("countries");
    } else if (!canShowCountries && currentMode === "countries") {
      switchMode("peaks");
    }
    if (!canShowCountries) {
      if (experiencesMode) setExperiencesMode(false);
      onToggleExperiences?.(false);
    }
  }, [mounted, canShowPeaks, canShowCountries, currentMode, experiencesMode]);

  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(typeof window !== "undefined" && window.innerWidth <= 768);
    };
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  const isScrollLocked =
    (isMobile && !!selected && isSelectedValidForCurrentMode) ||
    (!!recordOpen && !!selected && isSelectedValidForCurrentMode) ||
    !!lightboxPhoto ||
    !!editorPhoto ||
    !!lightboxCaptionModalOpen ||
    !!expSelectorOpen ||
    !!assignToRecordModalOpen ||
    !!showTrashModal ||
    !!editingCustomCategory ||
    !!selectingCategoryForNewExp ||
    !!editingCustomExp ||
    !!confirmAction ||
    !!selectingLocationForExp;

  useEffect(() => {
    if (selectingLocationForExp) {
      const isMobileScreen = typeof window !== "undefined" && (window.innerWidth <= 768 || isMobile);
      if (isMobileScreen) {
        window.scrollTo({
          top: 0,
          behavior: "instant" as ScrollBehavior,
        });
      } else {
        const mapaEl = document.getElementById("mapa");
        if (mapaEl) {
          const topbar = document.querySelector(".topbar") as HTMLElement | null;
          const topbarHeight = topbar ? topbar.getBoundingClientRect().height : 76;
          const mapaTop = mapaEl.getBoundingClientRect().top + window.scrollY;
          window.scrollTo({
            top: Math.max(0, Math.round(mapaTop - topbarHeight - 6)),
            behavior: "instant" as ScrollBehavior,
          });
        }
      }
    }
  }, [selectingLocationForExp, isMobile]);

  useEffect(() => {
    if (isScrollLocked) {
      lockScroll();
      document.documentElement.style.overflow = "hidden";
      document.body.style.overflow = "hidden";
      return () => {
        unlockScroll();
      };
    }
  }, [isScrollLocked]);

  useEffect(() => {
    if (controlledExperiencesMode !== undefined && !isReadOnly) {
      if (controlledExperiencesMode !== experiencesMode) {
        setExperiencesMode(controlledExperiencesMode);
      }
    }
  }, [controlledExperiencesMode, isReadOnly]);

  useEffect(() => {
    if (initialExperiencesMode) {
      setExperiencesMode(true);
    } else if (!isReadOnly && controlledExperiencesMode === undefined) {
      const savedExp = localStorage.getItem("myExperiencesMode");
      if (savedExp === "true") setExperiencesMode(true);
    }
  }, [isReadOnly, initialExperiencesMode, controlledExperiencesMode]);

  useEffect(() => {
    if (!isReadOnly) {
      localStorage.setItem("myExperiencesMode", experiencesMode.toString());
    }
  }, [experiencesMode, isReadOnly]);
  const [expandedCountryId, setExpandedCountryId] = useState<string | null>(
    null,
  );
  const [ascentsSortOrder, setAscentsSortOrder] = useState<"asc" | "desc">(
    "asc",
  );
  const [myAscents, setMyAscents] = useState<Ascent[]>([]);

  const touchStartX = useRef<number | null>(null);

  const currentPhotoGroup = useMemo(() => {
    if (!lightboxPhoto || !selected || !isSelectedValidForCurrentMode) return [];
    const registeredDates = new Set([
      ...ascents
        .filter((a) => a.summit_id === selected.id && !a.is_wishlist)
        .map((a) => a.achieved_on),
      ...experienceRecords
        .filter(
          (r) =>
            r.experience_id === selected.id || r.sub_item_id === selected.id,
        )
        .map((r) => r.achieved_on),
    ]);
    const isRegistered = registeredDates.has(lightboxPhoto.taken_on);

    if (isRegistered) {
      return photos.filter(
        (p) =>
          p.summit_id === selected.id && p.taken_on === lightboxPhoto.taken_on,
      );
    } else {
      return photos.filter(
        (p) => p.summit_id === selected.id && !registeredDates.has(p.taken_on),
      );
    }
  }, [lightboxPhoto, selected, isSelectedValidForCurrentMode, ascents, experienceRecords, photos]);

  const lightboxIndex = lightboxPhoto
    ? currentPhotoGroup.findIndex((p) => p.id === lightboxPhoto.id)
    : -1;

  useEffect(() => {
    if (session) {
      supabase
        ?.from("profiles")
        .select("username, avatar_url, enable_experiences, enable_peaks, enable_countries")
        .eq("id", session.user.id)
        .single()
        .then(({ data }) => {
          if (data) setMyProfile(data);
        });
    }
  }, [session]);

  // Handle back button to close panels
  useEffect(() => {
    if (!isActive) return;
    const handleHashChange = () => {
      const hash = window.location.hash;
      if (hash === "#editor") {
        // Let it stay open
      } else if (hash === "#lightbox") {
        setEditorPhoto(null);
      } else if (hash === "#estadisticas" || hash === "#galeria") {
        setStatsOpen(true);
        setSelected(null);
        setSelectedPeak(null);
        setSelectedCountry(null);
        setSelectedExperience(null);
        setPanelIdToOpen(null);
        setRecordOpen(false);
        panelPushedRef.current = false;
        panelOpenedFromStatsRef.current = false;
        recordOpenedFromPanelRef.current = false;
      } else if (hash.startsWith("#panel")) {
        if (isClosingPanelRef.current) return;
        setEditorPhoto(null);
        setLightboxPhoto(null);
        if (!panelOpenedFromStatsRef.current) {
          setStatsOpen(false);
        }
        const panelId = decodeURIComponent(hash.startsWith("#panel=") ? hash.substring(7) : hash.substring(6));
        if (panelId) {
          const currentSelected = selectedRef.current;
          if (!currentSelected || currentSelected.id !== panelId.split("::")[0]) {
            setPanelIdToOpen(panelId);
          }
        } else {
          setSelected(null);
          setRecordOpen(false);
        }
      } else {
        isClosingPanelRef.current = false;
        if (typeof document !== "undefined") {
          document.querySelectorAll(".leaflet-tooltip").forEach((el) => {
            el.parentElement?.removeChild(el);
          });
        }
        if (!panelIdToOpenRef.current) {
          setEditorPhoto(null);
          setLightboxPhoto(null);
          setSelected(null);
          setRecordOpen(false);
          setProfileOpen(false);
          setStatsOpen(false);
          setAuthOpen(false);
          panelPushedRef.current = false;
          panelOpenedFromStatsRef.current = false;
          recordOpenedFromPanelRef.current = false;
        }
      }
    };
    handleHashChange();
    window.addEventListener("hashchange", handleHashChange);
    window.addEventListener("popstate", handleHashChange);
    return () => {
      window.removeEventListener("hashchange", handleHashChange);
      window.removeEventListener("popstate", handleHashChange);
    };
  }, [isActive, setSelected]);

  useEffect(() => {
    if (!isActive) {
      document.body.classList.remove("mode-experiences");
      document.body.classList.remove("mode-countries");
      return;
    }
    setTimeout(() => window.dispatchEvent(new Event("resize")), 50);
    if (experiencesMode && !isPeaks && (session || isReadOnly)) {
      document.body.classList.add("mode-experiences");
      document.body.classList.remove("mode-countries");
    } else if (isPeaks) {
      document.body.classList.remove("mode-experiences");
      document.body.classList.remove("mode-countries");
    } else {
      document.body.classList.add("mode-countries");
      document.body.classList.remove("mode-experiences");
    }

    return () => {
      document.body.classList.remove("mode-experiences");
      document.body.classList.remove("mode-countries");
    };
  }, [experiencesMode, isPeaks, isActive, session, isReadOnly]);

  // ── Mode config ────────────────────────────
  const dynamicCategories = useMemo(() => {
    const hiddenCategoryIds = new Set(
      hiddenItems
        .filter((h) => h.item_type === "category")
        .map((h) => h.item_id),
    );
    const hiddenExperienceIds = new Set(
      hiddenItems
        .filter((h) => h.item_type === "experience")
        .map((h) => h.item_id),
    );

    const visiblePredefined = predefinedCategories
      .filter((cat) => !hiddenCategoryIds.has(cat.id))
      .map((cat) => {
        const linkedCustomExps = customExperiences
          .filter((ce) => ce.static_category_id === cat.id)
          .map((ce) => ({ id: ce.id, name: ce.name, subItems: ce.sub_items }));

        return {
          ...cat,
          name: cat.name,
          iconName: cat.iconName,
          experiences: [
            ...cat.experiences.filter(
              (exp) => !hiddenExperienceIds.has(exp.id),
            ),
            ...linkedCustomExps.filter(
              (exp) => !hiddenExperienceIds.has(exp.id),
            ),
          ],
        };
      });

    const customCats: ExperienceCategory[] = customCategories
      .filter((cat) => !cat.static_id && !hiddenCategoryIds.has(cat.id))
      .map((cat) => ({
        id: cat.id,
        name: cat.name,
        iconName: cat.icon_name,
        experiences: customExperiences
          .filter(
            (ce) =>
              ce.category_id === cat.id && !hiddenExperienceIds.has(ce.id),
          )
          .map((ce) => ({
            id: ce.id,
            name: ce.name,
            subItems: ce.sub_items,
          })),
      }));

    // Group any orphaned experiences (no custom category, no static category)
    const orphanedExperiences = customExperiences.filter(
      (ce) =>
        !ce.category_id &&
        !ce.static_category_id &&
        !hiddenExperienceIds.has(ce.id),
    );
    if (orphanedExperiences.length > 0) {
      const orphansCat = orphanedExperiences.reduce(
        (acc: ExperienceCategory[], ce) => {
          const icon = ce.icon_name || "star";
          let c = acc.find((x) => x.iconName === icon);
          if (!c) {
            c = {
              id: `cat-custom-${icon}`,
              name: `Personalizadas (${icon})`,
              iconName: icon,
              experiences: [],
            };
            acc.push(c);
          }
          c.experiences.push({
            id: ce.id,
            name: ce.name,
            subItems: ce.sub_items,
          } as any);
          return acc;
        },
        [],
      );
      customCats.push(...orphansCat);
    }

    return [...visiblePredefined, ...customCats];
  }, [customExperiences, customCategories, hiddenItems]);

  const allItems: SelectedItem[] = useMemo(
    () =>
      isPeaks
        ? peaks.map(peakToItem)
        : isExp
          ? dynamicCategories.flatMap((cat) =>
            cat.experiences.map((exp) => ({
              id: exp.id,
              title: exp.name,
              subtitle: "",
              label: "",
              detail: cat.name,
              note: "",
              iconName: cat.iconName,
              subItems: exp.subItems,
              itemType: 'experience' as const,
            })),
          )
          : countries.map(countryToItem),
    [isPeaks, isExp, dynamicCategories],
  );

  const totalCount = isPeaks ? 47 : allItems.length;
  const appBrandName = "Atlas";
  const modeUnit = isPeaks
    ? "cimas conquistadas"
    : isExp
      ? "experiencias registradas"
      : "países visitados";
  const modeUnitSingular = isPeaks ? "cima" : isExp ? "experiencia" : "país";

  const modeListEyebrow = isPeaks
    ? "52 Territorios - 47 Picos"
    : isExp
      ? `${totalCount} Experiencias`
      : "196 Países del mundo";
  const modeListTitle = isPeaks
    ? "Todas las cumbres"
    : isExp
      ? isReadOnly
        ? "Todas sus experiencias"
        : "Todas tus experiencias"
      : "Todos los países";
  const modeListSubtitle = isPeaks
    ? "Ordenadas por altitud, de mayor a menor."
    : isExp
      ? "Agrupadas por categoría."
      : "Ordenados alfabéticamente.";

  // IDs válidos para este modo (para filtrar ascents de Supabase)
  const validIds = useMemo(() => {
    const ids = new Set(allItems.map((i) => i.id));
    if (!isPeaks && isExp) {
      countries.forEach((c) => ids.add(c.id));
    }
    return ids;
  }, [allItems, isPeaks, isExp]);

  // Filtrar ascents por modo
  const modeAscents = useMemo(() => {
    const regularAscents = ascents.filter((a) => validIds.has(a.summit_id));
    if (isExp) {
      const expAscents = experienceRecords.map((r) => ({
        summit_id: r.experience_id,
        achieved_on: r.achieved_on,
        end_date: null,
        notes: r.notes || null,
        is_wishlist: r.is_wishlist,
        record_id: r.id,
        lat: r.lat,
        lng: r.lng,
        location_name: r.location_name,
        sub_item_id: r.sub_item_id,
      }));
      return [...regularAscents, ...expAscents].filter((a) =>
        validIds.has(a.summit_id),
      );
    }
    return regularAscents;
  }, [ascents, validIds, isExp, experienceRecords]);

  const completedModeAscents = useMemo(
    () => modeAscents.filter((a) => !a.is_wishlist),
    [modeAscents],
  );

  // Restore selection on load synchronously before paint
  useIsomorphicLayoutEffect(() => {
    if (isClosingPanelRef.current) return;
    const hash = window.location.hash;
    if (initialPanelRestoredRef.current && !panelIdToOpen) return;
    const targetHash = panelIdToOpen ? `#panel=${panelIdToOpen}` : hash;
    if (targetHash.startsWith("#panel=")) {
      const rawId = targetHash.substring(7);
      if (rawId) {
        const id = decodeURIComponent(rawId);
        let baseId = id;
        let subItemId: string | undefined = undefined;
        if (id.includes("::")) {
          const parts = id.split("::");
          baseId = parts[0];
          subItemId = parts[1];
        }

        // Check if it's an experience and we need to activate experiencesMode
        const isPredefined = predefinedCategories.some((cat) =>
          cat.experiences.some((exp) => exp.id === baseId),
        );
        const isCustom = customExperiences.some((exp) => exp.id === baseId);
        const isExpId = isPredefined || isCustom || baseId.startsWith("exp-");

        if (isExpId && (!experiencesMode || isPeaks)) {
          if (!canShowCountries) return;
          if (isPeaks) setCurrentMode("countries");
          setExperiencesMode(true);
          onToggleExperiences?.(true);
          return;
        }

        // Check if it's a peak and we need to switch mode
        const isPeakMatch = peaks.some(
          (p) =>
            p.id === baseId ||
            p.name.toLowerCase() === baseId.toLowerCase() ||
            p.province.toLowerCase() === baseId.toLowerCase()
        );
        if (!isPeaks && isPeakMatch) {
          if (!canShowPeaks) return;
          setCurrentMode("peaks");
          return;
        }

        // Check if it's a country and we need to switch mode
        const isCountryMatch =
          baseId.startsWith("country-") ||
          countries.some(
            (c) =>
              c.id === baseId ||
              c.name.toLowerCase() === baseId.toLowerCase() ||
              c.iso_a2.toLowerCase() === baseId.toLowerCase()
          );
        if (isPeaks && isCountryMatch) {
          if (!canShowCountries) return;
          setCurrentMode("countries");
          return;
        }

        let item: SelectedItem | undefined = allItems.find(
          (i) => i.id === baseId || i.id === id,
        );
        if (!item && isPeaks) {
          const matchedPeak = peaks.find(
            (p) =>
              p.id === baseId ||
              p.name.toLowerCase() === baseId.toLowerCase() ||
              p.province.toLowerCase() === baseId.toLowerCase()
          );
          if (matchedPeak) {
            item = allItems.find((i) => i.id === matchedPeak.id);
          }
        }
        if (!item && !isPeaks) {
          const matchedCountry = countries.find(
            (c) =>
              c.id === baseId ||
              c.name.toLowerCase() === baseId.toLowerCase() ||
              c.iso_a2.toLowerCase() === baseId.toLowerCase()
          );
          if (matchedCountry) {
            item = allItems.find((i) => i.id === matchedCountry.id);
          }
        }
        if (item) {
          let selectedItem: SelectedItem = item;
          if (subItemId) {
            selectedItem = { ...item, sub_item_id: subItemId };
          }
          const curSelected = selectedRef.current;
          if (
            !curSelected ||
            curSelected.id !== selectedItem.id ||
            curSelected.sub_item_id !== selectedItem.sub_item_id
          ) {
            setSelected(selectedItem);
          }
          if (panelIdToOpen) {
            setPanelIdToOpen(null);
          }
          initialPanelRestoredRef.current = true;
        }
      }
    } else {
      initialPanelRestoredRef.current = true;
    }
  }, [
    allItems,
    isPeaks,
    panelIdToOpen,
    experiencesMode,
    customExperiences,
    canShowCountries,
    canShowPeaks,
    onToggleExperiences,
    setSelected,
  ]);

  // Contar únicas
  const achievedCount = useMemo(() => {
    if (isExp) {
      let count = 0;
      for (const item of allItems) {
        if (!item.subItems || item.subItems.length === 0) {
          if (completedModeAscents.some((a) => a.summit_id === item.id))
            count++;
        } else {
          const subItemIds = item.subItems.map((s: any) => s.id);
          const completedSubItems = new Set(
            completedModeAscents
              .filter((a) => a.summit_id === item.id && a.sub_item_id)
              .map((a) => a.sub_item_id),
          );
          if (
            subItemIds.length > 0 &&
            subItemIds.every((id: string) => completedSubItems.has(id))
          ) {
            count++;
          }
        }
      }
      return count;
    }
    if (!isPeaks) {
      const uniqueCountries = new Set(
        completedModeAscents
          .filter((a) => a.summit_id.startsWith("country-"))
          .map((a) => a.summit_id),
      );
      return uniqueCountries.size;
    }
    // Para picos, contamos los nombres únicos ya que hay provincias que comparten cima
    const uniquePeakNames = new Set(
      completedModeAscents
        .map((a) => peaks.find((p) => p.id === a.summit_id)?.name)
        .filter(Boolean),
    );
    return uniquePeakNames.size;
  }, [isPeaks, isExp, completedModeAscents]);

  const wishlistCount = useMemo(() => {
    const w = modeAscents.filter((a) => a.is_wishlist);
    if (isExp) {
      const uniqueExps = new Set(
        w
          .filter(
            (a) =>
              !a.summit_id.startsWith("country-"),
          )
          .map(
            (a) => a.summit_id + (a.sub_item_id ? `::${a.sub_item_id}` : ""),
          ),
      );
      return uniqueExps.size;
    }
    if (!isPeaks) {
      const uniqueCountries = new Set(
        w
          .filter((a) => a.summit_id.startsWith("country-"))
          .map((a) => a.summit_id),
      );
      return uniqueCountries.size;
    }
    const uniquePeakNames = new Set(
      w
        .map((a) => peaks.find((p) => p.id === a.summit_id)?.name)
        .filter(Boolean),
    );
    return uniquePeakNames.size;
  }, [isPeaks, isExp, modeAscents]);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const path = window.location.pathname;
      if (path === "/" || path === "/picos") {
        localStorage.setItem("last_map_path", path);
      }
      localStorage.setItem("ranking_mode", currentMode);
    }
  }, [currentMode]);

  /* ── Auto-dismiss toast ───────────────── */
  useEffect(() => {
    // Reset selection when changing panel
    setSelectedPhotosForEdit([]);
  }, [selected]);

  useEffect(() => {
    if (selected?.sub_item_id) {
      const timeout = setTimeout(() => {
        const el = document.querySelector(`.subitem-details[open]`);
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
      }, 150);
      return () => clearTimeout(timeout);
    }
  }, [selected?.sub_item_id]);

  useEffect(() => {
    let timeout: NodeJS.Timeout;
    if (notice) {
      timeout = setTimeout(() => {
        setNotice("");
      }, 4000);
    }
    return () => clearTimeout(timeout);
  }, [notice]);

  function handlePhotoClick(photo: SummitPhoto) {
    if (selectedPhotosForEdit.length > 0) {
      togglePhotoSelection(photo.id);
    } else {
      setLightboxPhoto(photo);
      window.history.pushState(null, "", "#lightbox");
    }
  }

  function togglePhotoSelection(photoId: string) {
    setSelectedPhotosForEdit((prev) =>
      prev.includes(photoId)
        ? prev.filter((id) => id !== photoId)
        : [...prev, photoId],
    );
  }

  async function handleSaveCaption() {
    if (!session || !lightboxPhoto) return;

    setSaving(true);
    const trimmedCaption = lightboxNewCaption.trim();
    const { error } = await supabase!
      .from("summit_photos")
      .update({ caption: trimmedCaption || null })
      .eq("id", lightboxPhoto.id)
      .eq("user_id", session.user.id);

    if (error) {
      setNotice(`Error: ${error.message}`);
    } else {
      setPhotos((prev) =>
        prev.map((p) =>
          p.id === lightboxPhoto.id
            ? { ...p, caption: trimmedCaption || null }
            : p,
        ),
      );
      setLightboxPhoto((prev) =>
        prev ? { ...prev, caption: trimmedCaption || null } : null,
      );
      setLightboxCaptionModalOpen(false);
      setNotice("Descripción guardada correctamente.");
    }
    setSaving(false);
  }

  /* ── Load progress ────────────────────── */
  useEffect(() => {
    async function loadProgress() {
      const targetId = targetProfile ? targetProfile.id : (session?.user.id || authProfile?.id || getStoredUserId());
      if (!supabase || !targetId) {
        if (!targetProfile && !authLoading && !session && !getStoredUserId()) {
          setAscents([]);
          setPhotos([]);
          setExperienceRecords([]);
        }
        return;
      }

      // Check if viewing a private profile where the viewer is not an accepted follower
      const isPrivateTarget = Boolean(
        isReadOnly && targetProfile && targetProfile.is_public === false && session?.user?.id !== targetProfile.id
      );

      let effectiveConnStatus = targetConnStatus;
      if (isPrivateTarget && targetProfile && session?.user?.id && effectiveConnStatus === null) {
        const { data: conn } = await supabase
          .from("connections")
          .select("status")
          .eq("follower_id", session.user.id)
          .eq("following_id", targetProfile.id)
          .maybeSingle();
        if (conn) {
          effectiveConnStatus = conn.status as "pending" | "accepted";
          setTargetConnStatus(effectiveConnStatus);
        }
      }

      const isPrivateRestricted = isPrivateTarget && effectiveConnStatus !== "accepted";

      if (isPrivateRestricted) {
        const { data: completedSummits } = await supabase.rpc(
          "get_user_completed_summits",
          { p_user_id: targetId }
        );

        const syntheticAscents: Ascent[] = (completedSummits || []).map(
          (row: { summit_id: string }) => ({
            summit_id: row.summit_id,
            achieved_on: "1900-01-01",
            end_date: null,
            notes: null,
            is_wishlist: false,
            link: null,
            link_name: null,
            link_2: null,
            link_name_2: null,
          })
        );

        setAscents(syntheticAscents);
        cachedAscentsByUser[targetId] = syntheticAscents;
        setStoredTrackerData("ascents", targetId, syntheticAscents);
        setPhotos([]);
        cachedPhotosByUser[targetId] = [];
        setStoredTrackerData("photos", targetId, []);
        setExperienceRecords([]);
        setCustomExperiences([]);
        setCustomCategories([]);
        setHiddenItems([]);
        cachedTrackerLastFetched[targetId] = Date.now();

        // Load viewer's own ascents for diff comparison
        if (isReadOnly && session) {
          const { data: myData } = await supabase
            .from("ascents")
            .select("id, summit_id, achieved_on, end_date, trip_group_id, notes, is_wishlist, link, link_name, link_2, link_name_2")
            .eq("user_id", session.user.id);
          if (myData && !areRecordsEqual(myAscents, myData)) setMyAscents(myData as Ascent[]);
        }
        return;
      }

      const now = Date.now();
      const hadSyntheticCache = cachedAscentsByUser[targetId]?.some((a) => a.achieved_on === "1900-01-01");
      const isFresh = !hadSyntheticCache && targetId && cachedAscentsByUser[targetId] && (now - (cachedTrackerLastFetched[targetId] || 0) < TRACKER_CACHE_TTL);
      if (isFresh) {
        if (!isReadOnly && !profileOpen && session && !myProfile) {
          const { data: profile } = await supabase
            .from("profiles")
            .select("username, avatar_url, enable_experiences, enable_peaks, enable_countries")
            .eq("id", session.user.id)
            .single();
          if (profile) setMyProfile(profile);
        }
        return;
      }

      const [
        ascentResult,
        photoResult,
        expResult,
        customExpResult,
        customCatResult,
        hiddenItemsResult,
      ] = await Promise.all([
        supabase!
          .from("ascents")
          .select("id, summit_id, achieved_on, end_date, trip_group_id, notes, is_wishlist, link, link_name, link_2, link_name_2")
          .eq("user_id", targetId)
          .order("achieved_on", { ascending: false }),
        supabase!
          .from("summit_photos")
          .select(
            "id, summit_id, public_url, taken_on, caption, created_at, storage_path, shot_at",
          )
          .eq("user_id", targetId)
          .order("taken_on", { ascending: false })
          .order("created_at", { ascending: true }),
        supabase!
          .from("experience_records")
          .select("*")
          .eq("user_id", targetId),
        supabase!
          .from("custom_experiences")
          .select("*")
          .eq("user_id", targetId),
        supabase!
          .from("custom_experience_categories")
          .select("*")
          .eq("user_id", targetId),
        supabase!.from("hidden_items").select("*").eq("user_id", targetId),
      ]);
      if (ascentResult.data) {
        const nextData = ascentResult.data as Ascent[];
        if (!areRecordsEqual(cachedAscentsByUser[targetId], nextData)) {
          setAscents(nextData);
        }
        cachedAscentsByUser[targetId] = nextData;
        setStoredTrackerData("ascents", targetId, nextData);
      }
      if (photoResult.data) {
        const nextData = sortPhotosByTime((photoResult.data as SummitPhoto[]).map((p) => ({ ...p, public_url: getPhotoDisplayUrl(p.public_url, p.storage_path) })));
        if (!areRecordsEqual(cachedPhotosByUser[targetId], nextData)) {
          setPhotos(nextData);
        }
        cachedPhotosByUser[targetId] = nextData;
        setStoredTrackerData("photos", targetId, nextData);
      }
      if (expResult.data) {
        const nextData = expResult.data as ExperienceRecord[];
        if (!areRecordsEqual(cachedExperienceRecordsByUser[targetId], nextData)) {
          setExperienceRecords(nextData);
        }
        cachedExperienceRecordsByUser[targetId] = nextData;
        setStoredTrackerData("exp_records", targetId, nextData);
      }
      if (customExpResult.data) {
        const nextData = customExpResult.data;
        if (!areRecordsEqual(cachedCustomExperiencesByUser[targetId], nextData)) {
          setCustomExperiences(nextData);
        }
        cachedCustomExperiencesByUser[targetId] = nextData;
        setStoredTrackerData("custom_exp", targetId, nextData);
      }
      if (customCatResult.data) {
        const nextData = customCatResult.data;
        if (!areRecordsEqual(cachedCustomCategoriesByUser[targetId], nextData)) {
          setCustomCategories(nextData);
        }
        cachedCustomCategoriesByUser[targetId] = nextData;
        setStoredTrackerData("custom_cat", targetId, nextData);
      }
      if (hiddenItemsResult.data) {
        const nextData = hiddenItemsResult.data as HiddenItem[];
        if (!areRecordsEqual(cachedHiddenItemsByUser[targetId], nextData)) {
          setHiddenItems(nextData);
        }
        cachedHiddenItemsByUser[targetId] = nextData;
        setStoredTrackerData("hidden_items", targetId, nextData);
      }
      cachedTrackerLastFetched[targetId] = Date.now();

      if (!isReadOnly && !profileOpen) {
        // Ensure we have current user profile if session exists
        if (session && !myProfile) {
          const { data: profile } = await supabase
            .from("profiles")
            .select("username, avatar_url, enable_experiences, enable_peaks, enable_countries")
            .eq("id", session.user.id)
            .single();
          if (profile) setMyProfile(profile);
        }
      }

      // Load viewer's own ascents for diff comparison
      if (isReadOnly && session) {
        const { data: myData } = await supabase!
          .from("ascents")
          .select("summit_id, achieved_on, end_date, notes, is_wishlist, link, link_name, link_2, link_name_2")
          .eq("user_id", session.user.id);
        if (myData && !areRecordsEqual(myAscents, myData)) setMyAscents(myData as Ascent[]);
      }
    }
    loadProgress();
  }, [session, profileOpen, isReadOnly, targetProfile, authLoading, authProfile?.id, targetConnStatus]);

  // Precargar inmediatamente las fotos del elemento seleccionado para que aparezcan al instante al abrir el registro
  useEffect(() => {
    if (!selected || typeof window === "undefined") return;
    const targetSummitId = selected.sub_item_id
      ? `${selected.id}::${selected.sub_item_id}`
      : selected.id;
    const currentPhotos = photos.filter(
      (p) => p.summit_id === targetSummitId || p.summit_id === selected.id,
    );
    currentPhotos.forEach((p) => {
      const url =
        p.public_url ||
        (p.storage_path && supabase
          ? supabase.storage.from("summit-photos").getPublicUrl(p.storage_path).data.publicUrl
          : null);
      if (url) {
        const img = new Image();
        img.src = url;
      }
    });
  }, [selected, photos]);

  // Precarga en segundo plano de las primeras 30 fotos de ascensiones y paises del usuario
  useEffect(() => {
    if (typeof window === "undefined" || !photos || photos.length === 0) return;
    const timer = setTimeout(() => {
      photos.slice(0, 30).forEach((p) => {
        const url = getPhotoDisplayUrl(p.public_url, p.storage_path);
        if (url) {
          const img = new Image();
          img.decoding = "async";
          img.src = url;
        }
      });
    }, 1500);
    return () => clearTimeout(timer);
  }, [photos]);

  /* ── Derived state ────────────────────── */
  // Completed set for SpainMap (province codes)
  const completedPeakCodes = useMemo(
    () =>
      new Set(
        ascents
          .filter((a) => !a.is_wishlist)
          .flatMap((a) =>
            peaks.filter((p) => p.id === a.summit_id).map((p) => p.code),
          ),
      ),
    [ascents],
  );
  const wishlistPeakCodes = useMemo(
    () =>
      new Set(
        ascents
          .filter((a) => a.is_wishlist)
          .flatMap((a) =>
            peaks.filter((p) => p.id === a.summit_id).map((p) => p.code),
          ),
      ),
    [ascents],
  );

  // Completed set for WorldMap (country ids)
  const completedCountryIds = useMemo(
    () =>
      new Set(
        ascents
          .filter((a) => a.summit_id.startsWith("country-") && !a.is_wishlist)
          .map((a) => a.summit_id),
      ),
    [ascents],
  );
  const wishlistCountryIds = useMemo(
    () =>
      new Set(
        ascents
          .filter((a) => a.summit_id.startsWith("country-") && a.is_wishlist)
          .map((a) => a.summit_id),
      ),
    [ascents],
  );

  /* ── Diff comparison sets ────────────── */
  const myCompletedPeakCodes = useMemo(
    () =>
      new Set(
        myAscents
          .filter((a) => !a.is_wishlist)
          .flatMap((a) =>
            peaks.filter((p) => p.id === a.summit_id).map((p) => p.code),
          ),
      ),
    [myAscents],
  );
  const myCompletedCountryIds = useMemo(
    () =>
      new Set(
        myAscents
          .filter((a) => a.summit_id.startsWith("country-") && !a.is_wishlist)
          .map((a) => a.summit_id),
      ),
    [myAscents],
  );
  const myCompletedIds = useMemo(
    () =>
      new Set(myAscents.filter((a) => !a.is_wishlist).map((a) => a.summit_id)),
    [myAscents],
  );

  // Diff sets for peaks (province codes)
  const diffPeakOnlyViewer = useMemo(
    () =>
      new Set(
        [...myCompletedPeakCodes].filter((c) => !completedPeakCodes.has(c)),
      ),
    [myCompletedPeakCodes, completedPeakCodes],
  );
  const diffPeakOnlyTarget = useMemo(
    () =>
      new Set(
        [...completedPeakCodes].filter((c) => !myCompletedPeakCodes.has(c)),
      ),
    [completedPeakCodes, myCompletedPeakCodes],
  );
  const diffPeakBoth = useMemo(
    () =>
      new Set(
        [...completedPeakCodes].filter((c) => myCompletedPeakCodes.has(c)),
      ),
    [completedPeakCodes, myCompletedPeakCodes],
  );

  // Diff sets for countries (country ids)
  const diffCountryOnlyViewer = useMemo(
    () =>
      new Set(
        [...myCompletedCountryIds].filter((c) => !completedCountryIds.has(c)),
      ),
    [myCompletedCountryIds, completedCountryIds],
  );
  const diffCountryOnlyTarget = useMemo(
    () =>
      new Set(
        [...completedCountryIds].filter((c) => !myCompletedCountryIds.has(c)),
      ),
    [completedCountryIds, myCompletedCountryIds],
  );
  const diffCountryBoth = useMemo(
    () =>
      new Set(
        [...completedCountryIds].filter((c) => myCompletedCountryIds.has(c)),
      ),
    [completedCountryIds, myCompletedCountryIds],
  );

  // Diff sets for the list (summit ids)
  const diffItemOnlyViewer = useMemo(() => {
    const targetCompleted = new Set(
      completedModeAscents.map((a) => a.summit_id),
    );
    return new Set(
      [...myCompletedIds].filter(
        (id) => validIds.has(id) && !targetCompleted.has(id),
      ),
    );
  }, [myCompletedIds, completedModeAscents, validIds]);
  const diffItemOnlyTarget = useMemo(() => {
    return new Set(
      completedModeAscents
        .map((a) => a.summit_id)
        .filter((id) => !myCompletedIds.has(id)),
    );
  }, [completedModeAscents, myCompletedIds]);
  const diffItemBoth = useMemo(() => {
    return new Set(
      completedModeAscents
        .map((a) => a.summit_id)
        .filter((id) => myCompletedIds.has(id)),
    );
  }, [completedModeAscents, myCompletedIds]);

  const selectedAscents = useMemo(() => {
    if (!selected || !isSelectedValidForCurrentMode) return [];

    const allAscents = [
      ...ascents,
      ...experienceRecords.map((r) => ({
        summit_id: r.experience_id,
        achieved_on: r.achieved_on,
        end_date: null,
        notes: r.notes || null,
        is_wishlist: r.is_wishlist,
        record_id: r.id,
        lat: r.lat,
        lng: r.lng,
        location_name: r.location_name,
        sub_item_id: r.sub_item_id,
        link: r.link || null,
        link_name: r.link_name || null,
        link_2: (r as any).link_2 || null,
        link_name_2: (r as any).link_name_2 || null,
        trip_group_id: r.trip_group_id || null,
      })),
    ];

    return allAscents
      .filter((a) => a.summit_id === selected.id && !a.is_wishlist)
      .sort((a, b) => {
        const order = ascentsSortOrder === "asc" ? 1 : -1;
        if (a.achieved_on !== b.achieved_on) {
          return a.achieved_on.localeCompare(b.achieved_on) * order;
        }
        const aEnd = a.end_date || a.achieved_on;
        const bEnd = b.end_date || b.achieved_on;
        return aEnd.localeCompare(bEnd) * order;
      });
  }, [selected, isSelectedValidForCurrentMode, ascents, experienceRecords, ascentsSortOrder]);

  const selectedExperienceRecords = useMemo(() => {
    if (!selected || !isSelectedValidForCurrentMode) return [];
    return experienceRecords
      .filter((r) => r.experience_id === selected.id && !r.sub_item_id)
      .sort((a, b) => {
        const order = ascentsSortOrder === "asc" ? 1 : -1;
        if (a.achieved_on !== b.achieved_on) {
          return a.achieved_on.localeCompare(b.achieved_on) * order;
        }
        return 0;
      });
  }, [selected, isSelectedValidForCurrentMode, experienceRecords, ascentsSortOrder]);

  const hasWishlist = useMemo(() => {
    if (!selected || !isSelectedValidForCurrentMode) return false;
    const allAscents = [
      ...ascents,
      ...experienceRecords.map((r) => ({
        summit_id: r.experience_id,
        is_wishlist: r.is_wishlist,
      })),
    ];
    return allAscents.some((a) => a.summit_id === selected.id && a.is_wishlist);
  }, [selected, isSelectedValidForCurrentMode, ascents, experienceRecords]);

  const wishlistEntry = useMemo(() => {
    if (!selected || !isSelectedValidForCurrentMode) return null;
    return ascents.find((a) => a.summit_id === selected.id && a.is_wishlist) ?? null;
  }, [selected, isSelectedValidForCurrentMode, ascents]);
  const selectedPhotos = selected && isSelectedValidForCurrentMode
    ? photos.filter(
      (p) =>
        p.summit_id === selected.id ||
        p.summit_id.startsWith(selected.id + "::"),
    )
    : [];
  const completion = Math.round((achievedCount / totalCount) * 100);

  /* ── Handlers ─────────────────────────── */
  const openInformation = useCallback((item: SelectedItem) => {
    const targetHash = `#panel=${encodeURIComponent(item.id)}`;
    if (typeof window !== "undefined" && window.location.hash !== targetHash) {
      if (panelPushedRef.current || window.location.hash.startsWith("#panel")) {
        window.history.replaceState({ hasPanel: true }, "", targetHash);
      } else {
        panelPushedRef.current = true;
        window.history.pushState({ hasPanel: true }, "", targetHash);
      }
    }
    setSelected(item);
    setRecordOpen(false);
    setNotice("");
    setShowWishlistNoteEditor(false);
  }, [setSelected]);

  async function handleAddPhotosToDate(
    event: ChangeEvent<HTMLInputElement>,
    ascent: Ascent,
  ) {
    const nextFiles = Array.from(event.target.files ?? []);
    if (!supabase || !session || !selected) return;

    const expectedSummitId = ascent.sub_item_id
      ? `${selected.id}::${ascent.sub_item_id}`
      : selected.id;

    const existingPhotos = selectedPhotos.filter(
      (p) =>
        p.taken_on === ascent.achieved_on &&
        (p.summit_id === expectedSummitId || p.summit_id === selected.id),
    );
    if (existingPhotos.length + nextFiles.length > 4) {
      const remainingSlots = Math.max(0, 4 - existingPhotos.length);
      setNotice(
        remainingSlots > 0
          ? `Máximo 4 fotos por registro. Solo puedes añadir ${remainingSlots} foto${remainingSlots !== 1 ? "s" : ""} más (ya tienes ${existingPhotos.length}).`
          : `Máximo 4 fotos por registro. Ya has alcanzado el límite de 4 fotos.`,
      );
      event.target.value = "";
      return;
    }


    const remainingSlots = Math.max(0, 4 - existingPhotos.length);
    const sortedFilesWithTime = await sortFilesByCaptureTime(nextFiles, ascent.achieved_on);
    const filesToUpload = sortedFilesWithTime.slice(0, remainingSlots);

    setSaving(true);
    setNotice("Subiendo fotos...");

    const uploaded: SummitPhoto[] = [];
    const uploadTasks = filesToUpload.map(async ({ file, shotAt }) => {
      if (!file.type.startsWith("image/")) return null;
      try {
        const compressedBlob = await compressImage(file);
        const uploadResult = await uploadPhotoBlob({
          blob: compressedBlob,
          fileName: file.name,
          summitId: selected.id,
          session,
          supabase,
        });
        return {
          user_id: session.user.id,
          summit_id: ascent.sub_item_id
            ? `${selected.id}::${ascent.sub_item_id}`
            : selected.id,
          storage_path: uploadResult.storagePath,
          public_url: uploadResult.publicUrl,
          file_size: uploadResult.fileSize,
          taken_on: ascent.achieved_on,
          shot_at: shotAt,
        };
      } catch (uploadErr: any) {
        setNotice(uploadErr.message || `Error al subir ${file.name}`);
        return null;
      }
    });

    const photoRecordsToInsert = (await Promise.all(uploadTasks)).filter((item): item is NonNullable<typeof item> => Boolean(item));
    if (photoRecordsToInsert.length > 0) {
      const photoResult = await supabase
        .from("summit_photos")
        .insert(photoRecordsToInsert)
        .select();
      if (photoResult.data) {
        uploaded.push(...(photoResult.data as SummitPhoto[]));
      }
    }

    if (uploaded.length) setPhotos((prev) => sortPhotosByTime([...prev, ...uploaded]));
    event.target.value = "";
    setSaving(false);
    setNotice(
      uploaded.length > 0
        ? "Fotos subidas correctamente."
        : "No se subieron fotos.",
    );
  }

  const openPeakInformation = useCallback(
    (peak: Peak) => {
      openInformation(peakToItem(peak));
    },
    [openInformation],
  );

  const openCountryInformation = useCallback(
    (country: Country) => {
      openInformation(countryToItem(country));
    },
    [openInformation],
  );

  function handleCancelSelectingLocationForExp() {
    if (!selectingLocationForExp) return;

    if (selectingFromRecordRef.current) {
      selectingFromRecordRef.current = false;
      const [expId, subItemId] = selectingLocationForExp.split("::");
      let category = dynamicCategories.find((c) =>
        c.experiences.some((e) => e.id === expId),
      );
      let exp = category?.experiences.find((e) => e.id === expId);

      if (exp && category) {
        const title = exp.name;
        const item: SelectedItem = {
          id: expId,
          sub_item_id: subItemId,
          title: title,
          subtitle: category.name,
          label: "",
          detail: category.name,
          note: "",
          iconName: category.iconName,
          subItems: exp.subItems,
          itemType: 'experience' as const,
        };
        setSelectingLocationForExp(null);
        setSelected(item);
        setRecordOpen(true);
        setEditingExpRecordId(null);
        const targetHash = `#panel=${encodeURIComponent(expId)}`;
        if (window.location.hash !== targetHash) {
          window.history.replaceState({ hasPanel: true }, "", targetHash);
        }
        return;
      }
    }

    selectingFromRecordRef.current = false;
    setSelectingLocationForExp(null);
    setSelected(null);
    setRecordOpen(false);
  }

  async function handleMapClickForExp(
    lat: number,
    lng: number,
    placeNameArg?: string,
  ) {
    if (!selectingLocationForExp) return;

    const [expId, subItemId] = selectingLocationForExp.split("::");
    let category = dynamicCategories.find((c) =>
      c.experiences.some((e) => e.id === expId),
    );
    let exp = category?.experiences.find((e) => e.id === expId);

    if (exp && category) {
      const title = exp.name;
      const item: SelectedItem = {
        id: expId,
        sub_item_id: subItemId,
        title: title,
        subtitle: category.name,
        label: "",
        detail: category.name,
        note: "",
        iconName: category.iconName,
        subItems: exp.subItems,
        itemType: 'experience' as const,
      };
      let placeName = placeNameArg || "";
      if (!placeName) {
        try {
          const res = await fetch(
            `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=10&accept-language=es`,
          );
          const data = await res.json();
          if (data && data.address) {
            placeName =
              data.address.city ||
              data.address.town ||
              data.address.village ||
              data.address.county ||
              data.address.state ||
              data.address.country ||
              data.address.ocean ||
              data.address.sea ||
              "";
          }
        } catch (e) {
          console.warn("Reverse geocoding error:", e);
        }
      }

      selectingFromRecordRef.current = false;
      setSelectingLocationForExp(null);
      setSelectedLatLng({ lat, lng });
      setLocationName(placeName || "");
      setEditingExpRecordId(null);
      openRecord(item);
    }
  }

  async function handleShareRecord(
    item: SelectedItem,
    ascent: Ascent | any,
    _ascentPhotos: SummitPhoto[],
  ) {
    if (!myProfile?.username) {
      setNotice("Necesitas un nombre de usuario para compartir.");
      setTimeout(() => setNotice(""), 4000);
      return;
    }

    const baseUrl = window.location.origin;
    const challenge = item.itemType === "experience"
      ? "experiences"
      : (item.itemType === "peak" || isPeaks) ? "peaks" : "countries";
    const recordId = item.sub_item_id ? `${item.id}::${item.sub_item_id}` : item.id;
    const profileUrl = buildRecordShareUrl({
      baseUrl,
      username: myProfile.username,
      challenge,
      recordId,
      from: isPeaks ? "mapa" : "social",
    });

        // Build share text based on item type
    const hasKnownDate = ascent.achieved_on && ascent.achieved_on !== "1900-01-01";
    let dateSuffix = "";
    if (hasKnownDate) {
      const dateStr = formatDate(ascent.achieved_on);
      const endDateStr = ascent.end_date && ascent.end_date !== "1900-01-01" && ascent.end_date !== ascent.achieved_on
        ? ` - ${formatDate(ascent.end_date)}`
        : "";
      const dateRange = sanitizeDateForShare(`${dateStr}${endDateStr}`);
      dateSuffix = ` el ${dateRange}`;
    }

    let shareText = "";
    const itemType = (item as any).itemType;
    if (itemType === "peak") {
      shareText = `Mi ascensión a ${item.title}${dateSuffix}`;
    } else if (itemType === "experience") {
      shareText = `Mi experiencia en ${item.title}${dateSuffix}`;
    } else {
      // country
      shareText = `Mi visita a ${item.title}${dateSuffix}`;
    }

    if (ascent.notes) {
      shareText += `\n"${sanitizeTextForShare(ascent.notes)}"`;
    }

    if (ascent.link) {
      const linkLabel = (ascent as any).link_name ? `${(ascent as any).link_name}: ` : "";
      shareText += `\n${linkLabel}${ascent.link}`;
    }

    if ((ascent as any).link_2) {
      const linkLabel2 = (ascent as any).link_name_2 ? `${(ascent as any).link_name_2}: ` : "";
      shareText += `\n${linkLabel2}${(ascent as any).link_2}`;
    }

    shareText += `\n\n${profileUrl}`;

    const shareTitle = `${item.title} · @${myProfile.username}`;
    await executeShare(
      {
        title: shareTitle,
        text: shareText,
        url: profileUrl,
      },
      () => {
        setNotice("Enlace copiado al portapapeles");
        setTimeout(() => setNotice(""), 3000);
      }
    );
  }

  function handleExperienceClick(record: ExperienceRecord) {
    if (!experiencesMode) return;
    let category = dynamicCategories.find((c) =>
      c.experiences.some((e) => e.id === record.experience_id),
    );
    let exp = category?.experiences.find((e) => e.id === record.experience_id);
    if (exp && category) {
      const title = exp.name;
      const item: SelectedItem = {
        id: record.experience_id,
        sub_item_id: record.sub_item_id,
        title: title,
        subtitle: category.name,
        label: "",
        detail: category.name,
        note: "",
        iconName: category.iconName,
        subItems: exp.subItems,
        itemType: 'experience' as const,
      };
      openInformation(item);
    }
  }

  const openRecord = useCallback(
    (item?: SelectedItem | null, ascentToEdit?: Ascent | any) => {
      if (isReadOnly) return;
      if (!session) {
        const targetHash = "#panel";
        if (window.location.hash !== targetHash) {
          if (panelPushedRef.current || (typeof window !== "undefined" && window.location.hash.startsWith("#panel"))) {
            window.history.replaceState({ hasPanel: true }, "", targetHash);
          } else {
            panelPushedRef.current = true;
            window.history.pushState({ hasPanel: true }, "", targetHash);
          }
        }
        setAuthOpen("login");
        return;
      }
      recordOpenedFromPanelRef.current = !!(selected && item && selected.id === item.id);
      const targetHash = item ? `#panel=${encodeURIComponent(item.id)}` : "#panel";
      if (window.location.hash !== targetHash) {
        if (panelPushedRef.current || (typeof window !== "undefined" && window.location.hash.startsWith("#panel"))) {
          window.history.replaceState({ hasPanel: true }, "", targetHash);
        } else {
          panelPushedRef.current = true;
          window.history.pushState({ hasPanel: true }, "", targetHash);
        }
      }
      setRecordOpen(true);
      if (!item) {
        setClimbDate(null);
        setClimbEndDate(null);
        setIsEndDateEnabled(false);
        setOriginalAchievedOn(null);
        setIsDateUnknown(true);
        setIsDateModified(false);
        setNotes("");
        setLink("");
        setLinkName("");
        setLink2("");
        setLinkName2("");
        setShowSecondLink(false);
        setFiles([]);
        setDeletedRecordPhotoIds([]);
      } else {
        setSelected(item);
        if (ascentToEdit) {
          let tripGrpId = (ascentToEdit as any)?.trip_group_id || null;
          if (!tripGrpId) {
            const expRecId = (ascentToEdit as any).record_id || (ascentToEdit as any).id;
            if (expRecId) {
              const expMatch = experienceRecords.find((r) => r.id === expRecId);
              if (expMatch?.trip_group_id) tripGrpId = expMatch.trip_group_id;
            }
            if (!tripGrpId && item?.id && ascentToEdit.achieved_on) {
              const ascMatch = ascents.find(
                (a) => a.summit_id === item.id && a.achieved_on === ascentToEdit.achieved_on
              );
              if (ascMatch?.trip_group_id) tripGrpId = ascMatch.trip_group_id;
            }
            if (!tripGrpId && item?.id && ascentToEdit.achieved_on) {
              const expDateMatch = experienceRecords.find(
                (r) =>
                  r.experience_id === item.id &&
                  r.achieved_on === ascentToEdit.achieved_on &&
                  (!item.sub_item_id || r.sub_item_id === item.sub_item_id)
              );
              if (expDateMatch?.trip_group_id) tripGrpId = expDateMatch.trip_group_id;
            }
          }

          if (tripGrpId && supabase) {
            setCurrentTripGroupId(tripGrpId);
            setSelectedCompanions([]);
            setCompanionStatuses({});

            (async () => {
              try {
                const { data } = await supabase
                  .from("record_companions")
                  .select(`
                    id,
                    trip_group_id,
                    inviter_id,
                    companion_id,
                    status,
                    original_start_date,
                    original_end_date,
                    companion_profile:profiles!record_companions_companion_id_fkey(id, username, avatar_url, is_public),
                    inviter_profile:profiles!record_companions_inviter_id_fkey(id, username, avatar_url, is_public)
                  `)
                  .eq("trip_group_id", tripGrpId);

                if (data && data.length > 0) {
                  const followers = session?.user?.id ? await getMutualFollowers(session.user.id) : [];
                  const followersMap = new Map<string, CompanionProfile>(followers.map((f) => [f.id, f]));

                  const comps: CompanionProfile[] = [];
                  const statuses: Record<string, any> = {};

                  for (const row of data) {
                    const isCurrentUserInviter = row.inviter_id === session?.user?.id;
                    const otherId = isCurrentUserInviter ? row.companion_id : row.inviter_id;
                    const rawComp = Array.isArray(row.companion_profile) ? row.companion_profile[0] : row.companion_profile;
                    const rawInv = Array.isArray(row.inviter_profile) ? row.inviter_profile[0] : row.inviter_profile;
                    let profile: CompanionProfile | null = isCurrentUserInviter
                      ? (rawComp as unknown as CompanionProfile | null)
                      : (rawInv as unknown as CompanionProfile | null);

                    if ((!profile || !profile.username) && otherId && followersMap.has(otherId)) {
                      profile = followersMap.get(otherId)!;
                    }

                    if ((!profile || !profile.username) && otherId) {
                      const { data: directProf } = await supabase
                        .from("profiles")
                        .select("id, username, avatar_url, is_public")
                        .eq("id", otherId)
                        .maybeSingle();
                      if (directProf?.username) {
                        profile = directProf as CompanionProfile;
                      }
                    }

                    if (profile && profile.username) {
                      if (!comps.some((c) => c.id === profile!.id)) {
                        comps.push(profile);
                      }
                      statuses[profile.id] = row.status;
                    } else if (otherId) {
                      comps.push({ id: otherId, username: "compañero" });
                      statuses[otherId] = row.status;
                    }
                  }

                  setSelectedCompanions(comps);
                  setCompanionStatuses(statuses);
                  setOriginalTripDates({
                    start: data[0].original_start_date,
                    end: data[0].original_end_date,
                  });
                } else {
                  setSelectedCompanions([]);
                  setCompanionStatuses({});
                  setOriginalTripDates(null);
                }
              } catch (err) {
                console.warn("Error fetching companions for trip:", err);
              }
            })();
          } else {
            setCurrentTripGroupId(null);
            setSelectedCompanions([]);
            setCompanionStatuses({});
            setOriginalTripDates(null);
          }

          if (item?.itemType === 'experience') {
            const recId =
              (ascentToEdit as any).record_id || (ascentToEdit as any).id;
            if (recId) {
              setEditingExpRecordId(recId);
              setSelectedLatLng({
                lat: (ascentToEdit as any).lat,
                lng: (ascentToEdit as any).lng,
              });
              setLocationName((ascentToEdit as any).location_name || "");
            } else {
              setEditingExpRecordId(null);
            }
          } else {
            setEditingExpRecordId(null);
          }
          const date = ascentToEdit.achieved_on;
          setClimbDate(date && date !== "1900-01-01" ? new Date(date) : null);
          setClimbEndDate(
            ascentToEdit.end_date ? new Date(ascentToEdit.end_date) : null,
          );
          setIsEndDateEnabled(!!ascentToEdit.end_date);
          setOriginalAchievedOn(date);
          setIsDateUnknown(!date || date === "1900-01-01");
          setIsDateModified(!!date && date !== "1900-01-01");
          setNotes(ascentToEdit.notes ?? "");
          setLink((ascentToEdit as any).link ?? "");
          setLinkName((ascentToEdit as any).link_name ?? "");
          const hasSecondLink = Boolean(
            (ascentToEdit as any).link_2 || (ascentToEdit as any).link_name_2
          );
          setLink2((ascentToEdit as any).link_2 ?? "");
          setLinkName2((ascentToEdit as any).link_name_2 ?? "");
          setShowSecondLink(hasSecondLink);
        } else {
          setCurrentTripGroupId(null);
          setSelectedCompanions([]);
          setCompanionStatuses({});
          setOriginalTripDates(null);
          // Si no es ascentToEdit pero setSelectedLatLng ya se configuró (ej. click en mapa), no lo borramos.
          setEditingExpRecordId(null);
          if (item?.itemType !== 'experience') {
            setSelectedLatLng(null);
            setLocationName("");
          }
          setClimbDate(null);
          setClimbEndDate(null);
          setIsEndDateEnabled(false);
          setOriginalAchievedOn(null);
          setIsDateUnknown(true);
          setIsDateModified(false);
          setNotes("");
          setLink("");
          setLinkName("");
          setLink2("");
          setLinkName2("");
          setShowSecondLink(false);
          // locationName is already set by handleMapClickForExp if coming from there
        }
        setFiles([]);
        setDeletedRecordPhotoIds([]);
      }
      setNotice("");
    },
    [session, selected],
  );

  const openPeakRecord = useCallback(
    (peak: Peak) => {
      openRecord(peakToItem(peak));
    },
    [openRecord],
  );

  const openCountryRecord = useCallback(
    (country: Country) => {
      openRecord(countryToItem(country));
    },
    [openRecord],
  );

  const currentRecordSummitId = selected
    ? selected.sub_item_id
      ? `${selected.id}::${selected.sub_item_id}`
      : selected.id
    : "";

  const currentRecordDate = isDateUnknown
    ? "1900-01-01"
    : (climbDate?.toISOString().slice(0, 10) ?? new Date().toISOString().slice(0, 10));

  const existingRecordPhotos = useMemo(() => {
    if (!selected) return [];
    return photos.filter((p) => {
      const matchesSummit =
        p.summit_id === currentRecordSummitId ||
        (!selected.sub_item_id && p.summit_id === selected.id) ||
        (selected.itemType === 'experience' && selected.sub_item_id && (p.summit_id === currentRecordSummitId || p.summit_id === selected.id));
      if (!matchesSummit) return false;
      if (deletedRecordPhotoIds.includes(p.id)) return false;

      if (originalAchievedOn) {
        if (p.taken_on === originalAchievedOn) return true;
        if (currentRecordDate && currentRecordDate !== originalAchievedOn && p.taken_on === currentRecordDate) {
          return true;
        }
        return false;
      }

      return p.taken_on === currentRecordDate;
    });
  }, [photos, selected, currentRecordSummitId, deletedRecordPhotoIds, originalAchievedOn, currentRecordDate]);

  const galleryPhotosToAdd = useMemo(() => {
    return selectedPhotosForEdit
      .map((id) => photos.find((p) => p.id === id))
      .filter((p): p is SummitPhoto => !!p && !existingRecordPhotos.some((ep) => ep.id === p.id));
  }, [selectedPhotosForEdit, photos, existingRecordPhotos]);

  const totalModalPhotos =
    existingRecordPhotos.length + galleryPhotosToAdd.length + files.length;
  const isPhotoLimitReached = totalModalPhotos >= 4;

  function onFilesChanged(event: ChangeEvent<HTMLInputElement>) {
    const nextFiles = Array.from(event.target.files ?? []);


    const currentTotal =
      existingRecordPhotos.length +
      galleryPhotosToAdd.length +
      files.length;

    if (currentTotal + nextFiles.length > 4) {
      const remainingSlots = Math.max(0, 4 - currentTotal);
      setNotice(
        remainingSlots > 0
          ? `Máximo 4 fotos por registro. Solo puedes añadir ${remainingSlots} foto${remainingSlots !== 1 ? "s" : ""} más.`
          : `Máximo 4 fotos por registro. Ya has alcanzado el límite de 4 fotos.`,
      );
      event.target.value = "";
      return;
    }

    const remainingSlots = Math.max(0, 4 - currentTotal);
    const filesToAdd = nextFiles.slice(0, remainingSlots);

    setFiles((prev) => [...prev, ...filesToAdd]);
    if (!isDateUnknown && !isDateModified && filesToAdd[0]?.lastModified) {
      setClimbDate(new Date(filesToAdd[0].lastModified));
    }
  }

  async function saveWishlist() {
    if (!supabase || !session || !selected) {
      window.location.hash = "panel";
      setAuthOpen("login");
      return;
    }
    setNotice("");

    if (hasWishlist) {
      const deleteResult = await supabase
        .from("ascents")
        .delete()
        .match({
          user_id: session.user.id,
          summit_id: selected.id,
          is_wishlist: true,
        });

      if (deleteResult.error) {
        setNotice(deleteResult.error.message);
        return;
      }
      setAscents((previous) =>
        previous.filter((a) => !(a.summit_id === selected.id && a.is_wishlist)),
      );
      setNotice("Eliminado de tu lista de deseos.");
    } else {
      const hasRealAscent = ascents.some(
        (a) => a.summit_id === selected.id && !a.is_wishlist,
      );
      if (hasRealAscent) {
        setNotice("Ya has completado esta cumbre o lugar. No es necesario añadirlo a tu lista de deseos.");
        return;
      }

      const finalDate = new Date().toISOString().slice(0, 10);
      const ascentResult = await supabase.from("ascents").upsert(
        {
          user_id: session.user.id,
          summit_id: selected.id,
          achieved_on: finalDate,
          end_date: null,
          notes: null,
          is_wishlist: true,
        },
        { onConflict: "user_id,summit_id,achieved_on" },
      );

      if (ascentResult.error) {
        setNotice(ascentResult.error.message);
        return;
      }
      setAscents((previous) => [
        {
          summit_id: selected.id,
          achieved_on: finalDate,
          end_date: null,
          notes: null,
          is_wishlist: true,
        },
        ...previous.filter(
          (a) => !(a.summit_id === selected.id && a.is_wishlist),
        ),
      ]);
      setNotice("¡Añadido a tu lista de deseos!");
    }
  }

  async function saveWishlistNote() {
    if (!supabase || !session || !selected || !wishlistEntry) return;
    const trimmed = wishlistNoteText.trim() || null;
    const { error } = await supabase
      .from("ascents")
      .update({ notes: trimmed })
      .match({
        user_id: session.user.id,
        summit_id: selected.id,
        is_wishlist: true,
      });
    if (error) {
      setNotice(error.message);
      return;
    }
    setAscents((prev) =>
      prev.map((a) =>
        a.summit_id === selected.id && a.is_wishlist
          ? { ...a, notes: trimmed }
          : a,
      ),
    );
    setShowWishlistNoteEditor(false);
    setNotice(trimmed ? "Nota guardada." : "Nota eliminada.");
  }

  function renderWithClickableLinks(text: string) {
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    const parts = text.split(urlRegex);
    return parts.map((part, i) =>
      part.startsWith("http://") || part.startsWith("https://") ? (
        <a
          key={i}
          href={part}
          target="_blank"
          rel="noopener noreferrer"
          style={{ color: "#a67c29", textDecoration: "underline", wordBreak: "break-all" }}
        >
          {part}
        </a>
      ) : (
        <span key={i}>{part}</span>
      ),
    );
  }

  async function saveAscent() {
    if (!supabase || !session || !selected) return;
    const isExperience = (selected as any)?.itemType === 'experience';
    if (isExperience && (!selectedLatLng || selectedLatLng.lat === undefined)) {
      setNotice("Debes registrar la experiencia en el mapa primero.");
      return;
    }

    setSaving(true);
    setNotice("");
    const finalDate = isDateUnknown
      ? "1900-01-01"
      : (climbDate?.toISOString().slice(0, 10) ??
        new Date().toISOString().slice(0, 10));

    const expectedSummitId = selected.sub_item_id
      ? `${selected.id}::${selected.sub_item_id}`
      : selected.id;

    // If they changed the date of an existing ascent, we should delete the old one first,
    // otherwise upsert creates a new entry instead of updating the old date.
    if (originalAchievedOn && originalAchievedOn !== finalDate) {
      if (!isExperience) {
        await supabase
          .from("ascents")
          .delete()
          .match({
            user_id: session.user.id,
            summit_id: selected.id,
            achieved_on: originalAchievedOn,
          });
      }
      // Update photos date
      await supabase
        .from("summit_photos")
        .update({ taken_on: finalDate })
        .match({
          user_id: session.user.id,
          summit_id: expectedSummitId,
          taken_on: originalAchievedOn,
        });
      setPhotos((prev) =>
        prev.map((p) =>
          (p.summit_id === expectedSummitId || p.summit_id === selected.id) &&
            p.taken_on === originalAchievedOn
            ? { ...p, taken_on: finalDate }
            : p,
        ),
      );
    }

    const finalEndDate =
      isEndDateEnabled && climbEndDate
        ? climbEndDate.toISOString().slice(0, 10)
        : null;

    if (finalEndDate && finalDate && finalEndDate < finalDate) {
      setNotice("La fecha de fin no puede ser anterior a la fecha de inicio.");
      setSaving(false);
      return;
    }

    let tripGroupIdToSave = currentTripGroupId;
    if (selectedCompanions.length > 0 && !tripGroupIdToSave) {
      // 1. Reusar si la propia ascensión existente ya tiene trip_group_id
      const existingAscent = ascents.find(
        (a) =>
          a.summit_id === selected.id &&
          (a.achieved_on === finalDate || a.achieved_on === originalAchievedOn) &&
          !a.is_wishlist
      );
      if (existingAscent?.trip_group_id) {
        tripGroupIdToSave = existingAscent.trip_group_id;
      }

      // 2. Reusar si la propia experiencia existente ya tiene trip_group_id
      if (!tripGroupIdToSave && isExperience) {
        const existingExp = experienceRecords.find(
          (r) =>
            r.experience_id === selected.id &&
            (r.achieved_on === finalDate || r.achieved_on === originalAchievedOn) &&
            (!selected.sub_item_id || r.sub_item_id === selected.sub_item_id)
        );
        if (existingExp?.trip_group_id) {
          tripGroupIdToSave = existingExp.trip_group_id;
        }
      }

      // 3. Reusar si ya existe una invitación en record_companions para esta actividad y fechas
      if (!tripGroupIdToSave && supabase && session?.user?.id) {
        try {
          const { data: existingInvs } = await supabase
            .from("record_companions")
            .select("trip_group_id, start_date, end_date")
            .or(`inviter_id.eq.${session.user.id},companion_id.eq.${session.user.id}`)
            .eq("item_id", selected.id)
            .limit(10);

          if (existingInvs && existingInvs.length > 0) {
            const matchingInv = existingInvs.find((inv: any) =>
              datesOverlap(finalDate, finalEndDate, inv.start_date, inv.end_date)
            );
            if (matchingInv?.trip_group_id) {
              tripGroupIdToSave = matchingInv.trip_group_id;
            }
          }
        } catch {}
      }

      // 4. Solo generar nuevo UUID si no existe ningún grupo previo
      if (!tripGroupIdToSave) {
        tripGroupIdToSave = crypto.randomUUID();
      }
    }

    let isSeparated = false;
    if (originalTripDates && currentTripGroupId) {
      const overlaps = datesOverlap(finalDate, finalEndDate, originalTripDates.start, originalTripDates.end);
      if (!overlaps) {
        isSeparated = true;
        tripGroupIdToSave = null;
      }
    }

    let dbError = null;

    if (isExperience) {
      if (editingExpRecordId) {
        const { error } = await supabase
          .from("experience_records")
          .update({
            achieved_on: finalDate,
            notes: notes || null,
            link: link || null,
            link_name: linkName || null,
            link_2: link2 || null,
            link_name_2: linkName2 || null,
            lat: selectedLatLng?.lat,
            lng: selectedLatLng?.lng,
            location_name: locationName || null,
            trip_group_id: tripGroupIdToSave,
          })
          .eq("id", editingExpRecordId);
        dbError = error;
      } else {
        const { error } = await supabase.from("experience_records").insert({
          user_id: session.user.id,
          experience_id: selected.id,
          sub_item_id: selected.sub_item_id || null,
          achieved_on: finalDate,
          notes: notes || null,
          link: link || null,
          link_name: linkName || null,
          link_2: link2 || null,
          link_name_2: linkName2 || null,
          lat: selectedLatLng?.lat,
          lng: selectedLatLng?.lng,
          location_name: locationName || null,
          trip_group_id: tripGroupIdToSave,
        });
        dbError = error;
      }
    } else {
      const ascentResult = await supabase.from("ascents").upsert(
        {
          user_id: session.user.id,
          summit_id: selected.id,
          achieved_on: finalDate,
          end_date: finalEndDate,
          notes: notes || null,
          link: link || null,
          link_name: linkName || null,
          link_2: link2 || null,
          link_name_2: linkName2 || null,
          trip_group_id: tripGroupIdToSave,
          is_wishlist: false,
        },
        { onConflict: "user_id,summit_id,achieved_on" },
      );
      dbError = ascentResult.error;

      // Remove wishlist if they register a real ascent
      if (!dbError && hasWishlist) {
        await supabase
          .from("ascents")
          .delete()
          .match({
            user_id: session.user.id,
            summit_id: selected.id,
            is_wishlist: true,
          });
      }
    }

    if (dbError) {
      setNotice(dbError.message);
      setSaving(false);
      return;
    }

    if (isSeparated && currentTripGroupId) {
      await supabase
        .from("record_companions")
        .update({
          status: "separated",
          companion_record_id: null,
          updated_at: new Date().toISOString(),
        })
        .eq("trip_group_id", currentTripGroupId)
        .eq("companion_id", session.user.id);
    } else if (tripGroupIdToSave && selectedCompanions.length > 0) {
      for (const comp of selectedCompanions) {
        // Automatic mutual linking if companion also invited current user for overlapping dates
        const syncResult = await syncMutualTripInvitations({
          currentUserId: session.user.id,
          companionId: comp.id,
          itemId: selected.id,
          subItemId: selected.sub_item_id || null,
          startDate: finalDate,
          endDate: finalEndDate,
          currentRecordId: editingExpRecordId || null,
          currentTripGroupId: tripGroupIdToSave as string,
          recordType: isExperience ? "experience" : "ascent",
        });

        const effectiveTripGroupId: string = syncResult.resolvedTripGroupId || (tripGroupIdToSave as string);
        const effectiveStatus = syncResult.isMutual ? "accepted" : (companionStatuses[comp.id] || "pending");
        tripGroupIdToSave = effectiveTripGroupId;

        if (syncResult.isMutual && !isExperience) {
          await supabase
            .from("ascents")
            .update({ trip_group_id: effectiveTripGroupId })
            .match({
              user_id: session.user.id,
              summit_id: selected.id,
              achieved_on: finalDate,
            });
        }

        await supabase.from("record_companions").upsert({
          trip_group_id: effectiveTripGroupId,
          inviter_id: session.user.id,
          companion_id: comp.id,
          record_type: isExperience ? "experience" : "ascent",
          item_type: isPeaks ? "peaks" : isExperience ? "experience" : "countries",
          item_id: selected.id,
          sub_item_id: selected.sub_item_id || null,
          location_name: locationName || selected.title || null,
          start_date: finalDate,
          end_date: finalEndDate,
          original_start_date: finalDate,
          original_end_date: finalEndDate,
          lat: selectedLatLng?.lat || null,
          lng: selectedLatLng?.lng || null,
          status: effectiveStatus,
        }, { onConflict: "trip_group_id,companion_id" });
      }

      const selectedCompIds = selectedCompanions.map((c: any) => c.id);
      if (selectedCompIds.length > 0) {
        await supabase
          .from("record_companions")
          .delete()
          .eq("trip_group_id", tripGroupIdToSave)
          .eq("inviter_id", session.user.id)
          .not("companion_id", "in", `(${selectedCompIds.join(",")})`);
      }

      // Limpiar invitaciones duplicadas obsoletas bajo otros trip_group_ids para este mismo viaje
      if (tripGroupIdToSave && session?.user?.id) {
        await supabase
          .from("record_companions")
          .delete()
          .eq("inviter_id", session.user.id)
          .eq("item_id", selected.id)
          .eq("start_date", finalDate)
          .neq("trip_group_id", tripGroupIdToSave);
      }
    }

    const totalCountToSave =
      existingRecordPhotos.length +
      galleryPhotosToAdd.length +
      files.length;
    if (totalCountToSave > 4) {
      setNotice(
        `No puede haber más de 4 fotos en un registro (actualmente hay ${totalCountToSave}). Elimina fotos antes de guardar.`,
      );
      setSaving(false);
      return;
    }

    if (deletedRecordPhotoIds.length > 0) {
      const toDelete = photos.filter((p) =>
        deletedRecordPhotoIds.includes(p.id),
      );
      const storagePaths = toDelete
        .map((p) => p.storage_path)
        .filter(Boolean);
      if (storagePaths.length > 0) {
        await deleteStoragePhotos({ paths: storagePaths, session, supabase });
      }
      await supabase
        .from("summit_photos")
        .delete()
        .in("id", deletedRecordPhotoIds)
        .eq("user_id", session.user.id);
      setPhotos((prev) =>
        prev.filter((p) => !deletedRecordPhotoIds.includes(p.id)),
      );
      setDeletedRecordPhotoIds([]);
    }

    const availableSlots = Math.max(
      0,
      4 - (existingRecordPhotos.length + galleryPhotosToAdd.length),
    );
    const sortedFilesWithTime = await sortFilesByCaptureTime(files, finalDate);
    const filesToUpload = sortedFilesWithTime.slice(0, availableSlots);
    const uploaded: SummitPhoto[] = [];
    const uploadTasks = filesToUpload.map(async ({ file, shotAt }) => {
      if (!file.type.startsWith("image/")) return null;
      try {
        const compressedBlob = await compressImage(file);
        const uploadResult = await uploadPhotoBlob({
          blob: compressedBlob,
          fileName: file.name,
          summitId: selected.id,
          session,
          supabase,
        });
        return {
          user_id: session.user.id,
          summit_id: selected.sub_item_id
            ? `${selected.id}::${selected.sub_item_id}`
            : selected.id,
          storage_path: uploadResult.storagePath,
          public_url: uploadResult.publicUrl,
          file_size: uploadResult.fileSize,
          taken_on: finalDate,
          shot_at: shotAt,
        };
      } catch (uploadErr: any) {
        setNotice(
          `Registro guardado, pero una foto no pudo subirse: ${uploadErr.message}`,
        );
        return null;
      }
    });

    const photoRecordsToInsert = (await Promise.all(uploadTasks)).filter((item): item is NonNullable<typeof item> => Boolean(item));
    if (photoRecordsToInsert.length > 0) {
      const photoResult = await supabase
        .from("summit_photos")
        .insert(photoRecordsToInsert)
        .select();
      if (photoResult.data) {
        uploaded.push(...(photoResult.data as SummitPhoto[]));
      }
    }

    if (isExperience) {
      // Refresh experience records
      const { data } = await supabase
        .from("experience_records")
        .select("*")
        .eq("user_id", session.user.id);
      if (data) setExperienceRecords(data as ExperienceRecord[]);
    } else {
      setAscents((previous) => {
        const withoutThisAscentOrWishlist = previous.filter(
          (a) =>
            !(
              a.summit_id === selected.id &&
              (a.achieved_on === finalDate ||
                a.achieved_on === originalAchievedOn ||
                a.is_wishlist)
            ),
        );
        return [
          {
            summit_id: selected.id,
            achieved_on: finalDate,
            end_date: finalEndDate,
            notes: notes || null,
            link: link || null,
            link_name: linkName || null,
            link_2: link2 || null,
            link_name_2: linkName2 || null,
            trip_group_id: tripGroupIdToSave,
            is_wishlist: false,
          },
          ...withoutThisAscentOrWishlist,
        ];
      });
    }

    if (uploaded.length) setPhotos((previous) => sortPhotosByTime([...previous, ...uploaded]));
    if (galleryPhotosToAdd.length > 0) {
      const galleryIds = galleryPhotosToAdd.map((p) => p.id);
      await supabase
        .from("summit_photos")
        .update({
          taken_on: finalDate,
          summit_id: expectedSummitId,
        })
        .in("id", galleryIds)
        .eq("user_id", session.user.id);
      setPhotos((prev) =>
        prev.map((p) =>
          galleryIds.includes(p.id)
            ? { ...p, taken_on: finalDate, summit_id: expectedSummitId }
            : p,
        ),
      );
      setSelectedPhotosForEdit((prev) =>
        prev.filter((id) => !galleryIds.includes(id)),
      );
    }
    setFiles([]);
    setDeletedRecordPhotoIds([]);
    setSaving(false);
    setRecordOpen(false);
    setCurrentTripGroupId(tripGroupIdToSave);
    const isEdit = isExperience ? !!editingExpRecordId : !!originalAchievedOn;
    const hasPrevious = isExperience
      ? experienceRecords.some((r) => r.experience_id === selected.id)
      : ascents.some((a) => a.summit_id === selected.id && !a.is_wishlist);

    let message = "Registro guardado.";
    if (isEdit) {
      message = "Cambios guardados.";
    } else if (hasPrevious) {
      message = "Nuevo registro añadido.";
    } else {
      if (isPeaks) {
        message = "Registro guardado. ¡Un pico más en tu lista!";
      } else if (isExperience) {
        message = "Registro guardado. ¡Una experiencia más en tu lista!";
      } else {
        message = "Registro guardado. ¡Un país más en tu lista!";
      }
    }
    setNotice(message);
  }

  function deleteAscent() {
    if (!supabase || !session || !selected || !originalAchievedOn) return;

    const remainingAscents = ascents.filter(
      (a) =>
        a.summit_id === selected.id &&
        a.achieved_on !== originalAchievedOn &&
        !a.is_wishlist,
    );

    const selectedAscentsForCheck = ascents.filter(
      (a) => a.summit_id === selected.id && !a.is_wishlist,
    );
    const registeredDates = new Set(
      selectedAscentsForCheck.map((a) => a.achieved_on),
    );
    const hasOtherPhotos = photos.some(
      (p) => p.summit_id === selected.id && !registeredDates.has(p.taken_on),
    );

    const isExperience = (selected as any)?.itemType === 'experience';

    let confirmMessage = isPeaks
      ? "¿Seguro que quieres eliminar esta ascensión?"
      : isExperience
        ? "¿Seguro que quieres eliminar esta experiencia?"
        : "¿Seguro que quieres eliminar la visita a este país?";

    if (remainingAscents.length === 0 && hasOtherPhotos) {
      confirmMessage += ' Se eliminarán también las fotos de "Otras fotos".';
    }

    setConfirmConfig({
      isOpen: true,
      message: confirmMessage,
      onConfirm: performDeleteAscent,
    });
  }

  async function performDeleteAscent() {
    if (!supabase || !session || !selected || !originalAchievedOn) return;

    setSaving(true);
    setNotice("");

    const remainingAscents = ascents.filter(
      (a) =>
        a.summit_id === selected.id &&
        a.achieved_on !== originalAchievedOn &&
        !a.is_wishlist,
    );

    const isExperience = (selected as any)?.itemType === 'experience';
    let deleteError = null;

    if (isExperience && editingExpRecordId) {
      const { error } = await supabase
        .from("experience_records")
        .delete()
        .eq("id", editingExpRecordId);
      deleteError = error;
    } else {
      const deleteResult = await supabase
        .from("ascents")
        .delete()
        .match({
          user_id: session.user.id,
          summit_id: selected.id,
          achieved_on: originalAchievedOn,
        });
      deleteError = deleteResult.error;
    }

    if (deleteError) {
      setNotice(deleteError.message);
      setSaving(false);
      return;
    }

    if (remainingAscents.length === 0) {
      await supabase
        .from("summit_photos")
        .delete()
        .match({ user_id: session.user.id, summit_id: selected.id });
      setPhotos((prev) => prev.filter((p) => p.summit_id !== selected.id));
    }

    if (isExperience) {
      const { data } = await supabase
        .from("experience_records")
        .select("*")
        .eq("user_id", session.user.id);
      if (data) setExperienceRecords(data as ExperienceRecord[]);
    } else {
      setAscents((previous) =>
        previous.filter(
          (a) =>
            !(
              a.summit_id === selected.id &&
              a.achieved_on === originalAchievedOn
            ),
        ),
      );
    }

    setSaving(false);
    setRecordOpen(false);
    setCurrentTripGroupId(null);
    setNotice(
      isPeaks
        ? "Ascensión eliminada."
        : isExperience
          ? "Experiencia eliminada."
          : "País eliminado de tu lista.",
    );
  }

  async function handleSaveCustomCategory() {
    if (!editingCustomCategory || !editingCustomCategory.name?.trim()) return;
    if (!supabase || !session) return;
    setSaving(true);

    const isPredefined =
      typeof editingCustomCategory.id === "string" &&
      (predefinedCategories.some((c) => c.id === editingCustomCategory.id) ||
        (editingCustomCategory.id.startsWith("cat-") &&
          !editingCustomCategory.id.startsWith("cat-custom-")));

    if (isPredefined) {
      setNotice("Las categorías por defecto no se pueden modificar.");
      setSaving(false);
      setEditingCustomCategory(null);
      return;
    }

    if (editingCustomCategory.id === "new") {
      const newCat = {
        user_id: session.user.id,
        name: editingCustomCategory.name.trim(),
        icon_name: editingCustomCategory.icon_name || "star",
      };
      const { data, error } = await supabase
        .from("custom_experience_categories")
        .insert(newCat)
        .select()
        .single();
      if (error) setNotice(error.message);
      else if (data) {
        setCustomCategories((prev) => [...prev, data]);
        setEditingCustomCategory(null);
      }
    } else {
      const updates = {
        name: editingCustomCategory.name.trim(),
        icon_name: editingCustomCategory.icon_name || "star",
      };
      const { data, error } = await supabase
        .from("custom_experience_categories")
        .update(updates)
        .eq("id", editingCustomCategory.id)
        .select()
        .single();
      if (error) setNotice(error.message);
      else if (data) {
        setCustomCategories((prev) =>
          prev.map((c) => (c.id === data.id ? data : c)),
        );
        setEditingCustomCategory(null);
      }
    }
    setSaving(false);
  }

  function handleDeleteCustomCategory(catId?: string | React.MouseEvent) {
    const targetId =
      typeof catId === "string"
        ? catId
        : editingCustomCategory && editingCustomCategory.id !== "new"
          ? editingCustomCategory.id
          : null;
    if (!targetId) return;

    const isPredefined = predefinedCategories.some((c) => c.id === targetId);
    if (isPredefined) {
      handleHideItem(targetId, "category");
      if (editingCustomCategory && editingCustomCategory.id === targetId) {
        setEditingCustomCategory(null);
      }
      return;
    }

    setConfirmAction({
      message:
        "¿Estás seguro de que quieres eliminar esta categoría y sus experiencias asociadas?",
      onConfirm: async () => {
        if (!supabase || !session) return;
        setSaving(true);
        const { error } = await supabase
          .from("custom_experience_categories")
          .delete()
          .eq("id", targetId);
        if (error) {
          setNotice(error.message);
        } else {
          setCustomCategories((prev) => prev.filter((c) => c.id !== targetId));
          setCustomExperiences((prev) =>
            prev.filter((c) => c.category_id !== targetId),
          );
          if (editingCustomCategory && editingCustomCategory.id === targetId) {
            setEditingCustomCategory(null);
          }
        }
        setSaving(false);
      },
    });
  }

  function handleDeleteCustomExperience(expId: string) {
    setConfirmAction({
      message:
        "¿Estás seguro de que quieres eliminar esta experiencia? Se eliminarán también todos los registros asociados.",
      onConfirm: async () => {
        if (!supabase || !session) return;
        setSaving(true);
        const { error } = await supabase
          .from("custom_experiences")
          .delete()
          .eq("id", expId);
        if (error) {
          setNotice(error.message);
        } else {
          setCustomExperiences((prev) => prev.filter((ce) => ce.id !== expId));
          setEditingCustomExp(null);
        }
        setSaving(false);
      },
    });
  }
  const handleHideItem = (
    itemId: string,
    itemType: "category" | "experience",
  ) => {
    setConfirmAction({
      message:
        itemType === "category"
          ? "¿Estás seguro de que quieres eliminar esta categoría y sus experiencias asociadas?"
          : "¿Estás seguro de que quieres eliminar esta experiencia?",
      onConfirm: async () => {
        const { data, error } = await supabase!
          .from("hidden_items")
          .insert({
            user_id: session!.user.id,
            item_id: itemId,
            item_type: itemType,
          })
          .select()
          .single();
        if (!error && data) {
          setHiddenItems((prev) => [...prev, data as HiddenItem]);
        } else if (error) {
          setNotice(`Error al ocultar: ${error.message}`);
          setTimeout(() => setNotice(""), 3000);
        }
      },
    });
  };

  async function handleRestoreHiddenItem(id: string) {
    if (!supabase || !session) return;
    setSaving(true);
    const { error } = await supabase.from("hidden_items").delete().eq("id", id);
    if (error) {
      setNotice(error.message);
    } else {
      setHiddenItems((prev) => prev.filter((h) => h.id !== id));
      setNotice("Elemento restaurado.");
    }
    setSaving(false);
  }

  async function handlePermanentDelete(item: HiddenItem) {
    setConfirmAction({
      message:
        item.item_type === "category"
          ? "¿Seguro que quieres borrar TODOS tus registros y fotos de esta categoría? Esta acción no se puede deshacer."
          : "¿Seguro que quieres borrar TODOS tus registros y fotos de esta experiencia? Esta acción no se puede deshacer.",
      onConfirm: async () => {
        if (!supabase || !session) return;
        setSaving(true);
        try {
          if (item.item_type === "category") {
            const staticCat = predefinedCategories.find(
              (c) => c.id === item.item_id,
            );
            const expIds = staticCat
              ? staticCat.experiences.map((e) => e.id)
              : [];
            const customExps = customExperiences.filter(
              (c) =>
                c.category_id === item.item_id ||
                c.static_category_id === item.item_id,
            );
            expIds.push(...customExps.map((c) => c.id));

            if (expIds.length > 0) {
              await supabase
                .from("experience_records")
                .delete()
                .in("experience_id", expIds);
            }

            const customExpIds = customExps.map((c) => c.id);
            if (customExpIds.length > 0) {
              await supabase
                .from("custom_experiences")
                .delete()
                .in("id", customExpIds);
            }

            await supabase
              .from("custom_experience_categories")
              .delete()
              .eq("id", item.item_id);

            setCustomCategories((prev) =>
              prev.filter((c) => c.id !== item.item_id),
            );
            setCustomExperiences((prev) =>
              prev.filter((c) => c.category_id !== item.item_id),
            );
          } else {
            await supabase
              .from("experience_records")
              .delete()
              .eq("experience_id", item.item_id);
            await supabase
              .from("custom_experiences")
              .delete()
              .eq("id", item.item_id);
            setCustomExperiences((prev) =>
              prev.filter((c) => c.id !== item.item_id),
            );
          }

          await supabase.from("hidden_items").delete().eq("id", item.id);
          setHiddenItems((prev) => prev.filter((h) => h.id !== item.id));

          setNotice("Elemento eliminado definitivamente.");
        } catch (e: any) {
          setNotice("Error: " + e.message);
        }
        setSaving(false);
      },
    });
  }
  async function handleSaveCustomExperience() {
    if (!editingCustomExp || !editingCustomExp.name?.trim()) return;
    if (!supabase || !session) return;
    setSaving(true);

    let subItems: { id: string; name: string }[] | undefined = undefined;
    if (editingCustomExp.sub_items_input !== undefined) {
      const lines: string[] = Array.from(
        new Set(
          editingCustomExp.sub_items_input
            .split("\n")
            .map((s: string) => s.trim())
            .filter((s: string) => s.length > 0)
        )
      );
      if (lines.length > 0) {
        subItems = lines.map((line: string) => {
          const existing = (editingCustomExp.sub_items || []).find(
            (s: any) => s.name === line,
          );
          return existing
            ? existing
            : { id: `sub-${crypto.randomUUID()}`, name: line };
        });
      } else {
        subItems = [];
      }
    } else if (editingCustomExp.sub_items) {
      subItems = editingCustomExp.sub_items;
    }

    if (editingCustomExp.id === "new") {
      const rawCatId = editingCustomExp.category_id;
      // Only send category_id if it's a real UUID (not a pseudo-category like "cat-custom-..." or undefined)
      const validCategoryId = (rawCatId && typeof rawCatId === "string" && !rawCatId.startsWith("cat-")) ? rawCatId : null;
      const newExp = {
        user_id: session.user.id,
        name: editingCustomExp.name.trim(),
        category_id: validCategoryId,
        static_category_id: editingCustomExp.static_category_id || null,
        sub_items: subItems || [],
      };
      console.log("[DEBUG] handleSaveCustomExperience INSERT payload:", JSON.stringify(newExp));
      console.log("[DEBUG] editingCustomExp full object:", JSON.stringify(editingCustomExp));
      const { data, error } = await supabase
        .from("custom_experiences")
        .insert(newExp)
        .select()
        .single();
      if (error) setNotice(error.message);
      else if (data) {
        setCustomExperiences((prev) => [...prev, data]);
        setEditingCustomExp(null);
      }
    } else {
      if (typeof editingCustomExp.id === "string" && editingCustomExp.id.startsWith("exp-")) {
        setNotice("Las experiencias predefinidas no se pueden modificar.");
        setSaving(false);
        setEditingCustomExp(null);
        return;
      }
      const updates: any = { name: editingCustomExp.name.trim() };
      if (subItems !== undefined) updates.sub_items = subItems;

      const { data, error } = await supabase
        .from("custom_experiences")
        .update(updates)
        .eq("id", editingCustomExp.id)
        .select()
        .single();
      if (error) setNotice(error.message);
      else if (data) {
        setCustomExperiences((prev) =>
          prev.map((c) => (c.id === data.id ? data : c)),
        );
        setEditingCustomExp(null);
        setExpSelectorOpen(true);
      }
    }
    setSaving(false);
  }

  async function handleCreateCustomExperience() {
    if (!customExpName.trim()) return;
    if (!supabase || !session) return;
    setSaving(true);

    // In local UI we just generate a random UUID so we can optimistic update, or let DB do it
    const newExp = {
      user_id: session.user.id,
      name: customExpName.trim(),
      icon_name: customExpIcon,
    };

    const { data, error } = await supabase
      .from("custom_experiences")
      .insert(newExp)
      .select()
      .single();
    if (error) {
      setNotice(error.message);
    } else if (data) {
      setCustomExperiences((prev) => [...prev, data]);
      setCreatingCustomExp(false);
      setCustomExpName("");
    }
    setSaving(false);
  }

  function deletePhoto(photo: SummitPhoto) {
    if (!supabase || !session) return;

    setConfirmConfig({
      isOpen: true,
      message: "¿Seguro que quieres eliminar esta foto?",
      onConfirm: () => performDeletePhoto(photo),
    });
  }

  async function performDeletePhoto(photo: SummitPhoto) {
    if (!supabase || !session) return;
    setSaving(true);
    setNotice("Eliminando foto...");

    await deleteStoragePhotos({
      paths: [photo.storage_path],
      session,
      supabase,
    });

    const { error: dbError } = await supabase
      .from("summit_photos")
      .delete()
      .eq("id", photo.id);
    if (dbError) {
      setNotice(dbError.message);
      setSaving(false);
      return;
    }

    setPhotos((previous) => previous.filter((p) => p.id !== photo.id));
    setLightboxPhoto(null);
    if (typeof window !== "undefined" && window.location.hash === "#lightbox") {
      window.history.back();
    }
    setSaving(false);
    setNotice("Foto eliminada correctamente.");
  }

  function handleBatchDeletePhotos() {
    if (!supabase || !session || selectedPhotosForEdit.length === 0) return;

    setConfirmConfig({
      isOpen: true,
      message: `¿Seguro que quieres eliminar ${selectedPhotosForEdit.length === 1 ? "1 foto" : `${selectedPhotosForEdit.length} fotos`}?`,
      onConfirm: () => performBatchDeletePhotos(),
    });
  }

  async function performBatchDeletePhotos() {
    if (!supabase || !session) return;
    setSaving(true);
    setNotice("Eliminando fotos...");

    const photosToDelete = photos.filter((p) =>
      selectedPhotosForEdit.includes(p.id),
    );
    const storagePaths = photosToDelete.map((p) => p.storage_path);

    await deleteStoragePhotos({
      paths: storagePaths,
      session,
      supabase,
    });

    const { error: dbError } = await supabase
      .from("summit_photos")
      .delete()
      .in("id", selectedPhotosForEdit);
    if (dbError) {
      setNotice(dbError.message);
      setSaving(false);
      return;
    }

    setPhotos((previous) =>
      previous.filter((p) => !selectedPhotosForEdit.includes(p.id)),
    );
    setSelectedPhotosForEdit([]);
    setSaving(false);
    setNotice("Fotos eliminadas correctamente.");
  }

  async function handleAssignPhotosToRecord(targetDate: string) {
    if (!session || selectedPhotosForEdit.length === 0 || !selected) return;

    const expectedSummitId = selected.sub_item_id
      ? `${selected.id}::${selected.sub_item_id}`
      : selected.id;

    const existingPhotosCount = photos.filter(
      (p) =>
        (p.summit_id === expectedSummitId || p.summit_id === selected?.id) &&
        p.taken_on === targetDate &&
        !selectedPhotosForEdit.includes(p.id),
    ).length;
    if (existingPhotosCount + selectedPhotosForEdit.length > 4) {
      setNotice(
        `No puede haber más de 4 fotos en total en un solo registro (este registro ya tiene ${existingPhotosCount}).`,
      );
      setTimeout(() => setNotice(""), 4000);
      return;
    }

    setSaving(true);
    setNotice("Asignando fotos al registro...");

    const { error } = await supabase!
      .from("summit_photos")
      .update({ taken_on: targetDate, summit_id: expectedSummitId })
      .in("id", selectedPhotosForEdit)
      .eq("user_id", session.user.id);

    if (error) {
      setNotice(`Error: ${error.message}`);
    } else {
      setPhotos((prev) =>
        prev.map((p) =>
          selectedPhotosForEdit.includes(p.id)
            ? { ...p, taken_on: targetDate, summit_id: expectedSummitId }
            : p,
        ),
      );
      setNotice(`Fotos asignadas al registro del ${formatDate(targetDate)}.`);
      setAssignToRecordModalOpen(false);
      setSelectedPhotosForEdit([]);
    }
    setSaving(false);
  }

  async function handleChangeDate() {
    if (!lightboxPhoto || !lightboxNewDate || !supabase || !session) return;
    const targetPhotosCount = photos.filter(
      (p) =>
        p.summit_id === lightboxPhoto.summit_id &&
        p.taken_on === lightboxNewDate &&
        p.id !== lightboxPhoto.id,
    ).length;
    if (targetPhotosCount >= 4) {
      setNotice("La fecha seleccionada ya tiene el máximo de 4 fotos.");
      setTimeout(() => setNotice(""), 4000);
      return;
    }
    setSaving(true);
    const { error } = await supabase
      .from("summit_photos")
      .update({ taken_on: lightboxNewDate })
      .eq("id", lightboxPhoto.id);
    if (!error) {
      setPhotos((prev) =>
        prev.map((p) =>
          p.id === lightboxPhoto.id ? { ...p, taken_on: lightboxNewDate } : p,
        ),
      );
      setLightboxPhoto((prev) =>
        prev ? { ...prev, taken_on: lightboxNewDate } : null,
      );
      setNotice("Fecha cambiada correctamente.");
    } else {
      setNotice("Error al cambiar la fecha.");
    }
    setTimeout(() => setNotice(""), 3000);
    setLightboxDateModalOpen(false);
    setSaving(false);
  }

  async function handleSaveEditedPhoto(blob: Blob) {
    if (!editorPhoto || !supabase || !session) return;

    // Close editor immediately for fluid UX
    window.history.back();

    const tempUrl = URL.createObjectURL(blob);
    // Optimistically update UI
    setPhotos((prev) =>
      prev.map((p) =>
        p.id === editorPhoto.id ? { ...p, public_url: tempUrl } : p,
      ),
    );
    if (lightboxPhoto?.id === editorPhoto.id) {
      setLightboxPhoto((prev) =>
        prev ? { ...prev, public_url: tempUrl } : null,
      );
    }

    setSaving(true);
    let uploadResult;
    try {
      uploadResult = await uploadPhotoBlob({
        blob,
        fileName: `${Date.now()}.jpg`,
        summitId: selected?.id || "editor",
        session,
        supabase,
      });
    } catch (uploadErr: any) {
      setSaving(false);
      setNotice(uploadErr.message || "Error al subir la imagen editada.");
      setTimeout(() => setNotice(""), 3000);
      return;
    }

    const { error: dbError } = await supabase
      .from("summit_photos")
      .update({
        storage_path: uploadResult.storagePath,
        public_url: uploadResult.publicUrl,
        file_size: uploadResult.fileSize,
      })
      .eq("id", editorPhoto.id);

    if (!dbError) {
      await deleteStoragePhotos({
        paths: [editorPhoto.storage_path],
        session,
        supabase,
      });
      setPhotos((prev) =>
        prev.map((p) =>
          p.id === editorPhoto.id
            ? {
                ...p,
                storage_path: uploadResult.storagePath,
                public_url: uploadResult.publicUrl,
                file_size: uploadResult.fileSize,
              }
            : p,
        ),
      );
      setLightboxPhoto((prev) =>
        prev && prev.id === editorPhoto.id
          ? {
              ...prev,
              storage_path: uploadResult.storagePath,
              public_url: uploadResult.publicUrl,
              file_size: uploadResult.fileSize,
            }
          : prev,
      );
      setNotice("Foto editada correctamente.");
    } else {
      setNotice("Error al actualizar la base de datos.");
    }
    setTimeout(() => setNotice(""), 3000);
    setEditorPhoto(null);
    setSaving(false);
  }

  async function signOut() {
    await supabase?.auth.signOut();
    setSelectedPeak(null);
    setSelectedCountry(null);
    setSelectedExperience(null);
  }

  const closePanel = useCallback(() => {
    isClosingPanelRef.current = true;
    if (typeof document !== "undefined") {
      document.querySelectorAll(".leaflet-tooltip").forEach((el) => {
        el.parentElement?.removeChild(el);
      });
    }
    setSelected(null);
    setSelectedPeak(null);
    setSelectedCountry(null);
    setSelectedExperience(null);
    setRecordOpen(false);
    setProfileOpen(false);
    setAuthOpen(false);
    setPanelIdToOpen(null);
    setEditingExpRecordId(null);
    setSelectedLatLng(null);
    setFiles([]);
    setDeletedRecordPhotoIds([]);
    const fromStats = panelOpenedFromStatsRef.current;
    const wasPushed = panelPushedRef.current;
    panelPushedRef.current = false;
    panelOpenedFromStatsRef.current = false;
    recordOpenedFromPanelRef.current = false;
    if (fromStats) {
      window.history.back();
    } else if (wasPushed) {
      if (typeof window !== "undefined" && window.location.hash.startsWith("#panel")) {
        window.history.back();
      }
    } else if (typeof window !== "undefined" && window.location.hash) {
      window.history.replaceState(
        null,
        "",
        window.location.pathname + window.location.search,
      );
    }
    setTimeout(() => {
      isClosingPanelRef.current = false;
    }, 400);
  }, [setSelected]);

  const handleCloseRecord = useCallback(() => {
    setFiles([]);
    setDeletedRecordPhotoIds([]);
    setEditingExpRecordId(null);
    if (recordOpenedFromPanelRef.current) {
      setRecordOpen(false);
    } else {
      closePanel();
    }
  }, [closePanel]);

  const handleToggleExperiences = useCallback(() => {
    if (experiencesMode) {
      // Deactivating experiences mode: close open experience record/panel if active
      const isSelectedExperience =
        Boolean(
          selected &&
          ((selected as any).itemType === "experience" ||
            selected.id.startsWith("exp-") ||
            predefinedCategories.some((cat) =>
              cat.experiences.some((exp) => exp.id === selected.id),
            ) ||
            customExperiences.some((exp) => exp.id === selected.id))
        ) ||
        (typeof window !== "undefined" &&
          window.location.hash.startsWith("#panel=") &&
          (() => {
            const rawId = decodeURIComponent(
              window.location.hash.substring(7),
            ).split("::")[0];
            return (
              rawId.startsWith("exp-") ||
              predefinedCategories.some((cat) =>
                cat.experiences.some((exp) => exp.id === rawId),
              ) ||
              customExperiences.some((exp) => exp.id === rawId)
            );
          })());

      if (isSelectedExperience) {
        closePanel();
      }
      if (selectingLocationForExp) {
        setSelectingLocationForExp(null);
      }
      setSelectingCategoryForNewExp(false);
      setExpSelectorOpen(false);
      setIsEditingExperiences(false);
      setIconDropdownOpen(false);
      setExperiencesMode(false);
      onToggleExperiences?.(false);
    } else {
      if (!canShowCountries) return;
      if (isPeaks) setCurrentMode("countries");
      setExperiencesMode(true);
      onToggleExperiences?.(true);
    }
  }, [
    canShowCountries,
    experiencesMode,
    isPeaks,
    selected,
    customExperiences,
    closePanel,
    selectingLocationForExp,
    onToggleExperiences,
  ]);

  function switchMode(target: ChallengeMode) {
    if (target === currentMode) return;
    if (target === "peaks" && !canShowPeaks) return;
    if (target === "countries" && !canShowCountries) return;

    // Clear modals explicitly without using history.back()
    // to prevent race conditions with navigation.
    setRecordOpen(false);
    setProfileOpen(false);
    setAuthOpen(false);
    setPanelIdToOpen(null);
    panelPushedRef.current = false;
    recordOpenedFromPanelRef.current = false;

    setCurrentMode(target);
    if (typeof window !== "undefined") {
      localStorage.setItem("last_active_mode", target);
      localStorage.setItem("last_map_path", target === "peaks" ? "/picos" : "/");
    }

    if (onSwitchMode) {
      onSwitchMode(target);
      if (window.location.hash.startsWith("#panel")) {
        window.history.replaceState(
          null,
          "",
          window.location.pathname + window.location.search,
        );
      }
    } else {
      window.history.replaceState(null, "", target === "peaks" ? "/picos" : "/");
    }
  }

  // Touch swipe gesture (Twitter/X style) to switch between 47 Picos and 196 Países
  const swipeStartXRef = useRef<number | null>(null);
  const swipeStartYRef = useRef<number | null>(null);

  const handleSwipeTouchStart = useCallback((e: React.TouchEvent) => {
    if (!isActive) return;
    if (e.touches.length === 1) {
      swipeStartXRef.current = e.touches[0].clientX;
      swipeStartYRef.current = e.touches[0].clientY;
    }
  }, [isActive]);

  const handleSwipeTouchEnd = useCallback((e: React.TouchEvent) => {
    if (!isActive) return;
    if (swipeStartXRef.current === null || swipeStartYRef.current === null) return;
    const endX = e.changedTouches[0].clientX;
    const endY = e.changedTouches[0].clientY;
    const diffX = endX - swipeStartXRef.current;
    const diffY = endY - swipeStartYRef.current;

    // Minimum swipe distance 50px, predominantly horizontal, max 35px vertical deviation
    if (Math.abs(diffX) >= 50 && Math.abs(diffY) <= 35 && Math.abs(diffX) >= Math.abs(diffY) * 2.0) {
      if (diffX < 0) {
        // Swipe left -> go to 196 Países
        if (isPeaks && canShowCountries) {
          switchMode("countries");
        }
      } else {
        // Swipe right -> go to 47 Picos
        if (!isPeaks && canShowPeaks) {
          switchMode("peaks");
        }
      }
    }
    swipeStartXRef.current = null;
    swipeStartYRef.current = null;
  }, [isActive, isPeaks, canShowPeaks, canShowCountries]);

  useEffect(() => {
    if (!isActive) return;

    const handleGlobalTouchStart = (e: TouchEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        document.body.classList.contains("lightbox-open") ||
        document.querySelector(".lightbox-backdrop") ||
        target?.closest('.lightbox-backdrop, .lightbox-stage, .leaflet-container, input, textarea, select, .info-panel, .record-dialog, .auth-dialog, button, a')
      ) {
        return;
      }
      if (e.touches.length === 1) {
        swipeStartXRef.current = e.touches[0].clientX;
        swipeStartYRef.current = e.touches[0].clientY;
      }
    };

    const handleGlobalTouchEnd = (e: TouchEvent) => {
      if (
        document.body.classList.contains("lightbox-open") ||
        document.querySelector(".lightbox-backdrop")
      ) {
        swipeStartXRef.current = null;
        swipeStartYRef.current = null;
        return;
      }
      if (swipeStartXRef.current === null || swipeStartYRef.current === null) return;
      const endX = e.changedTouches[0].clientX;
      const endY = e.changedTouches[0].clientY;
      const diffX = endX - swipeStartXRef.current;
      const diffY = endY - swipeStartYRef.current;

      if (Math.abs(diffX) >= 50 && Math.abs(diffY) <= 35 && Math.abs(diffX) >= Math.abs(diffY) * 2.0) {
        if (diffX < 0) {
          if (isPeaks && canShowCountries) switchMode("countries");
        } else {
          if (!isPeaks && canShowPeaks) switchMode("peaks");
        }
      }
      swipeStartXRef.current = null;
      swipeStartYRef.current = null;
    };

    window.addEventListener("touchstart", handleGlobalTouchStart, { passive: true });
    window.addEventListener("touchend", handleGlobalTouchEnd, { passive: true });
    return () => {
      window.removeEventListener("touchstart", handleGlobalTouchStart);
      window.removeEventListener("touchend", handleGlobalTouchEnd);
    };
  }, [isActive, isPeaks, canShowPeaks, canShowCountries]);

  const scrollToMap = useCallback((e?: React.MouseEvent) => {
    if (e) {
      e.preventDefault();
    }
    const mapaEl = document.getElementById("mapa");
    if (mapaEl) {
      const topbar = document.querySelector(".topbar") as HTMLElement | null;
      const topbarHeight = topbar ? topbar.getBoundingClientRect().height : 76;
      const mapaTop = mapaEl.getBoundingClientRect().top + window.scrollY;
      window.scrollTo({
        top: Math.max(0, Math.round(mapaTop - topbarHeight - 6)),
        behavior: "smooth",
      });
    }
    if (window.location.hash !== "#mapa") {
      window.history.replaceState(null, "", "#mapa");
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const checkMapHash = () => {
      if (window.location.hash === "#mapa") {
        setTimeout(() => {
          scrollToMap();
        }, 150);
      }
    };
    window.addEventListener("hashchange", checkMapHash);
    return () => window.removeEventListener("hashchange", checkMapHash);
  }, [scrollToMap]);

  // Sorted items for the list
  const sortedItems = useMemo(() => {
    if (isPeaks) {
      return [...allItems].sort(
        (a, b) => parseInt(b.subtitle) - parseInt(a.subtitle),
      ); // Fallback if we sort by altitude
    }
    if (isExp) {
      return allItems; // Ya están en orden de categoría
    }
    return [...allItems].sort((a, b) => a.title.localeCompare(b.title, "es"));
  }, [allItems, isPeaks, isExp]);

  const renderExpRecord = (ascent: any) => {
    if (!selected) return null;
    const expectedSummitId = ascent.sub_item_id
      ? `${selected.id}::${ascent.sub_item_id}`
      : selected.id;
    const ascentPhotos = sortPhotosByTime(
      selectedPhotos.filter(
        (p) =>
          p.taken_on === ascent.achieved_on &&
          (p.summit_id === expectedSummitId || p.summit_id === selected.id),
      ),
    );
    return (
      <div key={ascent.id} className="completed-card">
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            gap: "8px",
          }}
        >
          <b style={{ marginTop: "6px" }}>{formatDate(ascent.achieved_on)}</b>

          {!isReadOnly && (
            <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
              <button
                title="Compartir registro"
                className="button button--quiet button--small"
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: "32px",
                  height: "32px",
                  flexShrink: 0,
                  padding: 0,
                  margin: 0,
                }}
                onClick={() =>
                  handleShareRecord(selected, ascent, ascentPhotos)
                }
              >
                <IconShare style={{ width: 14, height: 14 }} strokeWidth={1.5} />
              </button>
              <button
                title="Editar registro"
                className="button button--quiet button--small"
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: "32px",
                  height: "32px",
                  flexShrink: 0,
                  padding: 0,
                  margin: 0,
                }}
                onClick={() =>
                  openRecord(
                    { ...selected, sub_item_id: ascent.sub_item_id },
                    ascent,
                  )
                }
              >
                <IconEdit style={{ width: 14, height: 14 }} strokeWidth={1.5} />
              </button>
              <label
                title="Añadir fotos a esta fecha"
                className="button button--quiet button--small"
                onClick={(e) => {
                  if (ascentPhotos.length >= 4) {
                    e.preventDefault();
                    setNotice(
                      "Máximo 4 fotos por registro. Ya has alcanzado el límite.",
                    );
                    setTimeout(() => setNotice(""), 4000);
                  }
                }}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: "32px",
                  height: "32px",
                  flexShrink: 0,
                  padding: 0,
                  margin: 0,
                  cursor: ascentPhotos.length >= 4 ? "not-allowed" : "pointer",
                  opacity: ascentPhotos.length >= 4 ? 0.5 : 1,
                }}
              >
                <IconCamera
                  style={{ width: 14, height: 14 }}
                  strokeWidth={1.5}
                />
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={(e) => handleAddPhotosToDate(e, ascent as any)}
                  style={{ display: "none" }}
                  disabled={ascentPhotos.length >= 4}
                />
              </label>
            </div>
          )}
        </div>
        {ascent.location_name && (
          <div
            style={{
              marginTop: "8px",
              fontSize: "13px",
              fontWeight: 500,
              display: "flex",
              alignItems: "flex-start",
              gap: 4,
            }}
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{ width: 14, height: 14, flexShrink: 0, marginTop: 2 }}
            >
              <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
              <circle cx="12" cy="10" r="3" />
            </svg>
            {ascent.location_name}
          </div>
        )}
        {ascent.notes && (
          <p className="record-notes user-written-text" style={{ marginTop: "4px", marginBottom: 0 }}>&ldquo;{ascent.notes}&rdquo;</p>
        )}
        {(ascent.link || (ascent as any).link_2) && (
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: 8,
              marginTop: Boolean(ascent.notes) ? 4 : 8,
            }}
          >
            {renderRecordLink(ascent.link, (ascent as any).link_name)}
            {renderRecordLink((ascent as any).link_2, (ascent as any).link_name_2)}
          </div>
        )}

        {(() => {
          const tripGrpId = (ascent as any).trip_group_id;
          const tripComps = tripGrpId ? tripCompanionsMap[tripGrpId] : null;
          if (!tripComps || tripComps.length === 0) return null;
          const filteredComps = tripComps.filter((c: any) => {
            if (c.id === targetId) return false;
            if (c.is_public !== false) return true;
            if (session?.user?.id === c.id) return true;
            if (userFollowingSet.has(c.id)) return true;
            return false;
          });
          if (filteredComps.length === 0) return null;

          return (
            <div style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
              <span style={{ fontSize: "11px", color: "var(--muted)", fontWeight: 600 }}>
                {filteredComps.length === 1 ? "Compañero de experiencia:" : "Compañeros de experiencia:"}
              </span>
              <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                {filteredComps.map((comp: any) => (
                  <Link
                    key={comp.id}
                    href={`/perfil/${comp.username}`}
                    title={`@${comp.username}`}
                    style={{ textDecoration: "none" }}
                  >
                    <div
                      style={{
                        width: 22,
                        height: 22,
                        borderRadius: "50%",
                        backgroundColor: "var(--pine)",
                        color: "#fff",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: 10,
                        fontWeight: "bold",
                        overflow: "hidden",
                        border: "1.5px solid var(--card-bg, #fff)",
                        boxShadow: "0 1px 2px rgba(0,0,0,0.1)",
                      }}
                    >
                      {comp.avatar_url ? (
                        <img src={comp.avatar_url} alt={comp.username} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                      ) : (
                        comp.username.charAt(0).toUpperCase()
                      )}
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          );
        })()}

        {ascentPhotos.length > 0 && (
          <div className="photo-section" style={{ marginTop: 16 }}>
            <div className="photo-grid">
              {ascentPhotos.map((photo) => {
                const publicUrl =
                  photo.public_url ||
                  supabase?.storage
                    .from("summit-photos")
                    .getPublicUrl(photo.storage_path).data.publicUrl;
                if (!publicUrl) return null;
                return (
                  <figure
                    key={photo.id}
                    onClick={() => handlePhotoClick(photo)}
                  >
                    <img
                      src={publicUrl}
                      alt="Foto de la experiencia"
                      loading="eager"
                      decoding="async"
                    />
                    {photo.caption && (
                      <figcaption>
                        {photo.caption}
                      </figcaption>
                    )}
                  </figure>
                );
              })}
            </div>
          </div>
        )}
      </div>
    );
  };

  const expToggleSort = (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        background: "rgba(92, 155, 125, 0.1)",
        borderRadius: "20px",
        padding: "3px",
        position: "relative",
        marginBottom: "16px",
        cursor: "pointer",
        userSelect: "none",
        width: "fit-content",
      }}
      onClick={() => setAscentsSortOrder((o) => (o === "asc" ? "desc" : "asc"))}
    >
      <div
        style={{
          position: "absolute",
          top: 3,
          bottom: 3,
          left: ascentsSortOrder === "asc" ? 3 : "50%",
          right: ascentsSortOrder === "asc" ? "50%" : 3,
          background: "var(--pine)",
          borderRadius: "18px",
          transition: "all 0.2s cubic-bezier(0.4, 0, 0.2, 1)",
        }}
      />
      <span
        style={{
          position: "relative",
          zIndex: 1,
          padding: "4px 12px",
          fontSize: "12px",
          fontWeight: 600,
          color: ascentsSortOrder === "asc" ? "white" : "var(--pine)",
          transition: "color 0.2s ease",
          flex: 1,
          whiteSpace: "nowrap",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        Más antiguo
      </span>
      <span
        style={{
          position: "relative",
          zIndex: 1,
          padding: "4px 12px",
          fontSize: "12px",
          fontWeight: 600,
          color: ascentsSortOrder === "desc" ? "white" : "var(--pine)",
          transition: "color 0.2s ease",
          flex: 1,
          whiteSpace: "nowrap",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        Más reciente
      </span>
    </div>
  );

  /* ── Render ───────────────────────────── */
  return (
    <main
      className={`${isPeaks ? "" : (isExp && session) ? "mode-experiences" : "mode-countries"} ${activeSelected ? "panel-open" : ""}`}
    >
      {/* ── Topbar ──────────────────────── */}
      <header className="topbar">
        {isReadOnly ? (
          <Link
            className="brand"
            href={isPeaks ? "/picos" : "/"}
            onClick={(e) => {
              if (onNavigate) {
                e.preventDefault();
                onNavigate(isPeaks ? "/picos" : "/");
              }
            }}
          >
            <IconLogo className="brand-icon" />
            <span>
              <b>{appBrandName}</b>
            </span>
          </Link>
        ) : (
          <a
            className="brand"
            href={isPeaks ? "#inicio" : "#inicio"}
            onClick={(e) => {
              if (onNavigate) {
                e.preventDefault();
                onNavigate(isPeaks ? "/picos" : "/");
                return;
              }
              e.preventDefault();
              window.scrollTo({ top: 0, behavior: "smooth" });
              if (window.location.hash) {
                window.history.replaceState(
                  null,
                  "",
                  window.location.pathname + window.location.search,
                );
              }
            }}
          >
            <IconLogo className="brand-icon" />
            <span>
              <b>{appBrandName}</b>
            </span>
          </a>
        )}

        {hasBothModes && (
          <div className={`app-mode-switch ${isPeaks ? "app-mode-switch--peaks" : "app-mode-switch--countries"}`}>
            <div className="app-mode-switch__indicator" />
            <button
              className={`app-mode-btn ${isPeaks ? "active" : ""}`}
              onClick={() => switchMode("peaks")}
            >
              47 Picos
            </button>
            <button
              className={`app-mode-btn ${!isPeaks ? "active" : ""}`}
              onClick={() => switchMode("countries")}
            >
              196 Países
            </button>
          </div>
        )}

        <nav>
          {isReadOnly ? (
            <>
              <Link
                href="/"
                prefetch={true}
                className={`topbar-nav-link topbar-nav-link--mapa ${!fromTab || fromTab === "mapa" ? "topbar-nav-link--active" : ""}`}
                onClick={(e) => {
                  if (onNavigate) {
                    e.preventDefault();
                    onNavigate("/");
                  }
                }}
              >
                Mapa
              </Link>
              <Link
                href={isPeaks ? "/social?challenge=peaks" : experiencesMode ? "/social?challenge=countries&view=experiences" : "/social?challenge=countries"}
                prefetch={true}
                className={`topbar-nav-link topbar-nav-link--social ${fromTab === "social" ? "topbar-nav-link--active" : ""}`}
                style={{ position: "relative" }}
                onClick={(e) => {
                  if (onNavigate) {
                    e.preventDefault();
                    onNavigate(isPeaks ? "/social?challenge=peaks" : experiencesMode ? "/social?challenge=countries&view=experiences" : "/social?challenge=countries");
                  }
                }}
              >
                Social
                {hasPendingRequests ? (
                  <span
                    style={{
                      position: "absolute",
                      top: "-2px",
                      right: "-6px",
                      width: "8px",
                      height: "8px",
                      backgroundColor: "red",
                      borderRadius: "50%",
                    }}
                  />
                ) : null}
              </Link>
              <Link
                href={`/ranking?challenge=${isPeaks ? "peaks" : "countries"}`}
                prefetch={true}
                className={`topbar-nav-link topbar-nav-link--ranking ${fromTab === "ranking" ? "topbar-nav-link--active" : ""}`}
                onClick={(e) => {
                  if (onNavigate) {
                    e.preventDefault();
                    onNavigate(`/ranking?challenge=${isPeaks ? "peaks" : "countries"}`);
                  }
                }}
              >
                Ranking
              </Link>
            </>
          ) : (
            <>
              <a
                href="#mapa"
                className="topbar-nav-link topbar-nav-link--mapa topbar-nav-link--active"
                onClick={(e) => {
                  scrollToMap(e);
                }}
              >
                Mapa
              </a>
              <Link
                href={isPeaks ? "/social?challenge=peaks" : experiencesMode ? "/social?challenge=countries&view=experiences" : "/social?challenge=countries"}
                prefetch={true}
                className="topbar-nav-link topbar-nav-link--social"
                style={{ position: "relative" }}
                onClick={(e) => {
                  if (onNavigate) {
                    e.preventDefault();
                    onNavigate(isPeaks ? "/social?challenge=peaks" : experiencesMode ? "/social?challenge=countries&view=experiences" : "/social?challenge=countries");
                  }
                }}
              >
                Social
                {hasPendingRequests ? (
                  <span
                    style={{
                      position: "absolute",
                      top: "-2px",
                      right: "-6px",
                      width: "8px",
                      height: "8px",
                      backgroundColor: "red",
                      borderRadius: "50%",
                    }}
                  />
                ) : null}
              </Link>
              <Link
                href={`/ranking?challenge=${isPeaks ? "peaks" : "countries"}`}
                prefetch={true}
                className="topbar-nav-link topbar-nav-link--ranking"
                onClick={(e) => {
                  if (onNavigate) {
                    e.preventDefault();
                    onNavigate(`/ranking?challenge=${isPeaks ? "peaks" : "countries"}`);
                  }
                }}
              >
                Ranking
              </Link>
            </>
          )}

          {/* Mobile-only Stats button (a la izquierda de la foto de perfil) */}
          {(myProfile || session) && (
            <button
              type="button"
              className="topbar-stats-btn"
              aria-label={targetProfile ? `Estadísticas de @${targetProfile.username}` : "Mis Estadísticas"}
              title={targetProfile ? `Estadísticas de @${targetProfile.username}` : "Mis Estadísticas"}
              onClick={() => {
                window.location.hash = "estadisticas";
                setStatsOpen(true);
              }}
            >
              <ChartNoAxesColumn size={20} />
            </button>
          )}

          {(myProfile || session) ? (
            <button
              className="account-button"
              aria-label="Mi Perfil"
              title="Mi Perfil"
              onClick={() => {
                window.location.hash = "panel";
                setProfileOpen(true);
              }}
            >
              {myProfile?.avatar_url ? (
                <img
                  src={myProfile.avatar_url}
                  alt="Mi Perfil"
                  className="account-avatar"
                  style={{ objectFit: "cover" }}
                />
              ) : (
                <span className="account-avatar">
                  {myProfile?.username?.slice(0, 1).toUpperCase() || "?"}
                </span>
              )}
            </button>
          ) : !mounted ? (
            <div className="account-button-placeholder" style={{ width: 38, height: 38, borderRadius: "50%" }} />
          ) : (
            <button
              className="button button--outline"
              onClick={() => {
                window.location.hash = "panel";
                setAuthOpen("login");
              }}
            >
              Entrar
            </button>
          )}
        </nav>
      </header>

      {/* ── Hero ────────────────────────── */}
      <section
        id="inicio"
        className="hero"
        onTouchStart={handleSwipeTouchStart}
        onTouchEnd={handleSwipeTouchEnd}
      >
        {!targetProfile && canInstallMobile && (
          <button
            type="button"
            className="hero-install-btn"
            onClick={handleHeroInstallClick}
            onTouchStart={(e) => e.stopPropagation()}
            onTouchEnd={(e) => e.stopPropagation()}
            aria-label="Instalar app"
            title="Instalar aplicación"
          >
            <Download size={17} strokeWidth={2.2} />
          </button>
        )}
        <div
          className={`hero-main ${!targetProfile
              ? "hero-main--motto"
              : targetProfile && session?.user?.id !== targetProfile.id
                ? "hero-main--with-follow"
                : ""
            }`}
        >
          <div className={`hero-title-wrap ${!targetProfile ? "hero-title-wrap--motto hide-on-mobile" : "hero-title-wrap--user"}`}>
            <h1 className={targetProfile ? "hero-title--user" : undefined}>
              {targetProfile ? (
                <>
                  El mapa de <br />
                  <em>@{targetProfile.username}</em>
                </>
              ) : isPeaks ? (
                <>
                  Sube alto.
                  <br />
                  <em>Déjalo escrito.</em>
                </>
              ) : experiencesMode ? (
                <>
                  Vive experiencias.
                  <br />
                  <em>Márcalo en tu mapa.</em>
                </>
              ) : (
                <>
                  Explora el mundo.
                  <br />
                  <em>Márcalo en tu mapa.</em>
                </>
              )}
            </h1>
          </div>

          {targetProfile && session?.user?.id !== targetProfile.id && (
            <div
              className={`hero-target-follow-center ${justFollowed ? "hero-target-follow-center--just-followed" : ""
                } ${touchUnfollowActive ? "hero-target-follow-center--touch-unfollow" : ""}`}
              onMouseLeave={() => setJustFollowed(false)}
              onTouchStart={() => {
                if (justFollowed) {
                  setJustFollowed(false);
                }
                if (targetConnStatus === "accepted") {
                  if (touchHoldTimerRef.current) clearTimeout(touchHoldTimerRef.current);
                  touchHoldTimerRef.current = setTimeout(() => {
                    setTouchUnfollowActive(true);
                  }, 120);
                }
              }}
              onTouchEnd={() => {
                if (touchHoldTimerRef.current) {
                  clearTimeout(touchHoldTimerRef.current);
                  touchHoldTimerRef.current = null;
                }
                setTouchUnfollowActive(false);
                if (justFollowed) {
                  if (justFollowedTimerRef.current) clearTimeout(justFollowedTimerRef.current);
                  justFollowedTimerRef.current = setTimeout(() => {
                    setJustFollowed(false);
                  }, 800);
                }
              }}
              onTouchCancel={() => {
                if (touchHoldTimerRef.current) {
                  clearTimeout(touchHoldTimerRef.current);
                  touchHoldTimerRef.current = null;
                }
                setTouchUnfollowActive(false);
              }}
            >
              <button
                type="button"
                className={`hero-center-follow-btn ${targetConnStatus === "accepted"
                    ? "hero-center-follow-btn--following"
                    : targetConnStatus === "pending"
                      ? "hero-center-follow-btn--pending"
                      : "hero-center-follow-btn--connect"
                  } ${justFollowed ? "hero-center-follow-btn--just-followed" : ""} ${touchUnfollowActive ? "hero-center-follow-btn--touch-unfollow" : ""
                  }`}
                disabled={targetConnLoading}
                onClick={targetConnStatus ? handleUnfollowTarget : handleFollowTarget}
                onMouseLeave={() => setJustFollowed(false)}
                title={
                  targetConnStatus === "accepted"
                    ? "Siguiendo (clic para dejar de seguir)"
                    : targetConnStatus === "pending"
                      ? "Solicitud pendiente (clic para cancelar)"
                      : `Seguir a @${targetProfile.username}`
                }
                aria-label={
                  targetConnStatus === "accepted"
                    ? "Dejar de seguir"
                    : targetConnStatus === "pending"
                      ? "Cancelar solicitud"
                      : "Seguir"
                }
              >
                {targetConnStatus === "accepted" ? (
                  <>
                    <UserRoundCheck
                      className="hero-center-follow-icon hero-center-follow-icon--check"
                      size={18}
                      strokeWidth={2.2}
                    />
                    <UserRoundMinus
                      className="hero-center-follow-icon hero-center-follow-icon--minus"
                      size={18}
                      strokeWidth={2.2}
                    />
                  </>
                ) : targetConnStatus === "pending" ? (
                  <UserRoundArrowLeft
                    className="hero-center-follow-icon"
                    size={18}
                    strokeWidth={2.2}
                  />
                ) : (
                  <UserRoundPlus
                    className="hero-center-follow-icon"
                    size={18}
                    strokeWidth={2.2}
                  />
                )}
              </button>
              <span
                className={`hero-center-follow-label ${targetConnStatus === "accepted"
                    ? "hero-center-follow-label--following"
                    : targetConnStatus === "pending"
                      ? "hero-center-follow-label--pending"
                      : "hero-center-follow-label--connect"
                  }`}
                onClick={targetConnLoading ? undefined : (targetConnStatus ? handleUnfollowTarget : handleFollowTarget)}
              >
                {targetConnStatus === "accepted"
                  ? "Siguiendo"
                  : targetConnStatus === "pending"
                    ? "pendiente"
                    : "Seguir"}
              </span>
            </div>
          )}
          <aside className="hero-stat" suppressHydrationWarning>
            <strong suppressHydrationWarning>
              <span suppressHydrationWarning>{achievedCount}</span>
              <small suppressHydrationWarning> / {totalCount}</small>
            </strong>
            <span suppressHydrationWarning>{modeUnit}</span>
            <div className="progress">
              <span style={{ width: `${completion}%` }} suppressHydrationWarning />
            </div>
          </aside>
        </div>

        {/* ── Mode selector on mobile (debajo de la barra de progreso) ── */}
        {hasBothModes && (
          <div
            className={`app-mode-switch hide-on-desktop ${isPeaks ? "app-mode-switch--peaks" : "app-mode-switch--countries"}`}
            style={{ marginTop: 10, display: "flex", width: "fit-content" }}
            onTouchStart={handleSwipeTouchStart}
            onTouchEnd={handleSwipeTouchEnd}
          >
            <div className="app-mode-switch__indicator" />
            <button
              className={`app-mode-btn ${isPeaks ? "active" : ""}`}
              onClick={() => switchMode("peaks")}
            >
              47 Picos
            </button>
            <button
              className={`app-mode-btn ${!isPeaks ? "active" : ""}`}
              onClick={() => switchMode("countries")}
            >
              196 Países
            </button>
          </div>
        )}
      </section>

      {/* ── Config warning ──────────────── */}
      {!isSupabaseConfigured && (
        <section className="configuration-note">
          <strong>Configuración pendiente.</strong> El diseño está listo; añade
          las dos variables de Supabase del archivo <code>.env.example</code>{" "}
          para activar cuentas, progreso y fotos.
        </section>
      )}

      {/* ── Map ─────────────────────────── */}
      <section className="map-section">
        <div id="mapa" className="section-heading map-heading-row">
          <div className={`map-legend-area ${diffMode ? "map-legend-area--diff" : ""}`}>
            {diffMode ? (
              <div className="diff-legend">
                <span>
                  <i className="legend-diff-dot legend-diff-dot--only-me" />{" "}
                  Solo tú
                </span>
                <span>
                  <i className="legend-diff-dot legend-diff-dot--only-them" />{" "}
                  Solo @{targetProfile?.username}
                </span>
                <span>
                  <i className="legend-diff-dot legend-diff-dot--both" /> Ambos
                </span>
                <span className="diff-legend-item--none">
                  <i className="legend-diff-dot legend-diff-dot--none" />{" "}
                  Ninguno
                </span>
              </div>
            ) : (
              <div className="map-legend">
                <span>
                  <i className="legend-pin">
                    {isPeaks ? (
                      <Triangle size={10} strokeWidth={2.2} />
                    ) : (
                      <Diamond size={10} strokeWidth={2.2} />
                    )}
                  </i>{" "}
                  Pendiente
                </span>
                <span>
                  <i className="legend-wishlist">
                    <Star size={10} fill="currentColor" strokeWidth={1} />
                  </i>{" "}
                  Quiero ir
                </span>
                <span>
                  <i className="legend-done">
                    <Check size={11} strokeWidth={2.5} />
                  </i>{" "}
                  {isPeaks ? "Completada" : "Visitado"}
                </span>
              </div>
            )}

            <div className="diff-toggle-wrap">
              {!isPeaks &&
                canShowCountries &&
                (experiencesMode || (mounted && myProfile?.enable_experiences)) && (
                  <button
                    className={`diff-toggle diff-toggle--compact ${experiencesMode ? "diff-toggle--active" : ""}`}
                    onClick={handleToggleExperiences}
                    title={experiencesMode ? "Ocultar experiencias" : "Ver experiencias"}
                  >
                    <svg
                      className="diff-toggle-icon"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <circle cx="12" cy="12" r="10" />
                      <circle cx="12" cy="12" r="6" />
                      <circle cx="12" cy="12" r="2" />
                    </svg>
                    Experiencias
                  </button>
                )}
            </div>
          </div>
        </div>
        <div
          style={{
            position: "relative",
            width: "100%",
            height: "100%",
            zIndex: 1,
          }}
        >
          {isReadOnly && session && (
            <div className="map-floating-controls">
              <button
                type="button"
                className={`diff-toggle diff-toggle--compact map-floating-btn ${diffMode ? "diff-toggle--active map-floating-btn--active" : ""}`}
                onClick={() => setDiffMode(!diffMode)}
                title={diffMode ? "Desactivar comparativa" : "Comparar con mi mapa"}
              >
                <svg
                  className="diff-toggle-icon"
                  viewBox="0 0 24 24"
                  width="14"
                  height="14"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="8" x2="12" y2="16" />
                  <line x1="8" y1="12" x2="16" y2="12" />
                </svg>
                <span>{diffMode ? "Comparando" : "Comparar"}</span>
              </button>
            </div>
          )}
          {isPeaks ? (
            <SpainMap
              completed={completedPeakCodes}
              wishlist={wishlistPeakCodes}
              onInformation={openPeakInformation}
              onComplete={openPeakRecord}
              diffMode={diffMode}
              diffOnlyViewer={diffPeakOnlyViewer}
              diffOnlyTarget={diffPeakOnlyTarget}
              diffBoth={diffPeakBoth}
              activeId={activeSelected?.id}
              panelOpen={!!activeSelected}
              hasCompareButton={Boolean(isReadOnly && session)}
              isActive={isActive}
            />
          ) : (
            <>
              <WorldMap
                completed={completedCountryIds}
                wishlist={wishlistCountryIds}
                onInformation={openCountryInformation}
                onComplete={openCountryRecord}
                diffMode={diffMode}
                diffOnlyViewer={diffItemOnlyViewer}
                diffOnlyTarget={diffItemOnlyTarget}
                diffBoth={diffItemBoth}
                activeId={activeSelected?.id}
                experiencesMode={experiencesMode}
                experienceRecords={
                  experiencesMode
                    ? experienceRecords.map((r) => {
                      const cat = dynamicCategories.find((c) =>
                        c.experiences.some((e) => e.id === r.experience_id),
                      );
                      return { ...r, icon_name: cat?.iconName || "telescope" };
                    })
                    : []
                }
                selectingLocation={!!selectingLocationForExp}
                onMapClick={handleMapClickForExp}
                onCancelSelectingLocation={handleCancelSelectingLocationForExp}
                onExperienceClick={handleExperienceClick}
                onAddExperience={!isReadOnly && !selectingLocationForExp ? () => setExpSelectorOpen(true) : undefined}
                panelOpen={!!activeSelected}
                hasCompareButton={Boolean(isReadOnly && session)}
                isActive={isActive}
              />
            </>
          )}
        </div>
      </section>

      {/* ── Item list ───────────────────── */}
      <section className="peak-list-section">
        <div className="section-heading">
          <div>
            <span className="eyebrow">{modeListEyebrow}</span>
            <h2>{modeListTitle}</h2>
            <p>{modeListSubtitle}</p>
          </div>
          <div className="search-input-container">
            <IconSearch className="search-icon" />
            <input
              type="search"
              placeholder={
                isPeaks
                  ? "Buscar pico o provincia..."
                  : isExp
                    ? "Buscar experiencia o categoría..."
                    : "Buscar país o capital..."
              }
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>

        {/* ── Filter pills ──────────────── */}
        <div
          className="list-filters"
          style={{ overflowX: "auto", whiteSpace: "nowrap", display: "flex" }}
        >
          <button
            className={`list-filter-pill${listFilter === "all" ? " list-filter-pill--active" : ""}`}
            onClick={() => setListFilter("all")}
          >
            Todos <span className="pill-count">{totalCount}</span>
          </button>

          {isExp ? (
            <>
              {dynamicCategories.map((cat) => {
                const isPredefinedCat = predefinedCategories.some(
                  (c) => c.id === cat.id,
                );
                const isCustomCat = !isPredefinedCat;
                return (
                  <div key={cat.id} style={{ position: "relative" }}>
                    <button
                      className={`list-filter-pill${listFilter === cat.name ? " list-filter-pill--active" : ""}`}
                      onClick={() => setListFilter(cat.name)}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 6,
                        width: "100%",
                        height: "100%",
                      }}
                    >
                      <span
                        style={{
                          display: "flex",
                          width: 14,
                          height: 14,
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        {getIconComponent(cat.iconName)}
                      </span>
                      {cat.name}
                    </button>
                    {isCustomCat && (
                      <button
                        className={`edit-action-btn ${isEditingExperiences ? "is-active" : ""}`}
                        title="Editar categoría"
                        style={{
                          position: "absolute",
                          top: "-6px",
                          right: "14px",
                          background: "var(--pine)",
                          color: "white",
                          width: "16px",
                          height: "16px",
                          borderRadius: "50%",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          border: "none",
                          cursor: "pointer",
                          padding: 0,
                          zIndex: 10,
                        }}
                        onClick={(e) => {
                          e.stopPropagation();
                          setEditingCustomCategory({
                            id: cat.id,
                            name: cat.name,
                            icon_name: cat.iconName,
                          });
                        }}
                      >
                        <IconEdit
                          style={{ width: 10, height: 10 }}
                          strokeWidth={2.5}
                        />
                      </button>
                    )}
                    <button
                      className={`edit-action-btn ${isEditingExperiences ? "is-active" : ""}`}
                      title="Eliminar categoría"
                      style={{
                        position: "absolute",
                        top: "-6px",
                        right: "-6px",
                        background: "#e74c3c",
                        color: "white",
                        width: "16px",
                        height: "16px",
                        borderRadius: "50%",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        border: "none",
                        cursor: "pointer",
                        padding: 0,
                        zIndex: 10,
                      }}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (isCustomCat) {
                          handleDeleteCustomCategory(cat.id);
                        } else {
                          handleHideItem(cat.id, "category");
                        }
                      }}
                    >
                      <svg
                        width="10"
                        height="10"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="3"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <line x1="18" y1="6" x2="6" y2="18"></line>
                        <line x1="6" y1="6" x2="18" y2="18"></line>
                      </svg>
                    </button>
                  </div>
                );
              })}
              {!isReadOnly && (
                <>
                  <button
                    className="list-filter-pill"
                    onClick={() => {
                      setEditingCustomCategory({
                        id: "new",
                        name: "",
                        iconName: "star",
                      });
                    }}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                      borderStyle: "dashed",
                    }}
                  >
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      style={{ width: 14, height: 14 }}
                    >
                      <line x1="12" y1="5" x2="12" y2="19"></line>
                      <line x1="5" y1="12" x2="19" y2="12"></line>
                    </svg>
                    Crear nueva categoría
                  </button>
                  <button
                    className={`list-filter-pill${isEditingExperiences ? " list-filter-pill--active" : ""}`}
                    onClick={() =>
                      setIsEditingExperiences(!isEditingExperiences)
                    }
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                      marginLeft: "auto",
                      borderStyle: "solid",
                      borderColor: "var(--pine)",
                      color: isEditingExperiences ? "#fff" : "var(--pine)",
                      background: isEditingExperiences
                        ? "var(--pine)"
                        : "transparent",
                    }}
                  >
                    <IconEdit style={{ width: 14, height: 14 }} />
                    Modificar experiencias
                  </button>
                  <button
                    className="list-filter-pill"
                    onClick={() => setShowTrashModal(true)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                      borderStyle: "solid",
                      borderColor: "#e74c3c",
                      color: "#e74c3c",
                      background: "transparent",
                    }}
                  >
                    <IconTrash style={{ width: 14, height: 14 }} />
                    Papelera
                  </button>
                </>
              )}
            </>
          ) : (
            <>
              <button
                className={`list-filter-pill${listFilter === "done" ? " list-filter-pill--active" : ""}`}
                onClick={() => setListFilter("done")}
              >
                {isPeaks ? "Completadas" : "Visitados"}{" "}
                <span className="pill-count">{achievedCount}</span>
              </button>
              <button
                className={`list-filter-pill${listFilter === "pending" ? " list-filter-pill--active" : ""}`}
                onClick={() => setListFilter("pending")}
              >
                Pendientes{" "}
                <span className="pill-count">
                  {totalCount - achievedCount}
                </span>
              </button>
              <button
                className={`list-filter-pill${listFilter === "wishlist" ? " list-filter-pill--active" : ""}`}
                onClick={() => setListFilter("wishlist")}
              >
                Quiero ir <span className="pill-count">{wishlistCount}</span>
              </button>
            </>
          )}
        </div>


        <div className="peak-list-grid">
          {sortedItems
            .filter((item) => {
              // Text search filter
              if (searchQuery) {
                const normalize = (s: string) =>
                  s
                    .normalize("NFD")
                    .replace(/[\u0300-\u036f]/g, "")
                    .toLowerCase();
                const q = normalize(searchQuery);
                const matchesText =
                  normalize(item.title).includes(q) ||
                  (item.label && normalize(item.label).includes(q)) ||
                  (item.detail && normalize(item.detail).includes(q));
                if (!matchesText) return false;
              }
              let done = false;
              if (isExp && item.subItems && item.subItems.length > 0) {
                const completedSubItems = new Set(
                  completedModeAscents
                    .filter((a) => a.summit_id === item.id && a.sub_item_id)
                    .map((a) => a.sub_item_id),
                );
                done = item.subItems.every((s: any) =>
                  completedSubItems.has(s.id),
                );
              } else {
                done = completedModeAscents.some(
                  (a) => a.summit_id === item.id,
                );
              }
              const wish = modeAscents.some(
                (a) => a.summit_id === item.id && a.is_wishlist,
              );
              if (isExp && listFilter !== "all" && item.detail !== listFilter)
                return false;
              if (!isExp) {
                if (listFilter === "done") return done;
                if (listFilter === "pending") return !done;
                if (listFilter === "wishlist") return wish;
              }
              return true;
            })
            .map((item, index) => {
              let done = false;
              if (isExp && item.subItems && item.subItems.length > 0) {
                const completedSubItems = new Set(
                  completedModeAscents
                    .filter((a) => a.summit_id === item.id && a.sub_item_id)
                    .map((a) => a.sub_item_id),
                );
                done = item.subItems.every((s: any) =>
                  completedSubItems.has(s.id),
                );
              } else {
                done = completedModeAscents.some(
                  (a) => a.summit_id === item.id,
                );
              }
              const wish = modeAscents.some(
                (a) => a.summit_id === item.id && a.is_wishlist,
              );

              // Diff class logic
              let diffClass = "";
              let diffSymbol: React.ReactNode = null;
              const effectiveDiffMode = diffMode && !isExp;
              if (effectiveDiffMode) {
                if (diffItemOnlyViewer.has(item.id)) {
                  diffClass = " peak-list-item--diff-only-me";
                  diffSymbol = <Check size={11} strokeWidth={2.5} />;
                } else if (diffItemOnlyTarget.has(item.id)) {
                  diffClass = " peak-list-item--diff-only-them";
                  diffSymbol = <X size={11} strokeWidth={2.5} />;
                } else if (diffItemBoth.has(item.id)) {
                  diffClass = " peak-list-item--diff-both";
                  diffSymbol = <Check size={11} strokeWidth={2.5} />;
                } else {
                  diffClass = " peak-list-item--diff-none";
                }
              }

              const itemClass = effectiveDiffMode
                ? `peak-list-item${diffClass}`
                : `peak-list-item${done ? " peak-list-item--done" : wish ? " peak-list-item--wishlist" : ""}`;

              const isCustomExp =
                isExp && customExperiences.some((c) => c.id === item.id);

              return (
                <div
                  key={`${item.id}-${index}`}
                  style={{ position: "relative", overflow: "hidden" }}
                >
                  <button
                    className={itemClass}
                    onClick={() => openInformation(item)}
                    style={{
                      width: "100%",
                      height: "100%",
                      paddingRight:
                        isExp && isEditingExperiences
                          ? (isCustomExp ? "64px" : "38px")
                          : undefined,
                    }}
                  >
                    <span
                      style={{
                        flexShrink: 0,
                        width: 20,
                        display: "flex",
                        justifyContent: "center",
                      }}
                    >
                      {effectiveDiffMode ? (
                        <span className="item-check">{diffSymbol}</span>
                      ) : done ? (
                        <i className="legend-done" style={{ margin: 0 }}>
                          <Check size={11} strokeWidth={2.5} />
                        </i>
                      ) : wish ? (
                        <i className="legend-wishlist" style={{ margin: 0 }}>
                          <Star size={10} fill="currentColor" strokeWidth={1} />
                        </i>
                      ) : (
                        <i
                          className="legend-pin"
                          style={{ margin: 0 }}
                        >
                          {isPeaks ? (
                            <Triangle size={10} strokeWidth={2.2} />
                          ) : (
                            <Diamond size={10} strokeWidth={2.2} />
                          )}
                        </i>
                      )}
                    </span>
                    <span className="item-info">
                      {isExp ? (
                        <>
                          <MarqueeText
                            text={item.detail || ""}
                            className="item-province"
                            active={isEditingExperiences}
                          />
                          <MarqueeText
                            text={item.title}
                            className="item-name"
                            active={isEditingExperiences}
                          />
                        </>
                      ) : (
                        <>
                          <span className="item-province">
                            {isPeaks ? item.label : item.label}
                          </span>
                          <br />
                          <span className="item-name">{item.title}</span>
                        </>
                      )}
                    </span>
                    <span className="item-alt">{item.subtitle}</span>
                  </button>
                  {isExp && (
                    <div
                      style={{
                        position: "absolute",
                        top: "50%",
                        transform: "translateY(-50%)",
                        right: "8px",
                        display: "flex",
                        alignItems: "center",
                        gap: "6px",
                        zIndex: 10,
                        pointerEvents: isEditingExperiences ? "auto" : "none",
                      }}
                    >
                      {isCustomExp && (
                        <button
                          className={`edit-action-btn ${isEditingExperiences ? "is-active" : ""}`}
                          title="Editar experiencia"
                          style={{
                            background: "var(--pine)",
                            color: "white",
                            width: "22px",
                            height: "22px",
                            minWidth: "22px",
                            minHeight: "22px",
                            borderRadius: "50%",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            border: "none",
                            cursor: "pointer",
                            padding: 0,
                          }}
                          onClick={(e) => {
                            e.stopPropagation();
                            setEditingCustomExp(
                              customExperiences.find((c) => c.id === item.id) || {
                                id: item.id,
                                name: item.title,
                                subItems: item.subItems,
                              },
                            );
                          }}
                        >
                          <IconEdit
                            style={{ width: 14, height: 14 }}
                            strokeWidth={2.5}
                          />
                        </button>
                      )}
                      <button
                        className={`edit-action-btn ${isEditingExperiences ? "is-active" : ""}`}
                        title={isCustomExp ? "Eliminar experiencia" : "Ocultar experiencia"}
                        style={{
                          background: "#e74c3c",
                          color: "white",
                          width: "22px",
                          height: "22px",
                          minWidth: "22px",
                          minHeight: "22px",
                          borderRadius: "50%",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          border: "none",
                          cursor: "pointer",
                          padding: 0,
                        }}
                        onClick={(e) => {
                          e.stopPropagation();
                          if (isCustomExp) {
                            handleDeleteCustomExperience(item.id);
                          } else {
                            handleHideItem(item.id, "experience");
                          }
                        }}
                      >
                        <svg
                          width="14"
                          height="14"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <line x1="18" y1="6" x2="6" y2="18"></line>
                          <line x1="6" y1="6" x2="18" y2="18"></line>
                        </svg>
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          {isExp && !isReadOnly && (
            <button
              className="peak-list-item peak-list-item--diff-none"
              style={{ borderStyle: "dashed", opacity: 0.7 }}
              onClick={() => {
                const cat =
                  listFilter !== "all"
                    ? dynamicCategories.find((c) => c.name === listFilter)
                    : undefined;
                if (cat) {
                  const isPseudoCat = cat.id.startsWith("cat-custom-");
                  const isCustomCat = customCategories.some((c) => c.id === cat.id);
                  setEditingCustomExp(
                    isPseudoCat
                      ? { id: "new", name: "", category_id: null, static_category_id: null }
                      : isCustomCat
                        ? { id: "new", name: "", category_id: cat.id }
                        : { id: "new", name: "", static_category_id: cat.id },
                  );
                } else {
                  setSelectingCategoryForNewExp(true);
                }
              }}
            >
              <span
                style={{
                  flexShrink: 0,
                  width: 20,
                  display: "flex",
                  justifyContent: "center",
                }}
              >
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="var(--pine)"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  style={{ width: 14, height: 14 }}
                >
                  <line x1="12" y1="5" x2="12" y2="19"></line>
                  <line x1="5" y1="12" x2="19" y2="12"></line>
                </svg>
              </span>
              <span className="item-info">
                <span
                  className="item-name"
                  style={{ color: "var(--pine)", fontWeight: 600 }}
                >
                  Añadir experiencia
                </span>
              </span>
            </button>
          )}
        </div>
      </section>

      {/* ── Footer ──────────────────────── */}
      <footer className="site-footer">
        <div className="footer-top">
          <div className="footer-left">
            Atlas · Datos{" "}
            {isPeaks ? "de altitudes según " : "según "}
            <a
              href={
                isPeaks
                  ? "https://es.wikipedia.org/wiki/Anexo:Monta%C3%B1as_m%C3%A1s_altas_y_prominentes_de_las_provincias_espa%C3%B1olas"
                  : "https://es.wikipedia.org/wiki/Anexo:Pa%C3%ADses"
              }
              target="_blank"
              rel="noopener noreferrer"
            >
              Wikipedia
            </a>
          </div>

          <div className="footer-center">
            Desarrollado por Jorge Acebes
            <a
              href="https://github.com/JorgeAcebes"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="GitHub"
            >
              <IconGithub />
            </a>
            <a
              href="https://www.linkedin.com/in/jorge-acebes"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="LinkedIn"
            >
              <IconLinkedin />
            </a>
          </div>

          <div className="footer-right">
            Mapa ©{" "}
            <a
              href="https://www.openstreetmap.org"
              target="_blank"
              rel="noopener noreferrer"
            >
              OpenStreetMap
            </a>
          </div>
        </div>

        <div className="footer-bottom">
          <div className="footer-disclaimer">
            Toda la información personal y datos de progreso se procesan de forma
            segura en los servidores de{" "}
            <a
              href="https://supabase.com/"
              target="_blank"
              rel="noopener noreferrer"
            >
              Supabase
            </a>
            , y el contenido fotográfico y multimedia se almacena en{" "}
            <a
              href="https://www.cloudflare.com/"
              target="_blank"
              rel="noopener noreferrer"
            >
              Cloudflare
            </a>
            .<br />
            &copy; {new Date().getFullYear()} Jorge Acebes. Todos los derechos
            reservados. El uso de esta web es únicamente con fines de
            entretenimiento y seguimiento personal.
          </div>
          <div
            style={{
              display: "flex",
              justifyContent: "center",
              alignItems: "center",
              gap: "1rem",
              marginTop: "0.75rem",
              fontSize: "0.78rem",
              flexWrap: "wrap",
            }}
          >
            <a
              href="/terminos"
              style={{ color: "var(--muted)", textDecoration: "underline" }}
            >
              Términos y Condiciones
            </a>
            <span style={{ color: "var(--line)", opacity: 0.8 }}>•</span>
            <a
              href="/privacidad"
              style={{ color: "var(--muted)", textDecoration: "underline" }}
            >
              Privacidad y Cookies
            </a>
            <span style={{ color: "var(--line)", opacity: 0.8 }}>•</span>
            <a
              href="mailto:atlas.maplog@gmail.com"
              style={{ color: "var(--muted)", textDecoration: "underline" }}
            >
              Contacto
            </a>
          </div>
        </div>
      </footer>

      {/* ── Info panel ──────────────────── */}
      {selected && isSelectedValidForCurrentMode && (
        <>
          {panelOpenedFromStatsRef.current && (
            <div
              className="info-panel-backdrop--from-stats"
              onClick={closePanel}
              style={{
                position: "fixed",
                inset: 0,
                zIndex: 10090,
                background: "rgba(0, 0, 0, 0.4)",
              }}
            />
          )}
          <aside
            className="info-panel"
            style={panelOpenedFromStatsRef.current ? { zIndex: 10100 } : undefined}
            aria-label={`Información sobre ${selected.title}`}
          >
          <button
            type="button"
            className="icon-button"
            onClick={closePanel}
            aria-label="Cerrar"
          >
            <IconClose />
          </button>

          {((selected as any)?.itemType === 'experience') ? (
            <>
              <span
                className="eyebrow"
                style={{ display: "flex", alignItems: "center", gap: 6 }}
              >
                {selected.label && getIconComponent(selected.label) && (
                  <span
                    style={{
                      display: "flex",
                      width: 14,
                      height: 14,
                      alignItems: "center",
                    }}
                  >
                    {getIconComponent(selected.label)}
                  </span>
                )}
                {selected.detail
                  ? selected.detail.toUpperCase()
                  : "EXPERIENCIA"}
              </span>
              <h2>{selected.title}</h2>
              <div style={{ marginTop: "16px" }}>
                {(() => {
                  const exp = selected;
                  if (exp?.subItems && exp.subItems.length > 0) {
                    return (
                      <div style={{ marginTop: 16 }}>
                        <h4
                          style={{
                            marginBottom: 8,
                            fontSize: "0.9rem",
                            color: "var(--foreground)",
                          }}
                        >
                          Desglose:
                        </h4>
                        <div
                          style={{
                            display: "flex",
                            flexDirection: "column",
                            gap: 8,
                          }}
                        >
                          {exp.subItems.map((item: any) => {
                            const subItemKey = `${exp.id}::${item.id}`;
                            const records = experienceRecords.filter(
                              (r) =>
                                r.experience_id === exp.id &&
                                r.sub_item_id === item.id,
                            );
                            const hasRecords = records.length > 0;
                            const asc = hasRecords ? records[0] : null;
                            const subItemRegisteredDates = new Set(
                              records.map((a) => a.achieved_on),
                            );
                            const subItemOtherPhotos = sortPhotosByTime(
                              selectedPhotos.filter(
                                (p) =>
                                  p.summit_id === subItemKey &&
                                  !subItemRegisteredDates.has(p.taken_on),
                              ),
                            );

                            const isOpenable =
                              hasRecords || subItemOtherPhotos.length > 0;

                            if (!isOpenable) {
                              return (
                                <div
                                  key={item.id}
                                  style={{
                                    display: "flex",
                                    justifyContent: "space-between",
                                    alignItems: "center",
                                    padding: "12px 12px",
                                    background: "var(--surface)",
                                    borderRadius: "6px",
                                    border: "1px solid var(--border)",
                                  }}
                                >
                                  <span
                                    style={{
                                      display: "flex",
                                      alignItems: "center",
                                      gap: "8px",
                                      fontWeight: 500,
                                      fontSize: "14px",
                                    }}
                                  >
                                    {item.name}
                                  </span>
                                  {!isReadOnly && (
                                    <button
                                      className="button button--purple button--small"
                                      style={{
                                        margin: "-6px 0",
                                        padding: "4px 12px",
                                        minHeight: "28px",
                                        height: "auto",
                                        lineHeight: "1.2",
                                      }}
                                      onClick={(e) => {
                                        e.preventDefault();
                                        setSelectingLocationForExp(subItemKey);
                                        window.location.hash = "mapa";
                                      }}
                                    >
                                      Registrar
                                    </button>
                                  )}
                                </div>
                              );
                            }

                            return (
                              <details
                                key={item.id}
                                className="subitem-details"
                                open={item.id === selected?.sub_item_id || undefined}
                                style={{
                                  display: "flex",
                                  flexDirection: "column",
                                  padding: "12px 12px",
                                  background: "var(--surface)",
                                  borderRadius: "6px",
                                  border: "1px solid var(--border)",
                                }}
                              >
                                <summary
                                  style={{
                                    display: "flex",
                                    justifyContent: "space-between",
                                    alignItems: "center",
                                    cursor: "pointer",
                                    outline: "none",
                                    fontWeight: 500,
                                    fontSize: "14px",
                                    listStyle: "none",
                                  }}
                                >
                                  <span
                                    style={{
                                      display: "flex",
                                      alignItems: "center",
                                      gap: "8px",
                                    }}
                                  >
                                    <svg
                                      className="details-chevron"
                                      width="16"
                                      height="16"
                                      viewBox="0 0 24 24"
                                      fill="none"
                                      stroke="currentColor"
                                      strokeWidth="2"
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                      style={{
                                        transition: "transform 0.2s",
                                        flexShrink: 0,
                                      }}
                                    >
                                      <polyline points="9 18 15 12 9 6"></polyline>
                                    </svg>
                                    {item.name}
                                  </span>
                                  {!hasRecords ? (
                                    !isReadOnly ? (
                                      <button
                                        className="button button--purple button--small"
                                        style={{
                                          margin: "-6px 0",
                                          padding: "4px 12px",
                                          minHeight: "28px",
                                          height: "auto",
                                          lineHeight: "1.2",
                                        }}
                                        onClick={(e) => {
                                          e.preventDefault();
                                          setSelectingLocationForExp(subItemKey);
                                          window.location.hash = "mapa";
                                        }}
                                      >
                                        Registrar
                                      </button>
                                    ) : null
                                  ) : (
                                    <div
                                      style={{
                                        display: "flex",
                                        alignItems: "center",
                                        gap: 4,
                                      }}
                                    >
                                      <IconCheck
                                        style={{
                                          color: "var(--pine)",
                                          width: 16,
                                          height: 16,
                                        }}
                                      />
                                    </div>
                                  )}
                                </summary>

                                <div
                                  style={{
                                    display: "flex",
                                    flexDirection: "column",
                                    gap: "16px",
                                    marginTop: 16,
                                  }}
                                >
                                  {records.length > 1 && expToggleSort}
                                  {hasRecords ? (
                                    <>
                                      <div
                                        style={{
                                          display: "flex",
                                          flexDirection: "column",
                                          gap: "16px",
                                        }}
                                      >
                                        {records.map(renderExpRecord)}
                                      </div>
                                      {!isReadOnly && (
                                        <button
                                          className="button button--purple button--small"
                                          onClick={(e) => {
                                            e.preventDefault();
                                            setSelectingLocationForExp(
                                              subItemKey,
                                            );
                                            window.location.hash = "mapa";
                                          }}
                                          style={{
                                            alignSelf: "flex-start",
                                            padding: "4px 12px",
                                            minHeight: "28px",
                                            height: "auto",
                                            lineHeight: "1.2",
                                            marginTop: "-8px",
                                          }}
                                        >
                                          Registrar otra vez
                                        </button>
                                      )}
                                    </>
                                  ) : null}

                                  {subItemOtherPhotos.length > 0 && (
                                    <div
                                      className="photo-section"
                                      style={{ marginTop: 8 }}
                                    >
                                      <h5
                                        style={{
                                          margin: "0 0 12px 0",
                                          fontSize: "0.85rem",
                                          color: "var(--muted)",
                                        }}
                                      >
                                        Otras fotos{" "}
                                        <small>
                                          {subItemOtherPhotos.length}
                                        </small>
                                      </h5>
                                      <div className="photo-grid">
                                        {subItemOtherPhotos.map((photo) => {
                                          const isSelected =
                                            selectedPhotosForEdit.includes(
                                              photo.id,
                                            );
                                          return (
                                            <figure
                                              key={photo.id}
                                              className={
                                                isSelected ? "selected" : ""
                                              }
                                              onClick={() =>
                                                handlePhotoClick(photo)
                                              }
                                            >
                                              {!isReadOnly && (
                                                <button
                                                  type="button"
                                                  className={`photo-select-circle ${isSelected ? "active" : ""}`}
                                                  onClick={(e) => {
                                                    e.stopPropagation();
                                                    togglePhotoSelection(
                                                      photo.id,
                                                    );
                                                  }}
                                                  aria-label="Seleccionar foto"
                                                >
                                                  {isSelected && <IconCheck />}
                                                </button>
                                              )}
                                              <img
                                                src={photo.public_url}
                                                alt="Foto de la experiencia"
                                                loading="eager"
                                                decoding="async"
                                              />
                                              {photo.caption && (
                                                <figcaption>
                                                  {photo.caption}
                                                </figcaption>
                                              )}
                                            </figure>
                                          );
                                        })}
                                      </div>
                                    </div>
                                  )}
                                </div>
                              </details>
                            );
                          })}
                        </div>
                        {(() => {
                          const allCompleted = exp.subItems.every((item: any) =>
                            experienceRecords.some(
                              (r) =>
                                r.experience_id === exp.id &&
                                r.sub_item_id === item.id,
                            ),
                          );
                          if (!allCompleted) {
                            return (
                              <div
                                className="pending-card"
                                style={{ marginTop: 16 }}
                              >
                                {isReadOnly
                                  ? "Aún no ha completado esta experiencia."
                                  : "Aún no has completado esta experiencia."}
                              </div>
                            );
                          }
                          return null;
                        })()}
                      </div>
                    );
                  }
                  return (
                    !isReadOnly ? (
                      <div className="button-group">
                        <button
                          className="button button--purple"
                          onClick={() => {
                            setSelectingLocationForExp(`${selected.id}::`);
                            window.location.hash = "mapa";
                          }}
                          style={{ width: "100%", marginBottom: 8 }}
                        >
                          Registrar experiencia
                        </button>
                      </div>
                    ) : null
                  );
                })()}
              </div>
            </>
          ) : (
            <>
              <span
                className="eyebrow"
                style={{ display: "flex", alignItems: "center", gap: 6 }}
              >
                {selected.label ? selected.label.toUpperCase() : ""}
              </span>
              <h2>{selected.title}</h2>
              {isPeaks ? (
                <>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      marginTop: 19,
                    }}
                  >
                    <div className="altitude" style={{ marginTop: 0 }}>
                      {selected.subtitle.replace(" m", "")} <span>m</span>
                    </div>
                  </div>
                  <p className="range">{selected.detail}</p>
                </>
              ) : (
                <>
                  {selected.subtitle && (
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        marginTop: 19,
                      }}
                    >
                      <div className="country-capital" style={{ marginTop: 0 }}>
                        {selected.subtitle}
                      </div>
                    </div>
                  )}
                  {selected.detail && <p className="range">{selected.detail}</p>}
                </>
              )}
              {selected.note && <p>{selected.note}</p>}
            </>
          )}

          {!(
            ((selected as any)?.itemType === 'experience')
          ) && (
              <>
                {selectedAscents.length > 1 && (
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      background: "rgba(92, 155, 125, 0.1)",
                      borderRadius: "20px",
                      padding: "3px",
                      position: "relative",
                      marginBottom: "16px",
                      cursor: "pointer",
                      userSelect: "none",
                      width: "fit-content",
                    }}
                    onClick={() =>
                      setAscentsSortOrder((o) => (o === "asc" ? "desc" : "asc"))
                    }
                  >
                    <div
                      style={{
                        position: "absolute",
                        top: 3,
                        bottom: 3,
                        left: ascentsSortOrder === "asc" ? 3 : "50%",
                        right: ascentsSortOrder === "asc" ? "50%" : 3,
                        background: "var(--pine)",
                        borderRadius: "18px",
                        transition: "all 0.2s cubic-bezier(0.4, 0, 0.2, 1)",
                      }}
                    />
                    <span
                      style={{
                        position: "relative",
                        zIndex: 1,
                        padding: "4px 12px",
                        fontSize: "12px",
                        fontWeight: 600,
                        color:
                          ascentsSortOrder === "asc" ? "white" : "var(--pine)",
                        transition: "color 0.2s ease",
                        flex: 1,
                        whiteSpace: "nowrap",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      Más antiguo
                    </span>
                    <span
                      style={{
                        position: "relative",
                        zIndex: 1,
                        padding: "4px 12px",
                        fontSize: "12px",
                        fontWeight: 600,
                        color:
                          ascentsSortOrder === "desc" ? "white" : "var(--pine)",
                        transition: "color 0.2s ease",
                        flex: 1,
                        whiteSpace: "nowrap",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      Más reciente
                    </span>
                  </div>
                )}

                {selectedAscents.length > 0 ? (
                  selectedAscents.map((ascent) => {
                    const ascentPhotos = sortPhotosByTime(
                      selectedPhotos.filter(
                        (p) => p.taken_on === ascent.achieved_on,
                      ),
                    );
                    return (
                      <div key={ascent.achieved_on} className="completed-card">
                        <div
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "flex-start",
                            gap: "8px",
                          }}
                        >
                          <b style={{ marginTop: "6px" }}>
                            {formatDate(ascent.achieved_on)}
                            {ascent.end_date &&
                              ` - ${formatDate(ascent.end_date)}`}
                          </b>

                          {!isReadOnly && (
                            <div
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: "4px",
                              }}
                            >
                              <button
                                title="Compartir registro"
                                className="button button--quiet button--small"
                                style={{
                                  display: "flex",
                                  alignItems: "center",
                                  justifyContent: "center",
                                  width: "32px",
                                  height: "32px",
                                  flexShrink: 0,
                                  padding: 0,
                                  margin: 0,
                                }}
                                onClick={() =>
                                  handleShareRecord(selected, ascent, ascentPhotos)
                                }
                              >
                                <IconShare
                                  style={{ width: 14, height: 14 }}
                                  strokeWidth={1.5}
                                />
                              </button>
                              <button
                                title="Editar registro"
                                className="button button--quiet button--small"
                                style={{
                                  display: "flex",
                                  alignItems: "center",
                                  justifyContent: "center",
                                  width: "32px",
                                  height: "32px",
                                  flexShrink: 0,
                                  padding: 0,
                                  margin: 0,
                                }}
                                onClick={() => openRecord(selected, ascent)}
                              >
                                <IconEdit
                                  style={{ width: 14, height: 14 }}
                                  strokeWidth={1.5}
                                />
                              </button>
                              <label
                                title="Añadir fotos a esta fecha"
                                className="button button--quiet button--small"
                                onClick={(e) => {
                                  if (ascentPhotos.length >= 4) {
                                    e.preventDefault();
                                    setNotice(
                                      "Máximo 4 fotos por registro. Ya has alcanzado el límite.",
                                    );
                                    setTimeout(() => setNotice(""), 4000);
                                  }
                                }}
                                style={{
                                  display: "flex",
                                  alignItems: "center",
                                  justifyContent: "center",
                                  width: "32px",
                                  height: "32px",
                                  flexShrink: 0,
                                  padding: 0,
                                  margin: 0,
                                  cursor:
                                    ascentPhotos.length >= 4
                                      ? "not-allowed"
                                      : "pointer",
                                  opacity: ascentPhotos.length >= 4 ? 0.5 : 1,
                                }}
                              >
                                <IconCamera
                                  style={{ width: 14, height: 14 }}
                                  strokeWidth={1.5}
                                />
                                <input
                                  type="file"
                                  accept="image/*"
                                  multiple
                                  onChange={(e) =>
                                    handleAddPhotosToDate(e, ascent)
                                  }
                                  style={{ display: "none" }}
                                  disabled={ascentPhotos.length >= 4}
                                />
                              </label>
                            </div>
                          )}
                        </div>
                        {ascent.location_name && (
                          <div
                            style={{
                              marginTop: "8px",
                              fontSize: "13px",
                              fontWeight: 500,
                              display: "flex",
                              alignItems: "flex-start",
                              gap: 4,
                            }}
                          >
                            <svg
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              style={{
                                width: 14,
                                height: 14,
                                flexShrink: 0,
                                marginTop: 2,
                              }}
                            >
                              <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                              <circle cx="12" cy="10" r="3" />
                            </svg>
                            {ascent.location_name}
                          </div>
                        )}
                        {ascent.notes && (
                          <p className="record-notes user-written-text" style={{ marginTop: "4px", marginBottom: 0 }}>
                            &ldquo;{ascent.notes}&rdquo;
                          </p>
                        )}
                        {(ascent.link || (ascent as any).link_2) && (
                          <div
                            style={{
                              display: "flex",
                              flexWrap: "wrap",
                              gap: 8,
                              marginTop: Boolean(ascent.notes) ? 4 : 8,
                            }}
                          >
                            {renderRecordLink(ascent.link, (ascent as any).link_name)}
                            {renderRecordLink((ascent as any).link_2, (ascent as any).link_name_2)}
                          </div>
                        )}

                        {(() => {
                          const tripGrpId = (ascent as any).trip_group_id; const tripComps = tripGrpId ? tripCompanionsMap[tripGrpId] : null;
                          if (!tripComps || tripComps.length === 0) return null;
                          const filteredComps = tripComps.filter((c: any) => {
                            if (c.id === targetId) return false;
                            if (c.is_public !== false) return true;
                            if (session?.user?.id === c.id) return true;
                            if (userFollowingSet.has(c.id)) return true;
                            return false;
                          });
                          if (filteredComps.length === 0) return null;

                          return (
                            <div style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                              <span style={{ fontSize: "11px", color: "var(--muted)", fontWeight: 600 }}>
                                {filteredComps.length === 1
                                  ? isPeaks
                                    ? "Compañero de ruta:"
                                    : isExp
                                    ? "Compañero de experiencia:"
                                    : "Compañero de viaje:"
                                  : isPeaks
                                  ? "Compañeros de ruta:"
                                  : isExp
                                  ? "Compañeros de experiencia:"
                                  : "Compañeros de viaje:"}
                              </span>
                              <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                                {filteredComps.map((comp: any) => (
                                  <Link
                                    key={comp.id}
                                    href={`/perfil/${comp.username}`}
                                    title={`@${comp.username}`}
                                    style={{ textDecoration: "none" }}
                                  >
                                    <div
                                      style={{
                                        width: 22,
                                        height: 22,
                                        borderRadius: "50%",
                                        backgroundColor: "var(--pine)",
                                        color: "#fff",
                                        display: "flex",
                                        alignItems: "center",
                                        justifyContent: "center",
                                        fontSize: 10,
                                        fontWeight: "bold",
                                        overflow: "hidden",
                                        border: "1.5px solid var(--card-bg, #fff)",
                                        boxShadow: "0 1px 2px rgba(0,0,0,0.1)",
                                      }}
                                    >
                                      {comp.avatar_url ? (
                                        <img src={comp.avatar_url} alt={comp.username} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                                      ) : (
                                        comp.username.charAt(0).toUpperCase()
                                      )}
                                    </div>
                                  </Link>
                                ))}
                              </div>
                            </div>
                          );
                        })()}

                        {ascentPhotos.length > 0 && (
                          <div
                            className="photo-section"
                            style={{ marginTop: 16 }}
                          >
                            <div className="photo-grid">
                              {ascentPhotos.map((photo) => {
                                const isSelected = selectedPhotosForEdit.includes(
                                  photo.id,
                                );
                                return (
                                  <figure
                                    key={photo.id}
                                    className={isSelected ? "selected" : ""}
                                    onClick={() => handlePhotoClick(photo)}
                                  >
                                    {!isReadOnly && (
                                      <button
                                        type="button"
                                        className={`photo-select-circle ${isSelected ? "active" : ""}`}
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          togglePhotoSelection(photo.id);
                                        }}
                                        aria-label="Seleccionar foto"
                                      >
                                        {isSelected && <IconCheck />}
                                      </button>
                                    )}
                                    <img
                                      src={photo.public_url}
                                      alt={`Foto en ${selected.title}`}
                                      loading="eager"
                                      decoding="async"
                                    />
                                    {photo.caption && (
                                      <figcaption>
                                        {photo.caption}
                                      </figcaption>
                                    )}
                                  </figure>
                                );
                              })}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })
                ) : hasWishlist && !((selected as any)?.itemType === 'experience') ? (
                  <div className="wishlist-card-wrap">
                    <div
                      className="pending-card wishlist-pending-card"
                      style={{
                        background: "var(--amber-bg)",
                        color: "#a67c29",
                        borderColor: "#ecd9a5",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: 6,
                      }}
                    >
                      <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <Star size={14} fill="currentColor" strokeWidth={1} />
                        <span>{isReadOnly ? "En su lista de deseos" : "En tu lista de deseos"}</span>
                      </span>
                      {!isReadOnly && (
                        <button
                          type="button"
                          className="wishlist-note-btn"
                          title={wishlistEntry?.notes ? "Editar nota" : "Añadir nota"}
                          onClick={() => {
                            setWishlistNoteText(wishlistEntry?.notes ?? "");
                            setShowWishlistNoteEditor((v) => !v);
                          }}
                          aria-label="Añadir o editar nota de lista de deseos"
                        >
                          <NotebookPen size={14} />
                        </button>
                      )}
                    </div>
                    {/* Note display (read-only) */}
                    {wishlistEntry?.notes && !showWishlistNoteEditor && (
                      <div className="wishlist-note-display user-written-text">
                        {renderWithClickableLinks(wishlistEntry.notes)}
                      </div>
                    )}
                    {/* Note editor */}
                    {!isReadOnly && showWishlistNoteEditor && (
                      <div className="wishlist-note-editor">
                        <textarea
                          className="wishlist-note-textarea"
                          value={wishlistNoteText}
                          onChange={(e) => setWishlistNoteText(e.target.value)}
                          placeholder="Escribe tu nota…"
                          rows={3}
                          autoFocus
                        />
                        <div className="wishlist-note-actions">
                          <button
                            type="button"
                            className="button button--quiet"
                            onClick={() => setShowWishlistNoteEditor(false)}
                          >
                            Cancelar
                          </button>
                          <button
                            type="button"
                            className={`button ${isPeaks ? "button--green" : "button--purple"}`}
                            onClick={() => saveWishlistNote()}
                          >
                            Guardar nota
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="pending-card">
                    {isPeaks
                      ? isReadOnly
                        ? "Aún no ha registrado esta cima."
                        : "Aún no has registrado esta cima."
                      : ((selected as any)?.itemType === 'experience')
                        ? isReadOnly
                          ? "Aún no ha vivido esta experiencia."
                          : "Aún no has vivido esta experiencia."
                        : isReadOnly
                          ? "Aún no ha registrado este país."
                          : "Aún no has registrado este país."}
                  </div>
                )}

                {/* Other photos that don't match any registered date */}
                {(() => {
                  const registeredDates = new Set(
                    selectedAscents.map((a) => a.achieved_on),
                  );
                  const otherPhotos = sortPhotosByTime(
                    selectedPhotos.filter(
                      (p) => !registeredDates.has(p.taken_on),
                    ),
                  );
                  if (otherPhotos.length === 0) return null;
                  return (
                    <div className="photo-section" style={{ marginTop: 24 }}>
                      <h3>
                        Otras fotos <small>{otherPhotos.length}</small>
                      </h3>
                      <div className="photo-grid">
                        {otherPhotos.map((photo) => {
                          const isSelected = selectedPhotosForEdit.includes(
                            photo.id,
                          );
                          return (
                            <figure
                              key={photo.id}
                              className={isSelected ? "selected" : ""}
                              onClick={() => handlePhotoClick(photo)}
                            >
                              {!isReadOnly && (
                                <button
                                  type="button"
                                  className={`photo-select-circle ${isSelected ? "active" : ""}`}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    togglePhotoSelection(photo.id);
                                  }}
                                  aria-label="Seleccionar foto"
                                >
                                  {isSelected && <IconCheck />}
                                </button>
                              )}
                              <img
                                src={photo.public_url}
                                alt={`Foto en ${selected.title}`}
                                loading="eager"
                                decoding="async"
                              />
                              {photo.caption && (
                                <figcaption>
                                  {photo.caption}
                                </figcaption>
                              )}
                            </figure>
                          );
                        })}
                      </div>
                    </div>
                  );
                })()}

                <div className="panel-actions">
                  {!isReadOnly && (
                    <button
                      className={`button ${isPeaks ? "button--green" : "button--purple"} button--wide`}
                      onClick={() => openRecord(selected)}
                    >
                      {selectedAscents.length > 0
                        ? "Registrar otra fecha"
                        : isPeaks
                          ? "Marcar como completado"
                          : ((selected as any)?.itemType === 'experience')
                            ? "Registrar la experiencia"
                            : "Marcar como visitado"}
                    </button>
                  )}
                  {(!selectedAscents.length || hasWishlist) &&
                    !isReadOnly &&
                    !((selected as any)?.itemType === 'experience') && (
                      <button
                        className="button button--quiet button--wide"
                        style={{ marginTop: 8 }}
                        onClick={() => saveWishlist()}
                      >
                        {hasWishlist
                          ? "Quitar de mi lista de deseos"
                          : "Añadir a mi lista de deseos"}
                      </button>
                    )}
                </div>
              </>
            )}

          {(((selected as any)?.itemType === 'experience')) && (
            <>
              {(() => {
                if (selected.subItems && selected.subItems.length > 0) {
                  return null;
                }

                if (selectedExperienceRecords.length === 0) {
                  return (
                    <div className="pending-card">
                      {isReadOnly
                        ? "Aún no ha vivido esta experiencia."
                        : "Aún no has vivido esta experiencia."}
                    </div>
                  );
                }

                return (
                  <>
                    {selectedExperienceRecords.length > 1 && expToggleSort}
                    <div
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: "16px",
                      }}
                    >
                      {selectedExperienceRecords.map(renderExpRecord)}
                    </div>
                  </>
                );
              })()}

              {/* Otras fotos (experiencias) */}
              {(() => {
                const registeredDates = new Set(
                  selectedExperienceRecords.map((a) => a.achieved_on),
                );
                // Only show photos that belong to the parent (not a specific sub-item) and whose date is not registered
                const otherPhotos = sortPhotosByTime(
                  selectedPhotos.filter(
                    (p) =>
                      !registeredDates.has(p.taken_on) &&
                      p.summit_id === selected.id,
                  ),
                );
                if (otherPhotos.length === 0) return null;
                return (
                  <div className="photo-section" style={{ marginTop: 24 }}>
                    <h3>
                      Otras fotos <small>{otherPhotos.length}</small>
                    </h3>
                    <div className="photo-grid">
                      {otherPhotos.map((photo) => {
                        const isSelected = selectedPhotosForEdit.includes(
                          photo.id,
                        );
                        return (
                          <figure
                            key={photo.id}
                            className={isSelected ? "selected" : ""}
                            onClick={() => handlePhotoClick(photo)}
                          >
                            {!isReadOnly && (
                              <button
                                type="button"
                                className={`photo-select-circle ${isSelected ? "active" : ""}`}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  togglePhotoSelection(photo.id);
                                }}
                                aria-label="Seleccionar foto"
                              >
                                {isSelected && <IconCheck />}
                              </button>
                            )}
                            <img
                              src={photo.public_url}
                              alt={`Foto en ${selected.title}`}
                              loading="eager"
                              decoding="async"
                            />
                            {photo.caption && (
                              <figcaption>
                                {photo.caption}
                              </figcaption>
                            )}
                          </figure>
                        );
                      })}
                    </div>
                  </div>
                );
              })()}
            </>
          )}
        </aside>
        </>
      )}

      {/* ── Record dialog ───────────────── */}
      {recordOpen && selected && isSelectedValidForCurrentMode && (
        <div
          className="modal-backdrop"
          style={panelOpenedFromStatsRef.current ? { zIndex: 10200 } : undefined}
          onWheel={(e) => e.stopPropagation()}
        >
          <section
            className="record-dialog"
            role="dialog"
            aria-modal="true"
            style={{ overscrollBehavior: "contain" }}
          >
            <button
              type="button"
              className="icon-button"
              onClick={handleCloseRecord}
              aria-label="Cerrar"
            >
              <IconClose />
            </button>
            <span className="eyebrow">
              {isPeaks ? "REGISTRAR ASCENSIÓN" : ((selected as any)?.itemType === 'experience') ? "REGISTRAR EXPERIENCIA"
                : "REGISTRAR VISITA"}
            </span>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                marginTop: 4,
              }}
            >
              {(((selected as any)?.itemType === 'experience')) && selected.iconName && (
                <span style={{ color: "var(--foreground)" }}>
                  {getIconComponent(selected.iconName, 26)}
                </span>
              )}
              <h2 style={{ margin: 0, fontSize: "1.35rem", lineHeight: "1.2" }}>
                {selected.title}
              </h2>
            </div>
            {((selected as any)?.itemType === 'experience') ? (
              selected.subtitle ? <p>{selected.subtitle}</p> : null
            ) : countries.some((c) => c.id === selected.id) ? null : (
              <p>
                {selected.subtitle
                  ? `${selected.label} · ${selected.subtitle}`
                  : selected.label}
              </p>
            )}
            {(((selected as any)?.itemType === 'experience')) && (
              <div style={{ marginBottom: 16, zIndex: 50 }}>
                <div style={{ marginBottom: 8 }}>
                  <label
                    className="field-label"
                    style={{ display: "block", marginBottom: 4 }}
                  >
                    Ubicación
                  </label>
                  <LocationSearch
                    value={locationName}
                    onChange={setLocationName}
                    onSelect={(lat, lng, name) => {
                      setSelectedLatLng({ lat, lng });
                      setLocationName(name);
                    }}
                    placeholder="Buscar país, región, ciudad..."
                    className="notes-input"
                  />
                </div>
                <div style={{ display: "flex", gap: 8, marginTop: -4 }}>
                  <button
                    type="button"
                    className="button button--quiet button--small"
                    onClick={() => {
                      selectingFromRecordRef.current = true;
                      setSelectingLocationForExp(
                        selected.sub_item_id
                          ? `${selected.id}::${selected.sub_item_id}`
                          : `${selected.id}::`,
                      );
                      setRecordOpen(false);
                      window.location.hash = "mapa";
                    }}
                    style={{ color: "var(--pine)", padding: "4px 8px" }}
                  >
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      style={{ width: 14, height: 14, marginRight: 6 }}
                    >
                      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                      <circle cx="12" cy="10" r="3" />
                    </svg>
                    Modificar ubicación
                  </button>
                </div>
              </div>
            )}

            <div className="field-label" style={{ marginBottom: 18 }}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: 8,
                }}
              >
                <span>
                  {isPeaks
                    ? "Fecha de la ascensión"
                    : isExp
                      ? "Fecha de la experiencia"
                      : "Fecha de la visita"}
                </span>
                {!isDateUnknown && !isEndDateEnabled && (
                  <button
                    type="button"
                    className="diff-toggle"
                    style={{
                      fontSize: "0.85em",
                      padding: "4px 8px",
                      height: "auto",
                    }}
                    onClick={() => {
                      setIsEndDateEnabled(true);
                      if (!climbEndDate && climbDate) {
                        setClimbEndDate(new Date(climbDate));
                        setIsDateModified(true);
                      }
                    }}
                  >
                    <svg
                      className="diff-toggle-icon"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      style={{ width: 14, height: 14 }}
                    >
                      <circle cx="12" cy="12" r="10" />
                      <line x1="12" y1="8" x2="12" y2="16" />
                      <line x1="8" y1="12" x2="16" y2="12" />
                    </svg>
                    Fecha finalización
                  </button>
                )}
              </div>
              {isDateUnknown ? (
                <button
                  type="button"
                  className="button button--outline button--wide"
                  onClick={() => {
                    setIsDateUnknown(false);
                    setClimbDate(new Date());
                    setIsDateModified(true);
                  }}
                >
                  Establecer fecha
                </button>
              ) : isEndDateEnabled ? (
                <div
                  style={{
                    display: "flex",
                    alignItems: "flex-end",
                    gap: "8px",
                    marginTop: 4,
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      flex: 1,
                      gap: 4,
                    }}
                  >
                    <label style={{ fontSize: "0.8em", color: "var(--muted)" }}>
                      Comienzo
                    </label>
                    <input
                      type="date"
                      value={
                        climbDate ? climbDate.toISOString().slice(0, 10) : ""
                      }
                      onChange={(e) => {
                        setClimbDate(
                          e.target.value
                            ? new Date(e.target.value)
                            : new Date(),
                        );
                        setIsDateModified(true);
                      }}
                      max={new Date().toISOString().slice(0, 10)}
                      style={{
                        padding: "0 12px",
                        margin: 0,
                        height: "35px",
                        boxSizing: "border-box",
                      }}
                    />
                  </div>
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      flex: 1,
                      gap: 4,
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                      }}
                    >
                      <label
                        style={{ fontSize: "0.8em", color: "var(--muted)" }}
                      >
                        Fin
                      </label>
                      <button
                        type="button"
                        className="button button--quiet"
                        style={{
                          padding: 0,
                          height: 16,
                          minWidth: "auto",
                          border: "none",
                        }}
                        onClick={() => {
                          setIsEndDateEnabled(false);
                          setClimbEndDate(null);
                        }}
                        title="Quitar fecha finalización"
                      >
                        <IconClose style={{ width: 12, height: 12 }} />
                      </button>
                    </div>
                    <input
                      type="date"
                      value={
                        climbEndDate
                          ? climbEndDate.toISOString().slice(0, 10)
                          : ""
                      }
                      onChange={(e) => {
                        setClimbEndDate(
                          e.target.value
                            ? new Date(e.target.value)
                            : new Date(),
                        );
                        setIsDateModified(true);
                      }}
                      min={
                        climbDate ? climbDate.toISOString().slice(0, 10) : ""
                      }
                      max={new Date().toISOString().slice(0, 10)}
                      style={{
                        padding: "0 12px",
                        margin: 0,
                        height: "35px",
                        boxSizing: "border-box",
                      }}
                    />
                  </div>
                  <div
                    style={{ display: "flex", flexDirection: "column", gap: 4 }}
                  >
                    <label style={{ fontSize: "0.8em", visibility: "hidden" }}>
                      X
                    </label>
                    <button
                      type="button"
                      className="button button--quiet"
                      onClick={() => {
                        setIsDateUnknown(true);
                        setClimbDate(null);
                        setClimbEndDate(null);
                        setIsEndDateEnabled(false);
                        setIsDateModified(true);
                      }}
                      title="Quitar fechas"
                      style={{
                        padding: 0,
                        minWidth: "auto",
                        width: "35px",
                        height: "35px",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        margin: 0,
                      }}
                    >
                      <IconClose style={{ width: 16, height: 16 }} />
                    </button>
                  </div>
                </div>
              ) : (
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                    marginTop: 4,
                  }}
                >
                  <input
                    type="date"
                    value={
                      climbDate ? climbDate.toISOString().slice(0, 10) : ""
                    }
                    onChange={(e) => {
                      setClimbDate(
                        e.target.value ? new Date(e.target.value) : new Date(),
                      );
                      setIsDateModified(true);
                    }}
                    max={new Date().toISOString().slice(0, 10)}
                    style={{
                      flex: 1,
                      padding: "0 12px",
                      margin: 0,
                      height: "35px",
                      boxSizing: "border-box",
                    }}
                  />
                  <button
                    type="button"
                    className="button button--quiet"
                    onClick={() => {
                      setIsDateUnknown(true);
                      setClimbDate(null);
                      setIsDateModified(true);
                    }}
                    title="Quitar fecha"
                    style={{
                      padding: 0,
                      minWidth: "auto",
                      width: "35px",
                      height: "35px",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      margin: 0,
                    }}
                  >
                    <IconClose style={{ width: 16, height: 16 }} />
                  </button>
                </div>
              )}
            </div>

            <div className="field-label" style={{ marginBottom: 13 }}>
              <span>Añadir fotos</span>
              <label
                className={`file-dropzone ${isPhotoLimitReached ? "file-dropzone--disabled" : ""}`}
                style={
                  isPhotoLimitReached
                    ? {
                      opacity: 0.45,
                      cursor: "not-allowed",
                      borderColor: "var(--muted)",
                      background: "rgba(0, 0, 0, 0.04)",
                    }
                    : undefined
                }
                title={
                  isPhotoLimitReached
                    ? "Máximo 4 fotos por registro. Ya has alcanzado el límite."
                    : undefined
                }
                onClick={(e) => {
                  if (isPhotoLimitReached) {
                    e.preventDefault();
                  }
                }}
                onDragOver={(e) => {
                  if (isPhotoLimitReached) {
                    e.preventDefault();
                  }
                }}
                onDrop={(e) => {
                  if (isPhotoLimitReached) {
                    e.preventDefault();
                    e.stopPropagation();
                  }
                }}
              >
                <IconCamera />
                <span className="file-dropzone-text">
                  <span className="hide-on-mobile">
                    {isPhotoLimitReached
                      ? "Límite alcanzado (máx. 4 fotos)"
                      : "Sube o arrastra tus fotos aquí"}
                  </span>
                  <span className="show-on-mobile">
                    {isPhotoLimitReached
                      ? "Máx. 4 fotos alcanzado"
                      : "Sube tus fotos aquí"}
                  </span>
                </span>
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={onFilesChanged}
                  disabled={isPhotoLimitReached}
                />
              </label>
            </div>

            {(existingRecordPhotos.length > 0 ||
              files.length > 0 ||
              galleryPhotosToAdd.length > 0) && (
                <div
                  style={{
                    marginTop: "12px",
                    display: "flex",
                    gap: "8px",
                    overflowX: "auto",
                    paddingBottom: "8px",
                  }}
                >
                  {existingRecordPhotos.map((photo) => (
                    <div
                      key={`existing-${photo.id}`}
                      style={{ position: "relative", display: "inline-block" }}
                    >
                      <img
                        src={photo.public_url}
                        alt="preview guardada"
                        style={{
                          width: "48px",
                          height: "48px",
                          objectFit: "cover",
                          borderRadius: "4px",
                          border: "1px solid var(--border)",
                        }}
                      />
                      <button
                        type="button"
                        onClick={() =>
                          setDeletedRecordPhotoIds((prev) => [...prev, photo.id])
                        }
                        title="Quitar foto del registro"
                        style={{
                          position: "absolute",
                          top: "2px",
                          right: "2px",
                          background: "#e74c3c",
                          color: "white",
                          width: "16px",
                          height: "16px",
                          borderRadius: "50%",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          border: "none",
                          cursor: "pointer",
                          padding: 0,
                          zIndex: 10,
                        }}
                      >
                        <IconClose style={{ width: 10, height: 10 }} />
                      </button>
                    </div>
                  ))}
                  {Array.from(files).map((file, i) => (
                    <div
                      key={`local-${i}`}
                      style={{ position: "relative", display: "inline-block" }}
                    >
                      <img
                        src={URL.createObjectURL(file)}
                        alt="preview local"
                        style={{
                          width: "48px",
                          height: "48px",
                          objectFit: "cover",
                          borderRadius: "4px",
                          border: "1px solid var(--border)",
                        }}
                      />
                      <button
                        type="button"
                        onClick={() =>
                          setFiles((prev) => prev.filter((_, idx) => idx !== i))
                        }
                        title="Quitar imagen"
                        style={{
                          position: "absolute",
                          top: "2px",
                          right: "2px",
                          background: "#e74c3c",
                          color: "white",
                          width: "16px",
                          height: "16px",
                          borderRadius: "50%",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          border: "none",
                          cursor: "pointer",
                          padding: 0,
                          zIndex: 10,
                        }}
                      >
                        <IconClose style={{ width: 10, height: 10 }} />
                      </button>
                    </div>
                  ))}
                  {galleryPhotosToAdd.map((p) => (
                    <div
                      key={`gallery-${p.id}`}
                      style={{ position: "relative", display: "inline-block" }}
                    >
                      <img
                        src={p.public_url}
                        alt="preview galeria"
                        style={{
                          width: "48px",
                          height: "48px",
                          objectFit: "cover",
                          borderRadius: "4px",
                          border: "1px solid var(--border)",
                        }}
                      />
                      <button
                        type="button"
                        onClick={() =>
                          setSelectedPhotosForEdit((prev) =>
                            prev.filter((x) => x !== p.id),
                          )
                        }
                        title="Quitar imagen"
                        style={{
                          position: "absolute",
                          top: "2px",
                          right: "2px",
                          background: "#e74c3c",
                          color: "white",
                          width: "16px",
                          height: "16px",
                          borderRadius: "50%",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          border: "none",
                          cursor: "pointer",
                          padding: 0,
                          zIndex: 10,
                        }}
                      >
                        <IconClose style={{ width: 10, height: 10 }} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            {totalModalPhotos > 0 && (
              <p
                className="file-count"
                style={{
                  marginTop: "4px",
                  color: isPhotoLimitReached ? "var(--muted)" : "var(--sage)",
                  fontSize: "12px",
                }}
              >
                {totalModalPhotos} / 4 fotos en este registro
                {files.length > 0 || galleryPhotosToAdd.length > 0
                  ? ` (${files.length + galleryPhotosToAdd.length} nueva${files.length + galleryPhotosToAdd.length !== 1 ? "s" : ""
                  } por guardar)`
                  : ""}
                .
              </p>
            )}

            <CompanionSelector
              mode={isPeaks ? "peaks" : isExp ? "experience" : "countries"}
              selectedCompanions={selectedCompanions}
              onChange={setSelectedCompanions}
              existingStatuses={companionStatuses}
            />

            <label className="field-label" style={{ marginBottom: 12 }}>
              Notas
              <textarea
                placeholder={
                  isExp
                    ? "Acompañantes, sensaciones ..."
                    : "Ciudades visitadas, experiencias, lo que quieras recordar..."
                }
                value={notes || ""}
                onChange={(e) => {
                  setNotes(e.target.value);
                }}
                rows={2}
              />
            </label>

            {(() => {
              const isRecordExp = Boolean(isExp || (selected as any)?.itemType === "experience");
              const linkPlaceholders = getLinkPlaceholders(isPeaks, isRecordExp);

              return (
                <>
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr 1fr",
                      gap: "12px",
                      marginBottom: Boolean(linkName && linkName.trim()) && !showSecondLink && !link2 && !linkName2 ? 8 : 16,
                    }}
                  >
                    <label className="field-label">
                      Enlace
                      <input
                        type="url"
                        placeholder="https://..."
                        value={link || ""}
                        onChange={(e) => {
                          setLink(e.target.value);
                          if (!e.target.value) {
                            setLinkName("");
                            setLink2("");
                            setLinkName2("");
                            setShowSecondLink(false);
                          }
                        }}
                      />
                    </label>
                    <label
                      className="field-label"
                      style={{ opacity: !link ? 0.5 : 1 }}
                    >
                      Texto del enlace
                      <input
                        type="text"
                        placeholder={linkPlaceholders.link1}
                        value={linkName || ""}
                        onChange={(e) => {
                          setLinkName(e.target.value);
                          if (!e.target.value && !link2 && !linkName2) {
                            setShowSecondLink(false);
                          }
                        }}
                        disabled={!link}
                        title={!link ? "Añade un enlace primero" : ""}
                      />
                    </label>
                  </div>

                  {/* Opción sutil para añadir un segundo enlace: solo visible cuando el texto del primero se ha introducido */}
                  {Boolean(linkName && linkName.trim()) && !showSecondLink && !link2 && !linkName2 && (
                    <div style={{ marginTop: -4, marginBottom: 16 }}>
                      <button
                        type="button"
                        onClick={() => setShowSecondLink(true)}
                        style={{
                          background: "none",
                          border: "none",
                          padding: "2px 0",
                          fontSize: "13px",
                          color: "var(--pine, #234e52)",
                          cursor: "pointer",
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 6,
                          fontWeight: 500,
                          opacity: 0.85,
                        }}
                      >
                        <span style={{ fontSize: "14px", fontWeight: 600 }}>+</span>
                        <span style={{ textDecoration: "underline", textUnderlineOffset: 2 }}>
                          Añadir un segundo enlace
                        </span>
                      </button>
                    </div>
                  )}

                  {(showSecondLink || Boolean(link2 || linkName2)) && (
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "1fr 1fr",
                        gap: "12px",
                        marginBottom: 16,
                      }}
                    >
                      <label className="field-label">
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                          <span>Segundo enlace</span>
                          <button
                            type="button"
                            onClick={() => {
                              setLink2("");
                              setLinkName2("");
                              setShowSecondLink(false);
                            }}
                            style={{
                              background: "none",
                              border: "none",
                              padding: 0,
                              fontSize: "11px",
                              color: "var(--danger, #a34f3d)",
                              cursor: "pointer",
                              fontWeight: 400,
                            }}
                            title="Quitar segundo enlace"
                          >
                            Quitar
                          </button>
                        </div>
                        <input
                          type="url"
                          placeholder="https://..."
                          value={link2 || ""}
                          onChange={(e) => {
                            setLink2(e.target.value);
                            if (!e.target.value) setLinkName2("");
                          }}
                        />
                      </label>
                      <label
                        className="field-label"
                        style={{ opacity: !link2 ? 0.5 : 1 }}
                      >
                        Texto del segundo enlace
                        <input
                          type="text"
                          placeholder={linkPlaceholders.link2}
                          value={linkName2 || ""}
                          onChange={(e) => setLinkName2(e.target.value)}
                          disabled={!link2}
                          title={!link2 ? "Añade un enlace primero" : ""}
                        />
                      </label>
                    </div>
                  )}
                </>
              );
            })()}

            <button
              className={`button ${isPeaks ? "button--green" : "button--purple"} button--wide`}
              disabled={saving}
              onClick={saveAscent}
            >
              {saving ? "Guardando…" : "Guardar en mi mapa"}
            </button>
            {originalAchievedOn && (
              <button
                className="button button--quiet button--wide"
                style={{ marginTop: 8, color: "var(--danger, #a34f3d)" }}
                disabled={saving}
                onClick={deleteAscent}
              >
                Eliminar registro
              </button>
            )}
          </section>
        </div>
      )}

      {/* ── Auth dialog ─────────────────── */}
      {authOpen && (
        <AuthDialog
          onClose={() => setAuthOpen(false)}
          initialTab={authOpen === "login" ? "login" : "register"}
        />
      )}

      {/* ── Toast ───────────────────────── */}
      {notice && (
        <div className="toast" role="status">
          {notice}
        </div>
      )}

      {/* ── Lightbox ────────────────────── */}
      {lightboxPhoto && (
        <>
          <PhotoLightbox
            photos={currentPhotoGroup}
            currentIndex={lightboxIndex !== -1 ? lightboxIndex : 0}
            onIndexChange={(idx) => {
              if (currentPhotoGroup[idx]) {
                setLightboxPhoto(currentPhotoGroup[idx]);
              }
            }}
            onClose={() => {
              window.history.back();
            }}
            title={activeSelected?.title || ""}
            canEdit={!isReadOnly}
            onEditPhoto={(photo) => {
              setEditorPhoto(photo as any);
              window.history.pushState(null, "", "#editor");
            }}
            onEditCaption={(photo) => {
              setLightboxNewCaption(photo.caption || "");
              setLightboxCaptionModalOpen(true);
            }}
            onDeletePhoto={(photo) => {
              deletePhoto(photo as any);
            }}
          />

          {lightboxCaptionModalOpen &&
            typeof document !== "undefined" &&
            createPortal(
              <div
                className="modal-backdrop"
                style={{
                  position: "fixed",
                  inset: 0,
                  zIndex: 100050,
                  backgroundColor: "rgba(0, 0, 0, 0.75)",
                  backdropFilter: "blur(4px)",
                  WebkitBackdropFilter: "blur(4px)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  padding: "16px",
                }}
                onClick={() => setLightboxCaptionModalOpen(false)}
                onWheel={(e) => e.stopPropagation()}
              >
                <div
                  className="record-dialog"
                  role="dialog"
                  aria-modal="true"
                  style={{
                    width: "100%",
                    maxWidth: "460px",
                    padding: "24px",
                    background: "#ffffff",
                    borderRadius: "16px",
                    boxShadow: "0 12px 40px rgba(0, 0, 0, 0.4)",
                    color: "#1c2b24",
                    display: "flex",
                    flexDirection: "column",
                    gap: "16px",
                    overscrollBehavior: "contain",
                  }}
                  onClick={(e) => e.stopPropagation()}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                    }}
                  >
                    <h3
                      style={{
                        margin: 0,
                        fontSize: "18px",
                        fontWeight: "bold",
                        fontFamily: "var(--font-playfair, serif)",
                      }}
                    >
                      {lightboxPhoto?.caption
                        ? "Editar descripción"
                        : "Añadir descripción"}
                    </h3>
                    <button
                      type="button"
                      onClick={() => setLightboxCaptionModalOpen(false)}
                      aria-label="Cerrar modal"
                      style={{
                        background: "transparent",
                        border: "none",
                        cursor: "pointer",
                        color: "#666",
                        padding: "4px",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <IconClose style={{ width: 18, height: 18 }} />
                    </button>
                  </div>

                  <p
                    style={{
                      margin: 0,
                      fontSize: "13px",
                      color: "var(--muted, #666)",
                    }}
                  >
                    Escribe un pie de foto o recuerdo para esta fotografía.
                  </p>

                  <textarea
                    autoFocus
                    placeholder="Añade una descripción..."
                    value={lightboxNewCaption}
                    onChange={(e) => setLightboxNewCaption(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                        e.preventDefault();
                        handleSaveCaption();
                      } else if (e.key === "Escape") {
                        e.preventDefault();
                        e.stopPropagation();
                        setLightboxCaptionModalOpen(false);
                      }
                    }}
                    style={{
                      width: "100%",
                      padding: "10px 14px",
                      borderRadius: "8px",
                      border: "1px solid var(--border, #dce4da)",
                      minHeight: "110px",
                      resize: "vertical",
                      fontSize: "14px",
                      fontFamily: "inherit",
                      color: "inherit",
                      boxSizing: "border-box",
                      outline: "none",
                    }}
                  />

                  <div
                    style={{
                      display: "flex",
                      justifyContent: "flex-end",
                      gap: "10px",
                      marginTop: "4px",
                    }}
                  >
                    <button
                      type="button"
                      className="button button--quiet"
                      onClick={() => setLightboxCaptionModalOpen(false)}
                      disabled={saving}
                      style={{ minWidth: "90px" }}
                    >
                      Cancelar
                    </button>
                    <button
                      type="button"
                      className="button"
                      style={{
                        backgroundColor: "var(--pine, #2E5C4B)",
                        color: "#ffffff",
                        minWidth: "100px",
                      }}
                      onClick={handleSaveCaption}
                      disabled={saving}
                    >
                      {saving ? "Guardando..." : "Guardar"}
                    </button>
                  </div>
                </div>
              </div>,
              document.body,
            )}
        </>
      )}

      {selectedPhotosForEdit.length > 0 && (
        <div
          className="photo-batch-bar"
          style={{
            position: "fixed",
            bottom: "25px",
            left: "50%",
            transform: "translateX(-50%)",
            zIndex: 100050,
            background: "#18342d",
            padding: "12px 24px",
            borderRadius: "100px",
            display: "flex",
            alignItems: "center",
            gap: "20px",
            boxShadow: "0 8px 30px rgba(0,0,0,0.3)",
            color: "white",
            animation: "fadeUp 0.3s ease",
            pointerEvents: "auto",
          }}
        >
          <span style={{ fontSize: "14px", fontWeight: 500 }}>
            <span className="hide-on-mobile">Seleccionadas: </span>
            {selectedPhotosForEdit.length}
          </span>

          <button
            title="Asignar o mover a registro"
            onClick={() => {
              if (selectedPhotosForEdit.length > 4) {
                setNotice("No puedes asignar más de 4 fotos a un registro.");
                setTimeout(() => setNotice(""), 3000);
                return;
              }
              setAssignToRecordModalOpen(true);
            }}
            className="photo-batch-action"
            style={
              selectedPhotosForEdit.length > 4
                ? { opacity: 0.5, cursor: "not-allowed" }
                : {}
            }
          >
            <IconFolderMove style={{ width: 16, height: 16 }} />
            <span className="hide-on-mobile">Mover</span>
          </button>
          <button
            title="Eliminar"
            onClick={handleBatchDeletePhotos}
            className="photo-batch-action danger-icon"
          >
            <IconTrash style={{ width: 16, height: 16 }} />
            <span className="hide-on-mobile">Eliminar</span>
          </button>
          <button
            title="Cancelar"
            onClick={() => setSelectedPhotosForEdit([])}
            className="photo-batch-action ghost"
          >
            <IconClose style={{ width: 18, height: 18 }} />
            <span className="hide-on-mobile">Cancelar</span>
          </button>
        </div>
      )}

      {assignToRecordModalOpen && (
        <div
          className="modal-backdrop"
          onClick={() => setAssignToRecordModalOpen(false)}
          onWheel={(e) => e.stopPropagation()}
          style={{ zIndex: 100060 }}
        >
          <div className="auth-dialog" onClick={(e) => e.stopPropagation()} onWheel={(e) => e.stopPropagation()} style={{ overscrollBehavior: "contain" }}>
            <h2>Asignar a registro</h2>
            <p
              style={{
                color: "var(--muted)",
                fontSize: "14px",
                marginBottom: "20px",
              }}
            >
              Selecciona el registro al que asignar{" "}
              {selectedPhotosForEdit.length} foto
              {selectedPhotosForEdit.length !== 1 ? "s" : ""}:
            </p>
            <div
              style={{ display: "flex", flexDirection: "column", gap: "8px" }}
            >
              {selectedAscents.length > 0 ? (
                selectedAscents.map((ascent) => (
                  <button
                    key={ascent.achieved_on}
                    className="button button--outline button--wide"
                    style={{
                      textAlign: "left",
                      justifyContent: "flex-start",
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                    }}
                    onClick={() => handleAssignPhotosToRecord(ascent.achieved_on)}
                    disabled={saving}
                  >
                    <Check size={14} strokeWidth={2.5} />
                    <span>{formatDate(ascent.achieved_on)}</span>
                  </button>
                ))
              ) : (
                <p style={{ color: "var(--muted)", fontSize: "13px", margin: "4px 0 8px" }}>
                  Aún no tienes registros guardados en esta ubicación.
                </p>
              )}
              <button
                className="button button--outline button--wide"
                style={{
                  textAlign: "left",
                  justifyContent: "flex-start",
                  borderStyle: "dashed",
                }}
                onClick={() => {
                  setAssignToRecordModalOpen(false);
                  openRecord(selected, undefined);
                }}
                disabled={saving}
              >
                + Crear nuevo registro
              </button>
            </div>
            <button
              className="button button--quiet button--wide"
              style={{ marginTop: "16px" }}
              onClick={() => setAssignToRecordModalOpen(false)}
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {editorPhoto && (
        <PhotoEditor
          imageUrl={editorPhoto.public_url}
          onSave={handleSaveEditedPhoto}
          onCancel={() => window.history.back()}
        />
      )}

      {/* ── Modals ──────────────────────── */}
      {authOpen && (
        <AuthDialog
          onClose={() => setAuthOpen(false)}
          initialTab={authOpen === "login" ? "login" : "register"}
        />
      )}
      {profileOpen && session && (
        <ProfileSettings
          session={session}
          onProfileUpdate={(p) => {
            setMyProfile((prev) => ({ ...prev, ...p }));
            refreshProfile();
            if (p.enable_experiences === false) {
              setExperiencesMode(false);
              onToggleExperiences?.(false);
            }
            if (p.enable_peaks === false && currentMode === "peaks") {
              switchMode("countries");
            }
            if (p.enable_countries === false) {
              if (experiencesMode) {
                setExperiencesMode(false);
                onToggleExperiences?.(false);
              }
              if (currentMode === "countries") {
                switchMode("peaks");
              }
            }
          }}
          onClose={() => setProfileOpen(false)}
        />
      )}
      {statsOpen && (
        <StatsModal
          session={session}
          myProfile={myProfile}
          targetProfile={targetProfile}
          ascents={ascents}
          experienceRecords={experienceRecords}
          customExperiences={customExperiences}
          customCategories={customCategories}
          photos={photos}
          photosCount={photos?.length}
          initialMode={isExp ? "experiences" : isPeaks ? "peaks" : "countries"}
          onModeChange={(mode) => {
            if (mode === "peaks") {
              if (canShowPeaks) {
                setCurrentMode("peaks");
                setExperiencesMode(false);
                localStorage.setItem("last_active_mode", "peaks");
                localStorage.setItem("last_map_path", "/picos");
                const currentHash = window.location.hash || "#estadisticas";
                window.history.replaceState(null, "", `/picos${currentHash}`);
              }
            } else if (mode === "countries") {
              if (canShowCountries) {
                setCurrentMode("countries");
                setExperiencesMode(false);
                localStorage.setItem("last_active_mode", "countries");
                localStorage.setItem("last_map_path", "/");
                const currentHash = window.location.hash || "#estadisticas";
                window.history.replaceState(null, "", `/${currentHash}`);
              }
            } else if (mode === "experiences") {
              if (canShowCountries) {
                setCurrentMode("countries");
                setExperiencesMode(true);
              }
            }
          }}
          onClose={() => {
            if (
              window.location.hash === "#estadisticas" ||
              window.location.hash === "#galeria" ||
              window.location.hash === "#lightbox"
            ) {
              window.history.back();
            }
            setStatsOpen(false);
          }}
          onGoToRecord={(summitId) => {
            const loc = getLocationInfo(summitId);
            const cleanId = summitId.split("::")[0];
            const subItemId = summitId.includes("::") ? summitId.split("::")[1] : undefined;
            const isPeak =
              loc.type === "peak" ||
              peaks.some(
                (p) =>
                  p.id === cleanId ||
                  p.name.toLowerCase() === cleanId.toLowerCase()
              );

            if (isPeak && !isPeaks) {
              if (canShowPeaks) setCurrentMode("peaks");
            } else if (!isPeak && isPeaks) {
              if (canShowCountries) setCurrentMode("countries");
            }

            if (loc.type === "experience") {
              setExperiencesMode(true);
            }

            panelOpenedFromStatsRef.current = true;
            panelPushedRef.current = true;

            // Synchronously resolve and select item to avoid intermediate frames where panel is absent
            let item: SelectedItem | undefined = allItems.find(
              (i) => i.id === cleanId || i.id === summitId
            );
            if (!item && isPeak) {
              const matchedPeak = peaks.find(
                (p) =>
                  p.id === cleanId ||
                  p.name.toLowerCase() === cleanId.toLowerCase()
              );
              if (matchedPeak) {
                item = peakToItem(matchedPeak);
              }
            } else if (!item && loc.type === "experience") {
              for (const cat of predefinedCategories) {
                const exp = cat.experiences.find((e) => e.id === cleanId);
                if (exp) {
                  item = {
                    id: exp.id,
                    title: exp.name,
                    subtitle: "",
                    label: "",
                    detail: cat.name,
                    note: "",
                    iconName: cat.iconName,
                    subItems: exp.subItems,
                    itemType: "experience",
                  };
                  break;
                }
              }
              if (!item) {
                const custom = customExperiences.find((e) => e.id === cleanId);
                if (custom) {
                  item = {
                    id: custom.id,
                    title: custom.name,
                    subtitle: "",
                    label: "",
                    detail: "Personalizado",
                    note: "",
                    iconName: "Compass",
                    subItems: (custom as any).subItems,
                    itemType: "experience",
                  };
                }
              }
            } else if (!item) {
              const matchedCountry = countries.find(
                (c) =>
                  c.id === cleanId ||
                  c.name.toLowerCase() === cleanId.toLowerCase() ||
                  c.iso_a2.toLowerCase() === cleanId.toLowerCase()
              );
              if (matchedCountry) {
                item = countryToItem(matchedCountry);
              }
            }
            if (item) {
              const selectedItem = subItemId ? { ...item, sub_item_id: subItemId } : item;
              setSelected(selectedItem);
            }

            setPanelIdToOpen(cleanId);
            const targetHash = `#panel=${encodeURIComponent(cleanId)}`;
            const targetPath = isPeak ? `/picos${targetHash}` : `/${targetHash}`;
            if (window.location.pathname !== (isPeak ? "/picos" : "/")) {
              window.history.pushState({ hasPanel: true, fromStats: true }, "", targetPath);
            } else {
              window.history.pushState({ hasPanel: true, fromStats: true }, "", targetHash);
            }
            window.dispatchEvent(new Event("hashchange"));
          }}
        />
      )}
      <ConfirmModal
        isOpen={!!confirmConfig?.isOpen}
        message={confirmConfig?.message || ""}
        onConfirm={() => {
          if (confirmConfig?.onConfirm) confirmConfig.onConfirm();
          setConfirmConfig(null);
        }}
        onCancel={() => setConfirmConfig(null)}
      />

      {/* ── PWA Install Prompt ────────── */}
      <InstallPrompt manualOpen={installPromptOpen} onManualClose={() => setInstallPromptOpen(false)} />
      {/* ── Experience Selector Modal ───── */}
      {expSelectorOpen && (
        <div
          className="modal-backdrop"
          onClick={() => setExpSelectorOpen(false)}
          onWheel={(e) => e.stopPropagation()}
        >
          <div
            className="auth-dialog"
            onClick={(e) => e.stopPropagation()}
            onWheel={(e) => e.stopPropagation()}
            style={{ width: "100%", maxWidth: 500, padding: 0, overscrollBehavior: "contain" }}
          >
            <div
              className="modal-header"
              style={{
                padding: "20px 24px",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <h3 style={{ margin: 0, paddingRight: 32 }}>
                Elige una categoría
              </h3>
              <button
                className="icon-button"
                onClick={() => setExpSelectorOpen(false)}
              >
                <IconClose />
              </button>
            </div>
            <div
              style={{
                maxHeight: "60vh",
                overflowY: "auto",
                overscrollBehavior: "contain",
                padding: "0 24px 20px 24px",
                display: "flex",
                flexDirection: "column",
                gap: 8,
              }}
            >
              {dynamicCategories.map((cat) => {
                const isCustom =
                  cat.id.startsWith("cat-custom-") ||
                  customCategories.some((c) => c.id === cat.id);
                const isExpanded = expandedExpCategory === cat.id;
                return (
                  <div
                    key={cat.id}
                    style={{ display: "flex", flexDirection: "column", gap: 8 }}
                  >
                    <button
                      className="button button--outline"
                      style={{
                        justifyContent: "flex-start",
                        padding: "12px 16px",
                        fontWeight: 500,
                        width: "100%",
                      }}
                      onClick={() =>
                        setExpandedExpCategory(isExpanded ? null : cat.id)
                      }
                    >
                      <span
                        style={{
                          marginRight: 12,
                          color: "var(--pine)",
                          display: "flex",
                        }}
                      >
                        {cat.iconName && getIconComponent(cat.iconName, 18)}
                      </span>
                      {cat.name}
                    </button>

                    {isExpanded && (
                      <div style={{ padding: "4px 0 12px 16px" }}>
                        <div
                          style={{
                            display: "flex",
                            flexDirection: "column",
                            gap: 8,
                          }}
                        >
                          {cat.experiences.map((exp) => {
                            const isCustomExp =
                              !exp.id.startsWith("exp-") ||
                              customExperiences.some((c) => c.id === exp.id);
                            return (
                              <div key={exp.id} style={{ marginBottom: "8px" }}>
                                {!exp.subItems ? (
                                  <div style={{ display: "flex", gap: 6 }}>
                                    <button
                                      className="button"
                                      style={{
                                        flex: 1,
                                        justifyContent: "space-between",
                                        alignItems: "center",
                                        textAlign: "left",
                                        padding: "12px 16px",
                                        background: "var(--background)",
                                        color: "var(--foreground)",
                                        border: "1px solid var(--border)",
                                        borderRadius: "8px",
                                        fontWeight: 500,
                                        boxShadow: "0 2px 4px rgba(0,0,0,0.02)",
                                        transition: "all 0.2s ease",
                                      }}
                                      onMouseEnter={(e) => {
                                        e.currentTarget.style.borderColor =
                                          "var(--pine)";
                                        e.currentTarget.style.transform =
                                          "translateY(-1px)";
                                        e.currentTarget.style.boxShadow =
                                          "0 4px 8px rgba(0,0,0,0.05)";
                                      }}
                                      onMouseLeave={(e) => {
                                        e.currentTarget.style.borderColor =
                                          "var(--border)";
                                        e.currentTarget.style.transform =
                                          "none";
                                        e.currentTarget.style.boxShadow =
                                          "0 2px 4px rgba(0,0,0,0.02)";
                                      }}
                                      onClick={() => {
                                        selectingFromRecordRef.current = false;
                                        setSelectingLocationForExp(
                                          `${exp.id}::`,
                                        );
                                        setExpSelectorOpen(false);
                                      }}
                                    >
                                      {exp.name}
                                      <svg
                                        viewBox="0 0 24 24"
                                        fill="none"
                                        stroke="var(--pine)"
                                        strokeWidth="2"
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        style={{
                                          width: 16,
                                          height: 16,
                                          opacity: 0.7,
                                        }}
                                      >
                                        <circle cx="12" cy="12" r="10"></circle>
                                        <polyline points="12 16 16 12 12 8"></polyline>
                                        <line
                                          x1="8"
                                          y1="12"
                                          x2="16"
                                          y2="12"
                                        ></line>
                                      </svg>
                                    </button>
                                  </div>
                                ) : (
                                  <div
                                    style={{
                                      padding: "14px",
                                      border: "1px solid var(--border)",
                                      borderRadius: "10px",
                                      background: "var(--background)",
                                      boxShadow: "0 2px 8px rgba(0,0,0,0.03)",
                                    }}
                                  >
                                    <div
                                      style={{
                                        display: "flex",
                                        justifyContent: "space-between",
                                        alignItems: "center",
                                        marginBottom: 12,
                                      }}
                                    >
                                      <div
                                        style={{
                                          fontWeight: 600,
                                          fontSize: "0.95rem",
                                          color: "var(--foreground)",
                                        }}
                                      >
                                        {exp.name}
                                      </div>
                                    </div>
                                    <div
                                      style={{
                                        display: "grid",
                                        gridTemplateColumns:
                                          "repeat(auto-fill, minmax(130px, 1fr))",
                                        gap: 8,
                                      }}
                                    >
                                      {exp.subItems.map((item: any) => (
                                        <button
                                          key={item.id}
                                          className="button button--outline button--small"
                                          style={{
                                            justifyContent: "center",
                                            transition: "all 0.2s",
                                          }}
                                          onClick={() => {
                                            selectingFromRecordRef.current = false;
                                            setSelectingLocationForExp(
                                              `${exp.id}::${item.id}`,
                                            );
                                            setExpSelectorOpen(false);
                                          }}
                                        >
                                          {item.name}
                                        </button>
                                      ))}
                                    </div>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {showTrashModal && (
        <div
          className="modal-backdrop"
          onClick={() => setShowTrashModal(false)}
          onWheel={(e) => e.stopPropagation()}
        >
          <div
            className="auth-dialog"
            onClick={(e) => e.stopPropagation()}
            onWheel={(e) => e.stopPropagation()}
            style={{ width: "100%", maxWidth: 500, padding: 0, overscrollBehavior: "contain" }}
          >
            <div
              className="modal-header"
              style={{
                padding: "20px 24px",
                borderBottom: "1px solid var(--border)",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <h3 style={{ margin: 0 }}>Papelera</h3>
              <button
                className="icon-button"
                onClick={() => setShowTrashModal(false)}
              >
                <IconClose />
              </button>
            </div>
            <div
              className="modal-body"
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 12,
                padding: "20px 24px",
                maxHeight: "60vh",
                overflowY: "auto",
              }}
            >
              {hiddenItems.length === 0 ? (
                <p style={{ color: "var(--muted)", textAlign: "center" }}>
                  La papelera está vacía.
                </p>
              ) : (
                hiddenItems.map((item) => {
                  let isStatic = false;
                  let name = "Desconocido";
                  let icon = "help-circle";
                  if (item.item_type === "category") {
                    const staticCat = predefinedCategories.find(
                      (c) => c.id === item.item_id,
                    );
                    const customCat = customCategories.find(
                      (c) => c.id === item.item_id,
                    );
                    if (staticCat) {
                      isStatic = true;
                      name = staticCat.name;
                      icon = staticCat.iconName;
                    } else if (customCat) {
                      name = customCat.name;
                      icon = customCat.icon_name;
                    } else {
                      name = item.item_id;
                      icon = "star";
                    }
                  } else {
                    const customExp = customExperiences.find(
                      (e) => e.id === item.item_id,
                    );
                    if (customExp) {
                      name = customExp.name;
                      if (customExp.category_id) {
                        const parentCat = customCategories.find((c) => c.id === customExp.category_id);
                        if (parentCat) icon = parentCat.icon_name;
                      } else if (customExp.static_category_id) {
                        const parentCat = predefinedCategories.find((c) => c.id === customExp.static_category_id);
                        if (parentCat) icon = parentCat.iconName;
                      }
                    } else {
                      for (const c of predefinedCategories) {
                        const ex = c.experiences.find(
                          (e) => e.id === item.item_id,
                        );
                        if (ex) {
                          name = ex.name;
                          icon = c.iconName;
                          isStatic = true;
                          break;
                        }
                      }
                    }
                  }

                  return (
                    <div
                      key={item.id}
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        padding: "12px 16px",
                        background: "var(--background)",
                        border: "1px solid var(--border)",
                        borderRadius: 8,
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 12,
                          flex: 1,
                          minWidth: 0,
                        }}
                      >
                        <div style={{ flexShrink: 0 }}>{getIconComponent(icon)}</div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div
                            style={{
                              fontWeight: 500,
                              whiteSpace: "nowrap",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                            }}
                          >
                            {name}
                          </div>
                          <div
                            style={{
                              fontSize: "0.8rem",
                              color: "var(--muted)",
                            }}
                          >
                            {item.item_type === "category"
                              ? "Categoría"
                              : "Experiencia"}
                          </div>
                        </div>
                      </div>
                      <div style={{ display: "flex", gap: 6, marginLeft: 12 }}>
                        <button
                          className="button button--quiet button--small"
                          disabled={saving}
                          onClick={() => handleRestoreHiddenItem(item.id)}
                          style={{ padding: "6px", minWidth: "auto", height: "auto" }}
                          title="Restaurar"
                        >
                          <RotateCcw size={16} />
                        </button>
                        {!isStatic && (
                          <button
                            className="button button--quiet button--small"
                            disabled={saving}
                            style={{ color: "var(--danger, #a34f3d)", padding: "6px", minWidth: "auto", height: "auto" }}
                            onClick={() => handlePermanentDelete(item)}
                            title="Eliminar permanentemente"
                          >
                            <IconTrash style={{ width: 16, height: 16 }} />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}

      {editingCustomCategory && (
        <div
          className="modal-backdrop"
          onClick={() => {
            setEditingCustomCategory(null);
          }}
          onWheel={(e) => e.stopPropagation()}
        >
          <div
            className="auth-dialog"
            onClick={(e) => e.stopPropagation()}
            onWheel={(e) => e.stopPropagation()}
            style={{ width: "100%", maxWidth: 400, padding: 0, overscrollBehavior: "contain" }}
          >
            <div
              className="modal-header"
              style={{
                padding: "20px 24px",
                borderBottom: "1px solid var(--border)",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <h3 style={{ margin: 0 }}>
                {editingCustomCategory.id === "new"
                  ? "Crear Categoría"
                  : "Editar Categoría"}
              </h3>
              <button
                className="icon-button"
                onClick={() => {
                  setEditingCustomCategory(null);
                }}
              >
                <IconClose />
              </button>
            </div>
            <div
              className="modal-body"
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 16,
                padding: "20px 24px",
              }}
            >
              <div>
                <label
                  style={{ display: "block", marginBottom: 8, fontWeight: 500 }}
                >
                  Nombre de la Categoría
                </label>
                <input
                  type="text"
                  value={editingCustomCategory.name || ""}
                  onChange={(e) =>
                    setEditingCustomCategory({
                      ...editingCustomCategory,
                      name: e.target.value,
                    })
                  }
                  placeholder="Ej. Deporte, Hitos personales..."
                  style={{
                    width: "100%",
                    padding: "8px 12px",
                    borderRadius: 8,
                    border: "1px solid var(--border)",
                    background: "var(--background)",
                    color: "var(--foreground)",
                  }}
                />
              </div>
              <div>
                <label
                  style={{ display: "block", marginBottom: 8, fontWeight: 500 }}
                >
                  Icono
                </label>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fill, minmax(44px, 1fr))",
                    gap: 10,
                  }}
                >
                  {[
                    "mountain",
                    "tree",
                    "waves",
                    "sun",
                    "paw",
                    "plane",
                    "rocket",
                    "compass",
                    "map",
                    "tent",
                    "telescope",
                    "home",
                    "building",
                    "landmark",
                    "store",
                    "camera",
                    "dumbbell",
                    "utensils",
                    "book",
                    "trophy",
                    "user",
                    "heart",
                    "circle-dot",
                    "star",
                  ].map((iconValue) => (
                    <button
                      key={iconValue}
                      type="button"
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        width: "100%",
                        aspectRatio: "1",
                        borderRadius: 10,
                        border:
                          (editingCustomCategory.icon_name || "star") ===
                            iconValue
                            ? "2px solid var(--pine)"
                            : "1px solid var(--border)",
                        background:
                          (editingCustomCategory.icon_name || "star") ===
                            iconValue
                            ? "var(--surface)"
                            : "var(--background)",
                        color:
                          (editingCustomCategory.icon_name || "star") ===
                            iconValue
                            ? "var(--pine)"
                            : "var(--foreground)",
                        cursor: "pointer",
                        transition: "all 0.2s ease",
                      }}
                      onClick={() =>
                        setEditingCustomCategory({
                          ...editingCustomCategory,
                          icon_name: iconValue,
                        })
                      }
                      onMouseEnter={(e) => {
                        if (
                          (editingCustomCategory.icon_name || "star") !==
                          iconValue
                        )
                          e.currentTarget.style.borderColor = "var(--pine)";
                        e.currentTarget.style.transform = "translateY(-2px)";
                      }}
                      onMouseLeave={(e) => {
                        if (
                          (editingCustomCategory.icon_name || "star") !==
                          iconValue
                        )
                          e.currentTarget.style.borderColor = "var(--border)";
                        e.currentTarget.style.transform = "none";
                      }}
                    >
                      <span
                        style={{
                          width: 20,
                          height: 20,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        {getIconComponent(iconValue)}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div
              className="modal-footer"
              style={{
                padding: "20px 24px",
                borderTop: "1px solid var(--border)",
                display: "flex",
                gap: 8,
                justifyContent: "space-between",
              }}
            >
              {editingCustomCategory.id !== "new" ? (
                <button
                  className="button button--quiet"
                  style={{ color: "var(--danger, #a34f3d)" }}
                  disabled={saving}
                  onClick={handleDeleteCustomCategory}
                >
                  Eliminar
                </button>
              ) : (
                <div></div>
              )}
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  className="button button--outline"
                  onClick={() => {
                    setEditingCustomCategory(null);
                  }}
                >
                  Cancelar
                </button>
                <button
                  className="button"
                  disabled={saving || !editingCustomCategory.name?.trim()}
                  onClick={handleSaveCustomCategory}
                >
                  {saving ? "Guardando..." : "Guardar"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {selectingCategoryForNewExp && (
        <div
          className="modal-backdrop"
          onClick={() => setSelectingCategoryForNewExp(false)}
          onWheel={(e) => e.stopPropagation()}
        >
          <div
            className="auth-dialog"
            onClick={(e) => e.stopPropagation()}
            onWheel={(e) => e.stopPropagation()}
            style={{ width: "100%", maxWidth: 400, padding: 0, overscrollBehavior: "contain" }}
          >
            <div
              className="modal-header"
              style={{
                padding: "20px 24px",
                borderBottom: "1px solid var(--border)",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <h3 style={{ margin: 0 }}>Elige una categoría</h3>
              <button
                className="icon-button"
                onClick={() => setSelectingCategoryForNewExp(false)}
              >
                <IconClose />
              </button>
            </div>
            <div
              className="modal-body"
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 8,
                padding: "20px 24px",
                maxHeight: "60vh",
                overflowY: "auto",
              }}
            >
              {dynamicCategories.map((cat) => (
                <button
                  key={cat.id}
                  className="button button--outline"
                  style={{
                    justifyContent: "flex-start",
                    padding: "12px 16px",
                    fontWeight: 500,
                  }}
                  onClick={() => {
                    const isPseudoCat = cat.id.startsWith("cat-custom-");
                    const isCustomCat = customCategories.some((c) => c.id === cat.id);
                    setEditingCustomExp(
                      isPseudoCat
                        ? { id: "new", name: "", category_id: null, static_category_id: null }
                        : isCustomCat
                          ? { id: "new", name: "", category_id: cat.id }
                          : { id: "new", name: "", static_category_id: cat.id },
                    );
                    setSelectingCategoryForNewExp(false);
                  }}
                >
                  <span
                    style={{
                      marginRight: 12,
                      color: "var(--pine)",
                      display: "flex",
                    }}
                  >
                    {cat.iconName && getIconComponent(cat.iconName, 18)}
                  </span>
                  {cat.name}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {editingCustomExp && (
        <div
          className="modal-backdrop"
          onClick={() => {
            setEditingCustomExp(null);
          }}
          onWheel={(e) => e.stopPropagation()}
        >
          <div
            className="auth-dialog"
            onClick={(e) => e.stopPropagation()}
            onWheel={(e) => e.stopPropagation()}
            style={{ width: "100%", maxWidth: 400, padding: 0, overscrollBehavior: "contain" }}
          >
            <div
              className="modal-header"
              style={{
                padding: "20px 24px",
                borderBottom: "1px solid var(--border)",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <h3 style={{ margin: 0 }}>
                {editingCustomExp.id === "new"
                  ? "Crear Experiencia"
                  : "Editar Experiencia"}
              </h3>
              <button
                className="icon-button"
                onClick={() => {
                  setEditingCustomExp(null);
                }}
              >
                <IconClose />
              </button>
            </div>
            <div
              className="modal-body"
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 16,
                padding: "20px 24px",
              }}
            >
              <div>
                <label
                  style={{ display: "block", marginBottom: 8, fontWeight: 500 }}
                >
                  Nombre
                </label>
                <input
                  type="text"
                  value={editingCustomExp.name || ""}
                  onChange={(e) =>
                    setEditingCustomExp({
                      ...editingCustomExp,
                      name: e.target.value,
                    })
                  }
                  placeholder="Ej. Bucear con tiburones..."
                  style={{
                    width: "100%",
                    padding: "8px 12px",
                    borderRadius: 8,
                    border: "1px solid var(--border)",
                    background: "var(--background)",
                    color: "var(--foreground)",
                  }}
                />
              </div>
              <div>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    marginBottom: 8,
                  }}
                >
                  <label style={{ margin: 0, fontWeight: 500 }}>
                    Mini-experiencias
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      const current =
                        editingCustomExp.sub_items_input !== undefined
                          ? editingCustomExp.sub_items_input
                          : editingCustomExp.subItems ||
                            editingCustomExp.sub_items
                            ? (
                              editingCustomExp.subItems ||
                              editingCustomExp.sub_items
                            )
                              .map((s: any) => s.name)
                              .join("\n")
                            : "";
                      const hasMiniExperiences =
                        editingCustomExp.has_sub_items !== undefined
                          ? editingCustomExp.has_sub_items
                          : current.length > 0;

                      if (hasMiniExperiences) {
                        setEditingCustomExp({
                          ...editingCustomExp,
                          has_sub_items: false,
                          sub_items_input: "",
                        });
                      } else {
                        setEditingCustomExp({
                          ...editingCustomExp,
                          has_sub_items: true,
                          sub_items_input: "",
                        });
                      }
                    }}
                    style={{
                      width: 44,
                      height: 24,
                      borderRadius: 12,
                      background: (
                        editingCustomExp.has_sub_items !== undefined
                          ? editingCustomExp.has_sub_items
                          : (editingCustomExp.sub_items_input !== undefined
                            ? editingCustomExp.sub_items_input
                            : editingCustomExp.subItems ||
                              editingCustomExp.sub_items
                              ? (
                                editingCustomExp.subItems ||
                                editingCustomExp.sub_items
                              )
                                .map((s: any) => s.name)
                                .join("\n")
                              : ""
                          ).length > 0
                      )
                        ? "var(--pine)"
                        : "#71717a",
                      position: "relative",
                      border: "none",
                      cursor: "pointer",
                      transition: "background 0.2s",
                    }}
                  >
                    <div
                      style={{
                        position: "absolute",
                        top: 2,
                        left: (
                          editingCustomExp.has_sub_items !== undefined
                            ? editingCustomExp.has_sub_items
                            : (editingCustomExp.sub_items_input !== undefined
                              ? editingCustomExp.sub_items_input
                              : editingCustomExp.subItems ||
                                editingCustomExp.sub_items
                                ? (
                                  editingCustomExp.subItems ||
                                  editingCustomExp.sub_items
                                )
                                  .map((s: any) => s.name)
                                  .join("\n")
                                : ""
                            ).length > 0
                        )
                          ? 22
                          : 2,
                        width: 20,
                        height: 20,
                        background: "white",
                        borderRadius: "50%",
                        transition: "left 0.2s",
                        boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
                      }}
                    />
                  </button>
                </div>

                {(() => {
                  const currentSubItemsStr =
                    editingCustomExp.sub_items_input !== undefined
                      ? editingCustomExp.sub_items_input
                      : editingCustomExp.subItems || editingCustomExp.sub_items
                        ? (
                          editingCustomExp.subItems ||
                          editingCustomExp.sub_items
                        )
                          .map((s: any) => s.name)
                          .join("\n")
                        : "";
                  const hasMiniExperiences =
                    editingCustomExp.has_sub_items !== undefined
                      ? editingCustomExp.has_sub_items
                      : currentSubItemsStr.length > 0;
                  const miniExpList = hasMiniExperiences
                    ? currentSubItemsStr
                      ? currentSubItemsStr.split("\n")
                      : [""]
                    : [];

                  if (!hasMiniExperiences) return null;

                  return (
                    <div
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: 8,
                        marginTop: 12,
                      }}
                    >
                      {miniExpList.map((item: string, idx: number) => (
                        <div key={idx} style={{ display: "flex", gap: 8 }}>
                          <input
                            type="text"
                            value={item}
                            placeholder={`Mini-experiencia ${idx + 1}`}
                            onChange={(e) => {
                              const newList = [...miniExpList];
                              newList[idx] = e.target.value;
                              setEditingCustomExp({
                                ...editingCustomExp,
                                sub_items_input: newList.join("\n"),
                                has_sub_items: true,
                              });
                            }}
                            style={{
                              flex: 1,
                              padding: "8px 12px",
                              borderRadius: 8,
                              border: "1px solid var(--border)",
                              background: "var(--background)",
                              color: "var(--foreground)",
                            }}
                          />
                          <button
                            type="button"
                            onClick={() => {
                              const newList = [...miniExpList];
                              newList.splice(idx, 1);
                              setEditingCustomExp({
                                ...editingCustomExp,
                                sub_items_input: newList.join("\n"),
                                has_sub_items: true,
                              });
                            }}
                            style={{
                              width: 36,
                              height: 36,
                              color: "var(--danger, #a34f3d)",
                              flexShrink: 0,
                              background: "transparent",
                              border: "none",
                              cursor: "pointer",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                            }}
                            title="Eliminar mini experiencia"
                          >
                            <svg
                              width="18"
                              height="18"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            >
                              <polyline points="3 6 5 6 21 6"></polyline>
                              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                            </svg>
                          </button>
                        </div>
                      ))}
                      <button
                        type="button"
                        onClick={() => {
                          const newList = [...miniExpList, ""];
                          setEditingCustomExp({
                            ...editingCustomExp,
                            sub_items_input: newList.join("\n"),
                            has_sub_items: true,
                          });
                        }}
                        className="button button--outline button--small"
                        style={{ alignSelf: "flex-start", marginTop: 4 }}
                      >
                        + Añadir mini experiencia
                      </button>
                    </div>
                  );
                })()}
              </div>
            </div>
            <div
              className="modal-footer"
              style={{
                padding: "20px 24px",
                borderTop: "1px solid var(--border)",
                display: "flex",
                gap: 8,
                justifyContent: "space-between",
              }}
            >
              {editingCustomExp.id !== "new" ? (
                <button
                  className="button button--quiet"
                  style={{ color: "var(--danger, #a34f3d)" }}
                  disabled={saving}
                  onClick={() => {
                    const isCustom = customExperiences.some(
                      (c) => c.id === editingCustomExp.id,
                    );
                    if (isCustom) {
                      handleDeleteCustomExperience(editingCustomExp.id);
                    } else {
                      handleHideItem(editingCustomExp.id, "experience");
                    }
                    setEditingCustomExp(null);
                  }}
                >
                  Eliminar
                </button>
              ) : (
                <div></div>
              )}
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  className="button button--outline"
                  onClick={() => {
                    setEditingCustomExp(null);
                  }}
                >
                  Cancelar
                </button>
                <button
                  className="button"
                  disabled={saving || !editingCustomExp.name?.trim()}
                  onClick={handleSaveCustomExperience}
                >
                  {saving ? "Guardando..." : "Guardar"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {confirmAction && (
        <div
          className="modal-backdrop"
          onClick={() => setConfirmAction(null)}
          onWheel={(e) => e.stopPropagation()}
        >
          <div
            className="auth-dialog"
            onClick={(e) => e.stopPropagation()}
            onWheel={(e) => e.stopPropagation()}
            style={{ width: "100%", maxWidth: 400, padding: 0, overscrollBehavior: "contain" }}
          >
            <div
              className="modal-header"
              style={{
                padding: "16px 16px 0",
                display: "flex",
                justifyContent: "flex-end",
                alignItems: "center",
              }}
            >
              <button
                className="icon-button"
                onClick={() => setConfirmAction(null)}
              >
                <IconClose />
              </button>
            </div>
            <div
              style={{
                padding: "40px 24px 20px",
                fontSize: "16px",
                textAlign: "center",
              }}
            >
              <p style={{ margin: 0, fontWeight: 600 }}>
                {confirmAction.message}
              </p>
            </div>
            <div
              className="modal-footer"
              style={{
                padding: "20px 24px",
                borderTop: "1px solid var(--border)",
                display: "flex",
                gap: 8,
                justifyContent: "center",
              }}
            >
              <button
                className="button button--outline"
                onClick={() => setConfirmAction(null)}
              >
                Cancelar
              </button>
              <button
                className="button"
                style={{
                  background: "var(--danger, #a34f3d)",
                  color: "white",
                  border: "none",
                }}
                onClick={() => {
                  confirmAction.onConfirm();
                  setConfirmAction(null);
                }}
              >
                Confirmar
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
