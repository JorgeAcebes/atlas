"use client";

import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import dynamic from "next/dynamic";
import { countries, type Country } from "@/data/countries";
import { peaks, type Peak } from "@/data/peaks";
import { predefinedCategories } from "@/data/experiences";
import { getMutualFollowers, type CompanionProfile } from "@/lib/companions";
import { getLinkPlaceholders } from "@/lib/link-utils";
import { useScrollLock } from "@/lib/scroll-lock";
import { getLocationInfo } from "@/lib/stats-utils";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/components/auth-context";
import { AppTopbar } from "@/components/layout/app-topbar";
import { usePendingRequests } from "@/components/use-pending-requests";
import { useHorizontalModeSwipe } from "@/hooks/use-horizontal-mode-swipe";
import { usePwaInstall } from "@/hooks/use-pwa-install";
import { useCustomExperiences } from "./tracker/hooks/use-custom-experiences";
import { useRecordMutations } from "./tracker/hooks/use-record-mutations";
import { useTrackerData } from "./tracker/hooks/use-tracker-data";
import { TrackerFooter } from "./tracker/tracker-footer";
import { TrackerHero } from "./tracker/tracker-hero";
import { TrackerInfoPanel } from "./tracker/tracker-info-panel";
import { TrackerItemList } from "./tracker/tracker-item-list";
import { TrackerMapSection } from "./tracker/tracker-map-section";
import type { RecordFormDraft, RecordSavePayload } from "./tracker/record-form-modal";
import {
  countryToItem,
  peakToItem,
  type Ascent,
  type ChallengeMode,
  type ExperienceRecord,
  type HiddenItem,
  type SelectedItem,
  type SummitPhoto,
  type SummitTrackerProps,
} from "./tracker/types";

export { getLinkPlaceholders };
export type { SelectedItem, SummitPhoto, HiddenItem, ExperienceRecord };

const StatsModal = dynamic(
  () => import("@/components/stats-modal").then((m) => m.StatsModal),
  { ssr: false }
);
const ProfileSettings = dynamic(
  () => import("@/components/profile-settings").then((m) => m.ProfileSettings),
  { ssr: false }
);
const AuthDialog = dynamic(
  () => import("@/components/auth-dialog").then((m) => m.AuthDialog),
  { ssr: false }
);
const ConfirmModal = dynamic(
  () => import("@/components/confirm-modal").then((m) => m.ConfirmModal),
  { ssr: false }
);
const InstallPrompt = dynamic(
  () => import("@/components/install-prompt").then((m) => m.InstallPrompt),
  { ssr: false }
);
const RecordFormModal = dynamic(
  () => import("./tracker/record-form-modal").then((m) => m.RecordFormModal),
  { ssr: false }
);
const PhotoModals = dynamic(
  () => import("./tracker/photo-modals").then((m) => m.PhotoModals),
  { ssr: false }
);
const ExperienceModals = dynamic(
  () => import("./tracker/experience-modals").then((m) => m.ExperienceModals),
  { ssr: false }
);

const useIsomorphicLayoutEffect =
  typeof window !== "undefined" ? useLayoutEffect : useEffect;

const EMPTY_RECORD_DRAFT: RecordFormDraft = {
  originalAchievedOn: null,
  editingExpRecordId: null,
  climbDate: null,
  climbEndDate: null,
  isDateUnknown: true,
  isEndDateEnabled: false,
  isDateModified: false,
  notes: "",
  link: "",
  linkName: "",
  link2: "",
  linkName2: "",
  showSecondLink: false,
  locationName: "",
  selectedLatLng: null,
  selectedCompanions: [],
  companionStatuses: {},
  currentTripGroupId: null,
  originalTripDates: null,
  files: [],
  deletedRecordPhotoIds: [],
};

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
}: SummitTrackerProps) {
  const { session, profile: authProfile, refreshProfile, loading: authLoading } = useAuth();
  const hasPendingRequests = usePendingRequests();
  const [mounted, setMounted] = useState(false);
  const [myProfile, setMyProfile] = useState<any>(() => authProfile);

  const isReadOnly = Boolean(targetProfile);
  const enablePeaks = !myProfile || myProfile.enable_peaks !== false;
  const enableCountries = !myProfile || myProfile.enable_countries !== false;
  const targetEnablePeaks = !targetProfile || targetProfile.enable_peaks !== false;
  const targetEnableCountries = !targetProfile || targetProfile.enable_countries !== false;

  const canShowPeaks = isReadOnly ? enablePeaks && targetEnablePeaks : enablePeaks;
  const canShowCountries = isReadOnly ? enableCountries && targetEnableCountries : enableCountries;
  const hasBothModes = canShowPeaks && canShowCountries;

  const [currentMode, setCurrentMode] = useState<ChallengeMode>(() => {
    const authEnablePeaks = !authProfile || authProfile.enable_peaks !== false;
    const authEnableCountries = !authProfile || authProfile.enable_countries !== false;
    const targetPeaks = !targetProfile || targetProfile.enable_peaks !== false;
    const targetCountries = !targetProfile || targetProfile.enable_countries !== false;
    const effectivePeaks = isReadOnly ? authEnablePeaks && targetPeaks : authEnablePeaks;
    const effectiveCountries = isReadOnly ? authEnableCountries && targetCountries : authEnableCountries;
    if (!effectivePeaks && initialModeProp === "peaks") return "countries";
    if (!effectiveCountries && initialModeProp === "countries") return "peaks";
    return initialModeProp;
  });

  const isPeaks = currentMode === "peaks";
  const [experiencesMode, setExperiencesMode] = useState(
    () => initialExperiencesMode || (controlledExperiencesMode !== undefined ? controlledExperiencesMode : false)
  );
  const isExp = experiencesMode && !isPeaks;

  const [selectedPeak, setSelectedPeak] = useState<SelectedItem | null>(null);
  const [selectedCountry, setSelectedCountry] = useState<SelectedItem | null>(null);
  const [selectedExperience, setSelectedExperience] = useState<SelectedItem | null>(null);

  const panelPushedRef = useRef(false);
  const panelOpenedFromStatsRef = useRef(false);
  const recordOpenedFromPanelRef = useRef(false);
  const isClosingPanelRef = useRef(false);
  const initialPanelRestoredRef = useRef(false);
  const selectingFromRecordRef = useRef(false);
  const preservedDraftRef = useRef<RecordFormDraft | null>(null);

  const [panelIdToOpen, setPanelIdToOpen] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    try {
      const stored = sessionStorage.getItem("auto_open_panel");
      if (stored) {
        sessionStorage.removeItem("auto_open_panel");
        return stored;
      }
      const searchRecord = new URLSearchParams(window.location.search).get("record");
      if (searchRecord) return searchRecord;
    } catch {
      /* ignore */
    }
    return null;
  });

  const [authOpen, setAuthOpen] = useState<"login" | "register" | false>(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [recordOpen, setRecordOpen] = useState(false);
  const [recordDraft, setRecordDraft] = useState<RecordFormDraft>(EMPTY_RECORD_DRAFT);
  const [statsOpen, setStatsOpen] = useState(() =>
    typeof window !== "undefined" ? window.location.hash === "#estadisticas" : false
  );
  const [listFilter, setListFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [notice, setNotice] = useState("");
  const [saving, setSaving] = useState(false);
  const [showWishlistNoteEditor, setShowWishlistNoteEditor] = useState(false);
  const [wishlistNoteText, setWishlistNoteText] = useState("");
  const [ascentsSortOrder, setAscentsSortOrder] = useState<"asc" | "desc">("asc");
  const [diffMode, setDiffMode] = useState(false);

  const [lightboxPhoto, setLightboxPhoto] = useState<SummitPhoto | null>(null);
  const [lightboxCaptionModalOpen, setLightboxCaptionModalOpen] = useState(false);
  const [lightboxNewCaption, setLightboxNewCaption] = useState("");
  const [selectedPhotosForEdit, setSelectedPhotosForEdit] = useState<string[]>([]);
  const [assignToRecordModalOpen, setAssignToRecordModalOpen] = useState(false);
  const [editorPhoto, setEditorPhoto] = useState<SummitPhoto | null>(null);

  const [editingCustomCategory, setEditingCustomCategory] = useState<any>(null);
  const [editingCustomExp, setEditingCustomExp] = useState<any>(null);
  const [confirmConfig, setConfirmConfig] = useState<{
    isOpen: boolean;
    message: string;
    onConfirm: () => void;
  } | null>(null);
  const [selectingLocationForExp, setSelectingLocationForExp] = useState<string | null>(null);
  const [selectingCategoryForNewExp, setSelectingCategoryForNewExp] = useState(false);
  const [expSelectorOpen, setExpSelectorOpen] = useState(false);
  const [showTrashModal, setShowTrashModal] = useState(false);
  const [isEditingExperiences, setIsEditingExperiences] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  const [targetConnStatus, setTargetConnStatus] = useState<"pending" | "accepted" | null>(() =>
    initialTargetConnStatus !== undefined ? initialTargetConnStatus : null
  );
  const [targetConnLoading, setTargetConnLoading] = useState(false);
  const [justFollowed, setJustFollowed] = useState(false);

  const { installPromptOpen, setInstallPromptOpen, canInstallMobile, handleHeroInstallClick } =
    usePwaInstall();

  const selected = useMemo<SelectedItem | null>(() => {
    if (isPeaks) return selectedPeak;
    if (isExp) return selectedExperience;
    return selectedCountry;
  }, [isPeaks, isExp, selectedPeak, selectedCountry, selectedExperience]);

  const selectedRef = useRef(selected);
  selectedRef.current = selected;
  const panelIdToOpenRef = useRef(panelIdToOpen);
  panelIdToOpenRef.current = panelIdToOpen;

  const trackerData = useTrackerData({
    targetProfile,
    session,
    authProfile,
    authLoading,
    isReadOnly,
    profileOpen,
    isPeaks,
    isExp,
    selected,
    isSelectedValidForCurrentMode: true,
    ascentsSortOrder,
    targetConnStatus,
    setTargetConnStatus,
    setMyProfile,
    myProfile,
  });

  const {
    targetId,
    ascents,
    setAscents,
    photos,
    setPhotos,
    experienceRecords,
    setExperienceRecords,
    customExperiences,
    setCustomExperiences,
    customCategories,
    setCustomCategories,
    hiddenItems,
    setHiddenItems,
    tripCompanionsMap,
    userFollowingSet,
    dynamicCategories,
    allItems,
    totalCount,
    modeAscents,
    completedModeAscents,
    achievedCount,
    wishlistCount,
    completion,
    completedPeakCodes,
    wishlistPeakCodes,
    completedCountryIds,
    wishlistCountryIds,
    diffPeakOnlyViewer,
    diffPeakOnlyTarget,
    diffPeakBoth,
    diffItemOnlyViewer,
    diffItemOnlyTarget,
    diffItemBoth,
    selectedAscents: rawSelectedAscents,
    selectedExperienceRecords: rawSelectedExperienceRecords,
    hasWishlist: rawHasWishlist,
    wishlistEntry: rawWishlistEntry,
    selectedPhotos: rawSelectedPhotos,
  } = trackerData;

  const customExperiencesRef = useRef(customExperiences);
  customExperiencesRef.current = customExperiences;

  const setSelected = useCallback(
    (
      val: SelectedItem | null | ((prev: SelectedItem | null) => SelectedItem | null)
    ) => {
      const item = typeof val === "function" ? val(selectedRef.current) : val;
      if (!item) {
        setSelectedPeak(null);
        setSelectedCountry(null);
        setSelectedExperience(null);
        return;
      }

      const isItemExp =
        item.itemType === "experience" ||
        item.id.startsWith("exp-") ||
        predefinedCategories.some((cat) => cat.experiences.some((exp) => exp.id === item.id)) ||
        customExperiencesRef.current.some((exp) => exp.id === item.id);
      const isItemPeak = item.itemType === "peak" || peaks.some((p) => p.id === item.id);

      if (isItemPeak) setSelectedPeak(item);
      else if (isItemExp) setSelectedExperience(item);
      else setSelectedCountry(item);
    },
    []
  );

  const isSelectedValidForCurrentMode = Boolean(
    selected &&
      (isPeaks
        ? selected.itemType === "peak" || peaks.some((p) => p.id === selected.id)
        : isExp
          ? selected.itemType === "experience" ||
            predefinedCategories.some((cat) => cat.experiences.some((exp) => exp.id === selected.id)) ||
            customExperiences.some((exp) => exp.id === selected.id) ||
            selected.id.startsWith("exp-")
          : selected.itemType === "country" ||
            countries.some((c) => c.id === selected.id) ||
            selected.id.startsWith("country-"))
  );

  const activeSelected = isSelectedValidForCurrentMode ? selected : null;
  const selectedAscents = isSelectedValidForCurrentMode ? rawSelectedAscents : [];
  const selectedExperienceRecords = isSelectedValidForCurrentMode
    ? rawSelectedExperienceRecords
    : [];
  const hasWishlist = isSelectedValidForCurrentMode ? rawHasWishlist : false;
  const wishlistEntry = isSelectedValidForCurrentMode ? rawWishlistEntry : null;
  const selectedPhotos = isSelectedValidForCurrentMode ? rawSelectedPhotos : [];

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    setMyProfile(authProfile);
  }, [authProfile]);

  useEffect(() => {
    if (initialModeProp && initialModeProp !== currentMode) {
      if (initialModeProp === "peaks" && canShowPeaks) setCurrentMode("peaks");
      else if (initialModeProp === "countries" && canShowCountries) setCurrentMode("countries");
    }
  }, [initialModeProp, canShowPeaks, canShowCountries, currentMode]);

  const switchMode = useCallback(
    (target: ChallengeMode) => {
      if (target === currentMode) return;
      if (target === "peaks" && !canShowPeaks) return;
      if (target === "countries" && !canShowCountries) return;

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
          window.history.replaceState(null, "", window.location.pathname + window.location.search);
        }
      } else {
        window.history.replaceState(null, "", target === "peaks" ? "/picos" : "/");
      }
    },
    [currentMode, canShowPeaks, canShowCountries, onSwitchMode]
  );

  const { handleTouchStart: handleSwipeTouchStart, handleTouchEnd: handleSwipeTouchEnd } =
    useHorizontalModeSwipe({
      isActive,
      isPeaks,
      canShowPeaks,
      canShowCountries,
      onSwitchMode: switchMode,
    });

  useEffect(() => {
    if (!isActive) return;
    const handlePopState = () => {
      if (window.location.pathname === "/picos" && canShowPeaks) setCurrentMode("peaks");
      else if (window.location.pathname === "/" && canShowCountries) setCurrentMode("countries");
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [isActive, canShowPeaks, canShowCountries]);

  useEffect(() => {
    if (selected && !isSelectedValidForCurrentMode) {
      setSelected(null);
      setRecordOpen(false);
      setPanelIdToOpen(null);
      panelPushedRef.current = false;
      recordOpenedFromPanelRef.current = false;
      if (typeof window !== "undefined" && window.location.hash.startsWith("#panel")) {
        window.history.replaceState(null, "", window.location.pathname + window.location.search);
      }
    }
  }, [selected, isSelectedValidForCurrentMode, setSelected]);

  useEffect(() => {
    if (panelIdToOpen && !isClosingPanelRef.current && typeof window !== "undefined") {
      const targetHash = `#panel=${encodeURIComponent(panelIdToOpen)}`;
      if (window.location.hash !== targetHash) {
        if (panelPushedRef.current || window.location.hash.startsWith("#panel")) {
          window.history.replaceState({ hasPanel: true }, "", targetHash);
        } else {
          panelPushedRef.current = true;
          window.history.pushState({ hasPanel: true }, "", targetHash);
        }
      }
    }
  }, [panelIdToOpen]);

  useEffect(() => {
    if (!mounted) return;
    if (!canShowPeaks && currentMode === "peaks") switchMode("countries");
    else if (!canShowCountries && currentMode === "countries") switchMode("peaks");
    if (!canShowCountries) {
      if (experiencesMode) setExperiencesMode(false);
      onToggleExperiences?.(false);
    }
  }, [mounted, canShowPeaks, canShowCountries, currentMode, experiencesMode, switchMode, onToggleExperiences]);

  useEffect(() => {
    const checkMobile = () =>
      setIsMobile(typeof window !== "undefined" && window.innerWidth <= 768);
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  useEffect(() => {
    if (initialTargetConnStatus !== undefined) setTargetConnStatus(initialTargetConnStatus);
  }, [initialTargetConnStatus]);

  useEffect(() => {
    setJustFollowed(false);
    if (!targetProfile || !session?.user?.id || !supabase || session.user.id === targetProfile.id) {
      return;
    }
    supabase
      .from("connections")
      .select("status")
      .eq("follower_id", session.user.id)
      .eq("following_id", targetProfile.id)
      .maybeSingle()
      .then(({ data }) => {
        setTargetConnStatus(data ? (data.status as "pending" | "accepted") : null);
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
    const { error } = await supabase.from("connections").insert({
      follower_id: session.user.id,
      following_id: targetProfile.id,
      status: newStatus,
    });
    setTargetConnLoading(false);
    if (!error) {
      setTargetConnStatus(newStatus);
      if (newStatus === "accepted") setJustFollowed(true);
      const { preloadSocialConnections } = await import("@/lib/social-cache");
      preloadSocialConnections(session.user.id, true);
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
      const { preloadSocialConnections } = await import("@/lib/social-cache");
      preloadSocialConnections(session.user.id, true);
    }
  }

  const isScrollLocked =
    (isMobile && Boolean(activeSelected)) ||
    Boolean(recordOpen && activeSelected) ||
    Boolean(lightboxPhoto) ||
    Boolean(editorPhoto) ||
    lightboxCaptionModalOpen ||
    expSelectorOpen ||
    assignToRecordModalOpen ||
    showTrashModal ||
    Boolean(editingCustomCategory) ||
    selectingCategoryForNewExp ||
    Boolean(editingCustomExp) ||
    Boolean(confirmConfig?.isOpen) ||
    Boolean(selectingLocationForExp);

  useScrollLock(isScrollLocked);

  useEffect(() => {
    if (!selectingLocationForExp) return;
    const isMobileScreen = typeof window !== "undefined" && (window.innerWidth <= 768 || isMobile);
    if (isMobileScreen) {
      window.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior });
      return;
    }
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
  }, [selectingLocationForExp, isMobile]);

  useEffect(() => {
    if (controlledExperiencesMode !== undefined && !isReadOnly && controlledExperiencesMode !== experiencesMode) {
      setExperiencesMode(controlledExperiencesMode);
    }
  }, [controlledExperiencesMode, isReadOnly, experiencesMode]);

  useEffect(() => {
    if (initialExperiencesMode) {
      setExperiencesMode(true);
    } else if (!isReadOnly && controlledExperiencesMode === undefined) {
      if (localStorage.getItem("myExperiencesMode") === "true") setExperiencesMode(true);
    }
  }, [isReadOnly, initialExperiencesMode, controlledExperiencesMode]);

  useEffect(() => {
    if (!isReadOnly) {
      localStorage.setItem("myExperiencesMode", experiencesMode.toString());
    }
  }, [experiencesMode, isReadOnly]);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const path = window.location.pathname;
      if (path === "/" || path === "/picos") localStorage.setItem("last_map_path", path);
      localStorage.setItem("ranking_mode", currentMode);
    }
  }, [currentMode]);

  useEffect(() => {
    setSelectedPhotosForEdit([]);
  }, [selected]);

  useEffect(() => {
    if (!selected?.sub_item_id) return;
    const timeout = setTimeout(() => {
      document.querySelector(".subitem-details[open]")?.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
      });
    }, 150);
    return () => clearTimeout(timeout);
  }, [selected?.sub_item_id]);

  useEffect(() => {
    if (!notice) return;
    const timeout = setTimeout(() => setNotice(""), 4000);
    return () => clearTimeout(timeout);
  }, [notice]);

  useEffect(() => {
    if (!isActive) return;
    const handleHashChange = () => {
      const hash = window.location.hash;
      if (hash === "#editor") return;
      if (hash === "#lightbox") {
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
        if (!panelOpenedFromStatsRef.current) setStatsOpen(false);
        const panelId = decodeURIComponent(
          hash.startsWith("#panel=") ? hash.substring(7) : hash.substring(6)
        );
        if (panelId) {
          const cur = selectedRef.current;
          if (!cur || cur.id !== panelId.split("::")[0]) setPanelIdToOpen(panelId);
        } else {
          setSelected(null);
          setRecordOpen(false);
        }
      } else {
        isClosingPanelRef.current = false;
        document.querySelectorAll(".leaflet-tooltip").forEach((el) => {
          el.parentElement?.removeChild(el);
        });
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
    const resizeTimer = setTimeout(() => window.dispatchEvent(new Event("resize")), 50);
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
      clearTimeout(resizeTimer);
      document.body.classList.remove("mode-experiences");
      document.body.classList.remove("mode-countries");
    };
  }, [experiencesMode, isPeaks, isActive, session, isReadOnly]);

  // Synchronous panel restore before first paint
  useIsomorphicLayoutEffect(() => {
    if (isClosingPanelRef.current) return;
    const hash = typeof window !== "undefined" ? window.location.hash : "";
    if (initialPanelRestoredRef.current && !panelIdToOpen) return;
    const targetHash = panelIdToOpen ? `#panel=${panelIdToOpen}` : hash;
    if (!targetHash.startsWith("#panel=")) {
      initialPanelRestoredRef.current = true;
      return;
    }
    const rawId = targetHash.substring(7);
    if (!rawId) return;

    const id = decodeURIComponent(rawId);
    const [baseId, subItemId] = id.includes("::") ? id.split("::") : [id, undefined];
    const isExpId =
      baseId.startsWith("exp-") ||
      predefinedCategories.some((c) => c.experiences.some((e) => e.id === baseId)) ||
      customExperiences.some((e) => e.id === baseId);

    if (isExpId && (!experiencesMode || isPeaks)) {
      if (!canShowCountries) return;
      if (isPeaks) setCurrentMode("countries");
      setExperiencesMode(true);
      onToggleExperiences?.(true);
      return;
    }

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

    let item = allItems.find((i) => i.id === baseId || i.id === id);
    if (!item && isPeaks) {
      const matched = peaks.find(
        (p) =>
          p.id === baseId ||
          p.name.toLowerCase() === baseId.toLowerCase() ||
          p.province.toLowerCase() === baseId.toLowerCase()
      );
      if (matched) item = allItems.find((i) => i.id === matched.id);
    }
    if (!item && !isPeaks) {
      const matched = countries.find(
        (c) =>
          c.id === baseId ||
          c.name.toLowerCase() === baseId.toLowerCase() ||
          c.iso_a2.toLowerCase() === baseId.toLowerCase()
      );
      if (matched) item = allItems.find((i) => i.id === matched.id);
    }

    if (item) {
      const selectedItem = subItemId ? { ...item, sub_item_id: subItemId } : item;
      const cur = selectedRef.current;
      if (!cur || cur.id !== selectedItem.id || cur.sub_item_id !== selectedItem.sub_item_id) {
        setSelected(selectedItem);
      }
      if (panelIdToOpen) setPanelIdToOpen(null);
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

    const fromStats = panelOpenedFromStatsRef.current;
    const wasPushed = panelPushedRef.current;
    panelPushedRef.current = false;
    panelOpenedFromStatsRef.current = false;
    recordOpenedFromPanelRef.current = false;
    if (fromStats) {
      window.history.back();
    } else if (wasPushed) {
      if (window.location.hash.startsWith("#panel")) window.history.back();
    } else if (window.location.hash) {
      window.history.replaceState(null, "", window.location.pathname + window.location.search);
    }
    setTimeout(() => {
      isClosingPanelRef.current = false;
    }, 400);
  }, [setSelected]);

  const handleCloseRecord = useCallback(() => {
    preservedDraftRef.current = null;
    if (recordOpenedFromPanelRef.current) setRecordOpen(false);
    else closePanel();
  }, [closePanel]);

  const openInformation = useCallback(
    (item: SelectedItem) => {
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
    },
    [setSelected]
  );

  const openPeakInformation = useCallback(
    (peak: Peak) => openInformation(peakToItem(peak)),
    [openInformation]
  );
  const openCountryInformation = useCallback(
    (country: Country) => openInformation(countryToItem(country)),
    [openInformation]
  );

  const openRecord = useCallback(
    (
      item?: SelectedItem | null,
      ascentToEdit?: Ascent | any,
      pickedLocation?: { lat: number; lng: number; locationName: string }
    ) => {
      if (isReadOnly) return;
      if (!session) {
        const targetHash = "#panel";
        if (window.location.hash !== targetHash) {
          if (panelPushedRef.current || window.location.hash.startsWith("#panel")) {
            window.history.replaceState({ hasPanel: true }, "", targetHash);
          } else {
            panelPushedRef.current = true;
            window.history.pushState({ hasPanel: true }, "", targetHash);
          }
        }
        setAuthOpen("login");
        return;
      }

      recordOpenedFromPanelRef.current = Boolean(selected && item && selected.id === item.id);
      const targetHash = item ? `#panel=${encodeURIComponent(item.id)}` : "#panel";
      if (window.location.hash !== targetHash) {
        if (panelPushedRef.current || window.location.hash.startsWith("#panel")) {
          window.history.replaceState({ hasPanel: true }, "", targetHash);
        } else {
          panelPushedRef.current = true;
          window.history.pushState({ hasPanel: true }, "", targetHash);
        }
      }

      if (!item) {
        setRecordDraft(EMPTY_RECORD_DRAFT);
        setRecordOpen(true);
        setNotice("");
        return;
      }

      setSelected(item);

      if (preservedDraftRef.current) {
        const restored = preservedDraftRef.current;
        preservedDraftRef.current = null;
        setRecordDraft({
          ...restored,
          selectedLatLng: pickedLocation ? { lat: pickedLocation.lat, lng: pickedLocation.lng } : restored.selectedLatLng,
          locationName: pickedLocation ? pickedLocation.locationName : restored.locationName,
        });
        setRecordOpen(true);
        setNotice("");
        return;
      }

      if (ascentToEdit) {
        let tripGrpId = ascentToEdit.trip_group_id || null;
        if (!tripGrpId) {
          const expRecId = ascentToEdit.record_id || ascentToEdit.id;
          if (expRecId) {
            tripGrpId = experienceRecords.find((r) => r.id === expRecId)?.trip_group_id || null;
          }
          if (!tripGrpId && item.id && ascentToEdit.achieved_on) {
            tripGrpId =
              ascents.find((a) => a.summit_id === item.id && a.achieved_on === ascentToEdit.achieved_on)
                ?.trip_group_id || null;
          }
          if (!tripGrpId && item.id && ascentToEdit.achieved_on) {
            tripGrpId =
              experienceRecords.find(
                (r) =>
                  r.experience_id === item.id &&
                  r.achieved_on === ascentToEdit.achieved_on &&
                  (!item.sub_item_id || r.sub_item_id === item.sub_item_id)
              )?.trip_group_id || null;
          }
        }

        const rawDate = ascentToEdit.achieved_on || null;
        const isUnknown = !rawDate || rawDate === "1900-01-01";
        const expRecId = item.itemType === "experience" ? ascentToEdit.record_id || ascentToEdit.id || null : null;

        setRecordDraft({
          originalAchievedOn: rawDate,
          editingExpRecordId: expRecId,
          climbDate: isUnknown ? null : String(rawDate).slice(0, 10),
          climbEndDate: ascentToEdit.end_date ? String(ascentToEdit.end_date).slice(0, 10) : null,
          isDateUnknown: isUnknown,
          isEndDateEnabled: Boolean(ascentToEdit.end_date),
          isDateModified: !isUnknown,
          notes: ascentToEdit.notes ?? "",
          link: ascentToEdit.link ?? "",
          linkName: ascentToEdit.link_name ?? "",
          link2: ascentToEdit.link_2 ?? "",
          linkName2: ascentToEdit.link_name_2 ?? "",
          showSecondLink: Boolean(ascentToEdit.link_2 || ascentToEdit.link_name_2),
          locationName: expRecId ? ascentToEdit.location_name || "" : "",
          selectedLatLng: expRecId ? { lat: ascentToEdit.lat, lng: ascentToEdit.lng } : null,
          selectedCompanions: [],
          companionStatuses: {},
          currentTripGroupId: tripGrpId,
          originalTripDates: null,
          files: [],
          deletedRecordPhotoIds: [],
        });

        if (tripGrpId && supabase) {
          supabase
            .from("record_companions")
            .select(
              `
              id, trip_group_id, inviter_id, companion_id, status, original_start_date, original_end_date,
              companion_profile:profiles!record_companions_companion_id_fkey(id, username, avatar_url, is_public),
              inviter_profile:profiles!record_companions_inviter_id_fkey(id, username, avatar_url, is_public)
            `
            )
            .eq("trip_group_id", tripGrpId)
            .then(async ({ data }) => {
              if (!data || data.length === 0) return;
              const followers = session?.user?.id ? await getMutualFollowers(session.user.id) : [];
              const followersMap = new Map(followers.map((f) => [f.id, f]));
              const comps: CompanionProfile[] = [];
              const statuses: Record<string, any> = {};

              for (const row of data as any[]) {
                const isInviter = row.inviter_id === session?.user?.id;
                const otherId = isInviter ? row.companion_id : row.inviter_id;
                const rawComp = Array.isArray(row.companion_profile) ? row.companion_profile[0] : row.companion_profile;
                const rawInv = Array.isArray(row.inviter_profile) ? row.inviter_profile[0] : row.inviter_profile;
                let profile: CompanionProfile | null = isInviter ? rawComp : rawInv;
                if ((!profile || !profile.username) && otherId && followersMap.has(otherId)) {
                  profile = followersMap.get(otherId)!;
                }
                if (profile?.username) {
                  if (!comps.some((c) => c.id === profile!.id)) comps.push(profile);
                  statuses[profile.id] = row.status;
                } else if (otherId) {
                  comps.push({ id: otherId, username: "compañero" });
                  statuses[otherId] = row.status;
                }
              }

              setRecordDraft((prev) => ({
                ...prev,
                selectedCompanions: comps,
                companionStatuses: statuses,
                originalTripDates: {
                  start: data[0].original_start_date,
                  end: data[0].original_end_date,
                },
              }));
            });
        }
      } else {
        setRecordDraft({
          ...EMPTY_RECORD_DRAFT,
          selectedLatLng: pickedLocation
            ? { lat: pickedLocation.lat, lng: pickedLocation.lng }
            : null,
          locationName: pickedLocation ? pickedLocation.locationName : "",
        });
      }

      setRecordOpen(true);
      setNotice("");
    },
    [isReadOnly, session, selected, setSelected, ascents, experienceRecords]
  );

  const openPeakRecord = useCallback((peak: Peak) => openRecord(peakToItem(peak)), [openRecord]);
  const openCountryRecord = useCallback(
    (country: Country) => openRecord(countryToItem(country)),
    [openRecord]
  );

  const resolveExpSelection = useCallback(
    (expId: string, subItemId?: string): SelectedItem | null => {
      const category = dynamicCategories.find((c) => c.experiences.some((e) => e.id === expId));
      const exp = category?.experiences.find((e) => e.id === expId);
      if (!exp || !category) return null;
      return {
        id: expId,
        sub_item_id: subItemId || undefined,
        title: exp.name,
        subtitle: category.name,
        label: "",
        detail: category.name,
        note: "",
        iconName: category.iconName,
        subItems: exp.subItems,
        itemType: "experience",
      };
    },
    [dynamicCategories]
  );

  const handleCancelSelectingLocationForExp = useCallback(() => {
    if (!selectingLocationForExp) return;
    if (selectingFromRecordRef.current) {
      selectingFromRecordRef.current = false;
      const [expId, subItemId] = selectingLocationForExp.split("::");
      const item = resolveExpSelection(expId, subItemId);
      if (item) {
        setSelectingLocationForExp(null);
        openRecord(item);
        return;
      }
    }
    selectingFromRecordRef.current = false;
    preservedDraftRef.current = null;
    setSelectingLocationForExp(null);
    setSelected(null);
    setRecordOpen(false);
  }, [selectingLocationForExp, resolveExpSelection, openRecord, setSelected]);

  const handleMapClickForExp = useCallback(
    async (lat: number, lng: number, placeNameArg?: string) => {
      if (!selectingLocationForExp) return;
      const [expId, subItemId] = selectingLocationForExp.split("::");
      const item = resolveExpSelection(expId, subItemId);
      if (!item) return;

      let placeName = placeNameArg || "";
      if (!placeName) {
        try {
          const res = await fetch(
            `/api/geocoding?type=reverse&lat=${encodeURIComponent(lat)}&lng=${encodeURIComponent(lng)}`
          );
          if (res.ok) {
            const data = await res.json();
            const addr = data?.address || {};
            placeName =
              addr.city ||
              addr.town ||
              addr.village ||
              addr.county ||
              addr.state ||
              addr.country ||
              addr.ocean ||
              addr.sea ||
              "";
          }
        } catch {
          /* ignore */
        }
      }

      selectingFromRecordRef.current = false;
      setSelectingLocationForExp(null);
      openRecord(item, undefined, { lat, lng, locationName: placeName });
    },
    [selectingLocationForExp, resolveExpSelection, openRecord]
  );

  const handleExperienceClick = useCallback(
    (record: ExperienceRecord) => {
      if (!experiencesMode) return;
      const item = resolveExpSelection(record.experience_id, record.sub_item_id);
      if (item) openInformation(item);
    },
    [experiencesMode, resolveExpSelection, openInformation]
  );

  const handleToggleExperiences = useCallback(() => {
    if (experiencesMode) {
      const hashPanelExp =
        typeof window !== "undefined" &&
        window.location.hash.startsWith("#panel=") &&
        (() => {
          const rawId = decodeURIComponent(window.location.hash.substring(7)).split("::")[0];
          return (
            rawId.startsWith("exp-") ||
            predefinedCategories.some((cat) => cat.experiences.some((exp) => exp.id === rawId)) ||
            customExperiences.some((exp) => exp.id === rawId)
          );
        })();
      const isSelectedExp =
        Boolean(selected && (selected.itemType === "experience" || selected.id.startsWith("exp-"))) ||
        Boolean(hashPanelExp);
      if (isSelectedExp) closePanel();
      if (selectingLocationForExp) setSelectingLocationForExp(null);
      setSelectingCategoryForNewExp(false);
      setExpSelectorOpen(false);
      setIsEditingExperiences(false);
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

  const {
    saveWishlist,
    saveWishlistNote,
    handleShareRecord,
    saveAscent,
    deleteAscent,
    handleAddPhotosToDate,
    handleSaveCaption,
    deletePhoto,
    handleBatchDeletePhotos,
    handleAssignPhotosToRecord,
    handleSaveEditedPhoto,
  } = useRecordMutations({
    session,
    myProfile,
    selected,
    isPeaks,
    ascents,
    setAscents,
    photos,
    setPhotos,
    experienceRecords,
    setExperienceRecords,
    selectedPhotos,
    selectedPhotosForEdit,
    setSelectedPhotosForEdit,
    hasWishlist,
    wishlistEntry,
    wishlistNoteText,
    setShowWishlistNoteEditor,
    setNotice,
    setSaving,
    setRecordOpen,
    setAuthOpen,
    setConfirmConfig,
    lightboxPhoto,
    setLightboxPhoto,
    lightboxNewCaption,
    setLightboxCaptionModalOpen,
    setAssignToRecordModalOpen,
    editorPhoto,
    setEditorPhoto,
  });

  const {
    handleHideItem,
    handleSaveCustomCategory,
    handleDeleteCustomCategory,
    handleDeleteCustomExperience,
    handleRestoreHiddenItem,
    handlePermanentDelete,
    handleSaveCustomExperience,
  } = useCustomExperiences({
    session,
    editingCustomCategory,
    setEditingCustomCategory,
    editingCustomExp,
    setEditingCustomExp,
    customExperiences,
    setCustomCategories,
    setCustomExperiences,
    setHiddenItems,
    setExpSelectorOpen,
    setNotice,
    setSaving,
    setConfirmConfig,
  });

  const handleSaveRecordForm = async (payload: RecordSavePayload) => {
    const res = await saveAscent(payload);
    if (res.saved) {
      preservedDraftRef.current = null;
    }
  };

  const currentPhotoGroup = useMemo(() => {
    if (!lightboxPhoto || !selected || !isSelectedValidForCurrentMode) return [];
    const registeredDates = new Set([
      ...ascents.filter((a) => a.summit_id === selected.id && !a.is_wishlist).map((a) => a.achieved_on),
      ...experienceRecords
        .filter((r) => r.experience_id === selected.id || r.sub_item_id === selected.id)
        .map((r) => r.achieved_on),
    ]);
    return registeredDates.has(lightboxPhoto.taken_on)
      ? photos.filter((p) => p.summit_id === selected.id && p.taken_on === lightboxPhoto.taken_on)
      : photos.filter((p) => p.summit_id === selected.id && !registeredDates.has(p.taken_on));
  }, [lightboxPhoto, selected, isSelectedValidForCurrentMode, ascents, experienceRecords, photos]);

  const lightboxIndex = lightboxPhoto
    ? currentPhotoGroup.findIndex((p) => p.id === lightboxPhoto.id)
    : -1;

  const sortedItems = useMemo(() => {
    if (isPeaks) return [...allItems].sort((a, b) => parseInt(b.subtitle) - parseInt(a.subtitle));
    if (isExp) return allItems;
    return [...allItems].sort((a, b) => a.title.localeCompare(b.title, "es"));
  }, [allItems, isPeaks, isExp]);

  const handlePhotoClick = (photo: SummitPhoto) => {
    if (selectedPhotosForEdit.length > 0) {
      setSelectedPhotosForEdit((prev) =>
        prev.includes(photo.id) ? prev.filter((id) => id !== photo.id) : [...prev, photo.id]
      );
    } else {
      setLightboxPhoto(photo);
      window.history.pushState(null, "", "#lightbox");
    }
  };

  const togglePhotoSelection = (photoId: string) => {
    setSelectedPhotosForEdit((prev) =>
      prev.includes(photoId) ? prev.filter((id) => id !== photoId) : [...prev, photoId]
    );
  };

  const handleOpenExpSelector = useCallback(() => setExpSelectorOpen(true), []);

  const modeUnit = isPeaks
    ? "cimas conquistadas"
    : isExp
      ? "experiencias registradas"
      : "países visitados";

  return (
    <main className={!isPeaks ? (isExp ? "mode-experiences" : "mode-countries") : undefined}>
      <AppTopbar
        activeTab="map"
        mode={currentMode}
        experiencesMode={experiencesMode}
        hasBothModes={hasBothModes}
        session={session}
        myProfile={myProfile}
        mounted={mounted}
        hasPendingRequests={hasPendingRequests}
        canInstallMobile={canInstallMobile}
        isReadOnly={isReadOnly}
        targetProfile={targetProfile}
        fromTab={fromTab}
        onSwitchMode={switchMode}
        onNavigate={onNavigate}
        onOpenStats={() => {
          window.location.hash = "estadisticas";
          setStatsOpen(true);
        }}
        onInstallClick={handleHeroInstallClick}
        onOpenProfile={() => setProfileOpen(true)}
        onOpenAuth={() => setAuthOpen("login")}
      />

      <TrackerHero
        targetProfile={targetProfile}
        session={session}
        isPeaks={isPeaks}
        experiencesMode={experiencesMode}
        hasBothModes={hasBothModes}
        achievedCount={achievedCount}
        totalCount={totalCount}
        modeUnit={modeUnit}
        completion={completion}
        targetConnStatus={targetConnStatus}
        targetConnLoading={targetConnLoading}
        justFollowed={justFollowed}
        setJustFollowed={setJustFollowed}
        onFollowTarget={handleFollowTarget}
        onUnfollowTarget={handleUnfollowTarget}
        onSwitchMode={switchMode}
        onSwipeTouchStart={handleSwipeTouchStart}
        onSwipeTouchEnd={handleSwipeTouchEnd}
      />

      <TrackerMapSection
        isPeaks={isPeaks}
        isReadOnly={isReadOnly}
        isActive={isActive}
        session={session}
        targetProfile={targetProfile}
        canShowCountries={canShowCountries}
        experiencesMode={experiencesMode}
        myProfileEnableExperiences={Boolean(myProfile?.enable_experiences)}
        mounted={mounted}
        diffMode={diffMode}
        setDiffMode={setDiffMode}
        onToggleExperiences={handleToggleExperiences}
        completedPeakCodes={completedPeakCodes}
        wishlistPeakCodes={wishlistPeakCodes}
        completedCountryIds={completedCountryIds}
        wishlistCountryIds={wishlistCountryIds}
        diffPeakOnlyViewer={diffPeakOnlyViewer}
        diffPeakOnlyTarget={diffPeakOnlyTarget}
        diffPeakBoth={diffPeakBoth}
        diffItemOnlyViewer={diffItemOnlyViewer}
        diffItemOnlyTarget={diffItemOnlyTarget}
        diffItemBoth={diffItemBoth}
        activeSelected={activeSelected}
        experienceRecords={experienceRecords}
        dynamicCategories={dynamicCategories}
        selectingLocationForExp={selectingLocationForExp}
        onOpenPeakInformation={openPeakInformation}
        onOpenPeakRecord={openPeakRecord}
        onOpenCountryInformation={openCountryInformation}
        onOpenCountryRecord={openCountryRecord}
        onMapClickForExp={handleMapClickForExp}
        onCancelSelectingLocationForExp={handleCancelSelectingLocationForExp}
        onExperienceClick={handleExperienceClick}
        onOpenExpSelector={handleOpenExpSelector}
      />

      <TrackerItemList
        isPeaks={isPeaks}
        isExp={isExp}
        isReadOnly={isReadOnly}
        listFilter={listFilter}
        setListFilter={setListFilter}
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
        totalCount={totalCount}
        achievedCount={achievedCount}
        wishlistCount={wishlistCount}
        sortedItems={sortedItems}
        modeAscents={modeAscents}
        completedModeAscents={completedModeAscents}
        diffMode={diffMode}
        diffItemOnlyViewer={diffItemOnlyViewer}
        diffItemOnlyTarget={diffItemOnlyTarget}
        diffItemBoth={diffItemBoth}
        dynamicCategories={dynamicCategories}
        customExperiences={customExperiences}
        customCategories={customCategories}
        isEditingExperiences={isEditingExperiences}
        setIsEditingExperiences={setIsEditingExperiences}
        onOpenInformation={openInformation}
        onSetEditingCustomCategory={setEditingCustomCategory}
        onDeleteCustomCategory={handleDeleteCustomCategory}
        onHideItem={handleHideItem}
        onOpenTrashModal={() => setShowTrashModal(true)}
        onSetEditingCustomExp={setEditingCustomExp}
        onDeleteCustomExperience={handleDeleteCustomExperience}
        onOpenSelectCategoryForNewExp={() => setSelectingCategoryForNewExp(true)}
      />

      <TrackerFooter isPeaks={isPeaks} />

      {selected && isSelectedValidForCurrentMode && (
        <TrackerInfoPanel
          selected={selected}
          fromStats={panelOpenedFromStatsRef.current}
          isPeaks={isPeaks}
          isReadOnly={isReadOnly}
          session={session}
          targetId={targetId}
          selectedAscents={selectedAscents}
          selectedExperienceRecords={selectedExperienceRecords}
          experienceRecords={experienceRecords}
          selectedPhotos={selectedPhotos}
          selectedPhotosForEdit={selectedPhotosForEdit}
          ascentsSortOrder={ascentsSortOrder}
          setAscentsSortOrder={setAscentsSortOrder}
          tripCompanionsMap={tripCompanionsMap}
          userFollowingSet={userFollowingSet}
          hasWishlist={hasWishlist}
          wishlistEntry={wishlistEntry}
          showWishlistNoteEditor={showWishlistNoteEditor}
          setShowWishlistNoteEditor={setShowWishlistNoteEditor}
          wishlistNoteText={wishlistNoteText}
          setWishlistNoteText={setWishlistNoteText}
          onClose={closePanel}
          onSelectLocationForExp={(subItemKey) => {
            setSelectingLocationForExp(subItemKey);
            window.location.hash = "mapa";
          }}
          onShareRecord={handleShareRecord}
          onOpenRecord={(item, ascent) => openRecord(item, ascent)}
          onAddPhotosToDate={handleAddPhotosToDate}
          onMaxPhotosReached={() =>
            setNotice("Máximo 4 fotos por registro. Ya has alcanzado el límite.")
          }
          onPhotoClick={handlePhotoClick}
          onTogglePhotoSelection={togglePhotoSelection}
          onSaveWishlist={saveWishlist}
          onSaveWishlistNote={saveWishlistNote}
        />
      )}

      {recordOpen && selected && isSelectedValidForCurrentMode && (
        <RecordFormModal
          selected={selected}
          isPeaks={isPeaks}
          isExp={isExp}
          fromStats={panelOpenedFromStatsRef.current}
          saving={saving}
          initialDraft={recordDraft}
          photos={photos}
          selectedPhotosForEdit={selectedPhotosForEdit}
          onRemoveGalleryPhoto={(photoId) =>
            setSelectedPhotosForEdit((prev) => prev.filter((id) => id !== photoId))
          }
          onNotice={setNotice}
          onPickLocationOnMap={(draftSnapshot) => {
            preservedDraftRef.current = draftSnapshot;
            selectingFromRecordRef.current = true;
            setSelectingLocationForExp(
              selected.sub_item_id ? `${selected.id}::${selected.sub_item_id}` : `${selected.id}::`
            );
            setRecordOpen(false);
            window.location.hash = "mapa";
          }}
          onSave={handleSaveRecordForm}
          onDelete={deleteAscent}
          onClose={handleCloseRecord}
        />
      )}

      {notice && (
        <div className="toast" role="status">
          {notice}
        </div>
      )}

      {(lightboxPhoto || selectedPhotosForEdit.length > 0 || assignToRecordModalOpen || editorPhoto) && (
        <PhotoModals
          lightboxPhoto={lightboxPhoto}
          currentPhotoGroup={currentPhotoGroup}
          lightboxIndex={lightboxIndex}
          activeSelected={activeSelected}
          isReadOnly={isReadOnly}
          saving={saving}
          lightboxCaptionModalOpen={lightboxCaptionModalOpen}
          setLightboxCaptionModalOpen={setLightboxCaptionModalOpen}
          lightboxNewCaption={lightboxNewCaption}
          setLightboxNewCaption={setLightboxNewCaption}
          selectedPhotosForEdit={selectedPhotosForEdit}
          setSelectedPhotosForEdit={setSelectedPhotosForEdit}
          assignToRecordModalOpen={assignToRecordModalOpen}
          setAssignToRecordModalOpen={setAssignToRecordModalOpen}
          selectedAscents={selectedAscents}
          editorPhoto={editorPhoto}
          onIndexChange={setLightboxPhoto}
          onOpenEditor={(photo) => setEditorPhoto(photo)}
          onOpenCaptionModal={(photo) => {
            setLightboxNewCaption(photo.caption || "");
            setLightboxCaptionModalOpen(true);
          }}
          onSaveCaption={handleSaveCaption}
          onDeletePhoto={deletePhoto}
          onOpenAssignModal={() => {
            if (selectedPhotosForEdit.length > 4) {
              setNotice("No puedes asignar más de 4 fotos a un registro.");
              return;
            }
            setAssignToRecordModalOpen(true);
          }}
          onAssignPhotosToRecord={handleAssignPhotosToRecord}
          onOpenNewRecordFromAssign={() => {
            setAssignToRecordModalOpen(false);
            openRecord(selected, undefined);
          }}
          onBatchDeletePhotos={handleBatchDeletePhotos}
          onSaveEditedPhoto={handleSaveEditedPhoto}
        />
      )}

      {authOpen && (
        <AuthDialog
          onClose={() => setAuthOpen(false)}
          initialTab={authOpen === "login" ? "login" : "register"}
        />
      )}

      {profileOpen && session && (
        <ProfileSettings
          session={session}
          onClose={() => setProfileOpen(false)}
          onProfileUpdate={async () => {
            refreshProfile();
            if (supabase && session) {
              const { data: prof } = await supabase
                .from("profiles")
                .select("username, avatar_url, enable_experiences, enable_peaks, enable_countries")
                .eq("id", session.user.id)
                .single();
              if (prof) setMyProfile(prof);
            }
          }}
        />
      )}

      {statsOpen && (
        <StatsModal
          session={session}
          myProfile={myProfile}
          targetProfile={targetProfile}
          ascents={ascents}
          photos={photos}
          experienceRecords={experienceRecords}
          customExperiences={customExperiences}
          customCategories={customCategories}
          initialMode={experiencesMode ? "experiences" : currentMode}
          onModeChange={(newMode) => {
            if (newMode === "peaks" && canShowPeaks) {
              setCurrentMode("peaks");
              setExperiencesMode(false);
              onToggleExperiences?.(false);
            } else if (newMode === "countries" && canShowCountries) {
              setCurrentMode("countries");
              setExperiencesMode(false);
              onToggleExperiences?.(false);
            } else if (newMode === "experiences" && canShowCountries) {
              setCurrentMode("countries");
              setExperiencesMode(true);
              onToggleExperiences?.(true);
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
            const [cleanId, subItemId] = summitId.split("::");
            const isPeak =
              loc.type === "peak" ||
              peaks.some((p) => p.id === cleanId || p.name.toLowerCase() === cleanId.toLowerCase());

            if (isPeak && !isPeaks && canShowPeaks) setCurrentMode("peaks");
            else if (!isPeak && isPeaks && canShowCountries) setCurrentMode("countries");
            if (loc.type === "experience") setExperiencesMode(true);

            panelOpenedFromStatsRef.current = true;
            panelPushedRef.current = true;

            let item = allItems.find((i) => i.id === cleanId || i.id === summitId);
            if (!item && isPeak) {
              const matchedPeak = peaks.find(
                (p) => p.id === cleanId || p.name.toLowerCase() === cleanId.toLowerCase()
              );
              if (matchedPeak) item = peakToItem(matchedPeak);
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
                    subItems: custom.subItems,
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
              if (matchedCountry) item = countryToItem(matchedCountry);
            }

            if (item) {
              setSelected(subItemId ? { ...item, sub_item_id: subItemId } : item);
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

      {confirmConfig?.isOpen && (
        <ConfirmModal
          isOpen={confirmConfig.isOpen}
          message={confirmConfig.message}
          onConfirm={() => {
            confirmConfig.onConfirm();
            setConfirmConfig(null);
          }}
          onCancel={() => setConfirmConfig(null)}
        />
      )}

      <InstallPrompt
        manualOpen={installPromptOpen}
        onManualClose={() => setInstallPromptOpen(false)}
      />

      {(expSelectorOpen ||
        showTrashModal ||
        editingCustomCategory ||
        selectingCategoryForNewExp ||
        editingCustomExp) && (
        <ExperienceModals
          saving={saving}
          dynamicCategories={dynamicCategories}
          customCategories={customCategories}
          customExperiences={customExperiences}
          hiddenItems={hiddenItems}
          expSelectorOpen={expSelectorOpen}
          setExpSelectorOpen={setExpSelectorOpen}
          showTrashModal={showTrashModal}
          setShowTrashModal={setShowTrashModal}
          editingCustomCategory={editingCustomCategory}
          setEditingCustomCategory={setEditingCustomCategory}
          selectingCategoryForNewExp={selectingCategoryForNewExp}
          setSelectingCategoryForNewExp={setSelectingCategoryForNewExp}
          editingCustomExp={editingCustomExp}
          setEditingCustomExp={setEditingCustomExp}
          onStartPickExpLocation={(subItemKey) => {
            selectingFromRecordRef.current = false;
            setSelectingLocationForExp(subItemKey);
          }}
          onRestoreHiddenItem={handleRestoreHiddenItem}
          onPermanentDelete={handlePermanentDelete}
          onSaveCustomCategory={handleSaveCustomCategory}
          onDeleteCustomCategory={handleDeleteCustomCategory}
          onSaveCustomExperience={handleSaveCustomExperience}
          onDeleteCustomExperience={handleDeleteCustomExperience}
          onHideItem={handleHideItem}
        />
      )}
    </main>
  );
}
