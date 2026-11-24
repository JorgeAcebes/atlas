"use client";

import React, { useMemo } from "react";
import dynamic from "next/dynamic";
import type { Session } from "@supabase/supabase-js";
import { Check, Diamond, Star, Triangle } from "lucide-react";
import type { ExperienceRecord, SelectedItem, TargetProfile } from "./types";

const SpainMap = dynamic(
  () => import("@/components/spain-map").then((m) => m.SpainMap),
  {
    ssr: false,
    loading: () => (
      <div className="map map-loading">Cargando el mapa de los 52 territorios…</div>
    ),
  }
);

const WorldMap = dynamic(
  () => import("@/components/world-map").then((m) => m.WorldMap),
  {
    ssr: false,
    loading: () => <div className="map map-loading">Cargando el mapa del mundo…</div>,
  }
);

interface TrackerMapSectionProps {
  isPeaks: boolean;
  isReadOnly: boolean;
  isActive: boolean;
  session: Session | null;
  targetProfile?: TargetProfile;
  canShowCountries: boolean;
  experiencesMode: boolean;
  myProfileEnableExperiences: boolean;
  mounted: boolean;
  diffMode: boolean;
  setDiffMode: (val: boolean) => void;
  onToggleExperiences: () => void;
  completedPeakCodes: Set<string>;
  wishlistPeakCodes: Set<string>;
  completedCountryIds: Set<string>;
  wishlistCountryIds: Set<string>;
  diffPeakOnlyViewer: Set<string>;
  diffPeakOnlyTarget: Set<string>;
  diffPeakBoth: Set<string>;
  diffItemOnlyViewer: Set<string>;
  diffItemOnlyTarget: Set<string>;
  diffItemBoth: Set<string>;
  activeSelected: SelectedItem | null;
  experienceRecords: ExperienceRecord[];
  dynamicCategories: Array<{ iconName: string; experiences: Array<{ id: string }> }>;
  selectingLocationForExp: string | null;
  onOpenPeakInformation: (peak: any) => void;
  onOpenPeakRecord: (peak: any) => void;
  onOpenCountryInformation: (country: any) => void;
  onOpenCountryRecord: (country: any) => void;
  onMapClickForExp: (lat: number, lng: number) => void;
  onCancelSelectingLocationForExp: () => void;
  onExperienceClick: (record: ExperienceRecord) => void;
  onOpenExpSelector?: () => void;
}

const EMPTY_EXP_RECORDS: Array<ExperienceRecord & { icon_name?: string }> = [];

export function TrackerMapSection({
  isPeaks,
  isReadOnly,
  isActive,
  session,
  targetProfile,
  canShowCountries,
  experiencesMode,
  myProfileEnableExperiences,
  mounted,
  diffMode,
  setDiffMode,
  onToggleExperiences,
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
  activeSelected,
  experienceRecords,
  dynamicCategories,
  selectingLocationForExp,
  onOpenPeakInformation,
  onOpenPeakRecord,
  onOpenCountryInformation,
  onOpenCountryRecord,
  onMapClickForExp,
  onCancelSelectingLocationForExp,
  onExperienceClick,
  onOpenExpSelector,
}: TrackerMapSectionProps) {
  // Build O(1) lookup map so mappedExperienceRecords only recomputes when records or categories actually change
  const iconNameByExpId = useMemo(() => {
    const map = new Map<string, string>();
    for (const cat of dynamicCategories) {
      for (const exp of cat.experiences) {
        map.set(exp.id, cat.iconName || "telescope");
      }
    }
    return map;
  }, [dynamicCategories]);

  const mappedExperienceRecords = useMemo(() => {
    if (!experiencesMode) return EMPTY_EXP_RECORDS;
    return experienceRecords.map((r) => ({
      ...r,
      icon_name: iconNameByExpId.get(r.experience_id) || "telescope",
    }));
  }, [experiencesMode, experienceRecords, iconNameByExpId]);

  const addExperienceHandler =
    !isReadOnly && !selectingLocationForExp ? onOpenExpSelector : undefined;

  return (
    <section className="map-section">
      <div id="mapa" className="section-heading map-heading-row">
        <div className={`map-legend-area ${diffMode ? "map-legend-area--diff" : ""}`}>
          {diffMode ? (
            <div className="diff-legend">
              <span>
                <i className="legend-diff-dot legend-diff-dot--only-me" /> Solo tú
              </span>
              <span>
                <i className="legend-diff-dot legend-diff-dot--only-them" /> Solo @
                {targetProfile?.username}
              </span>
              <span>
                <i className="legend-diff-dot legend-diff-dot--both" /> Ambos
              </span>
              <span className="diff-legend-item--none">
                <i className="legend-diff-dot legend-diff-dot--none" /> Ninguno
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
              (experiencesMode || (mounted && myProfileEnableExperiences)) && (
                <button
                  type="button"
                  className={`diff-toggle diff-toggle--compact ${
                    experiencesMode ? "diff-toggle--active" : ""
                  }`}
                  onClick={onToggleExperiences}
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

      <div style={{ position: "relative", width: "100%", height: "100%", zIndex: 1 }}>
        {isReadOnly && session && (
          <div className="map-floating-controls">
            <button
              type="button"
              className={`diff-toggle diff-toggle--compact map-floating-btn ${
                diffMode ? "diff-toggle--active map-floating-btn--active" : ""
              }`}
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
            onInformation={onOpenPeakInformation}
            onComplete={onOpenPeakRecord}
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
          <WorldMap
            completed={completedCountryIds}
            wishlist={wishlistCountryIds}
            onInformation={onOpenCountryInformation}
            onComplete={onOpenCountryRecord}
            diffMode={diffMode}
            diffOnlyViewer={diffItemOnlyViewer}
            diffOnlyTarget={diffItemOnlyTarget}
            diffBoth={diffItemBoth}
            activeId={activeSelected?.id}
            experiencesMode={experiencesMode}
            experienceRecords={mappedExperienceRecords}
            selectingLocation={!!selectingLocationForExp}
            onMapClick={onMapClickForExp}
            onCancelSelectingLocation={onCancelSelectingLocationForExp}
            onExperienceClick={onExperienceClick}
            onAddExperience={addExperienceHandler}
            panelOpen={!!activeSelected}
            hasCompareButton={Boolean(isReadOnly && session)}
            isActive={isActive}
          />
        )}
      </div>
    </section>
  );
}
