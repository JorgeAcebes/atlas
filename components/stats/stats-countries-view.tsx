"use client";

import React from "react";
import { Check, Globe2, Sparkles } from "lucide-react";
import type { Country } from "@/data/countries";
import {
  CONTINENT_COLOR_MAP,
  type YearMonthTimelineResult,
} from "@/lib/stats-calculations";
import { StatsTimeline } from "./stats-timeline";

interface StatsCountriesViewProps {
  metrics: {
    completedCountriesCount: number;
    countriesPct: number;
    continentsBreakdown: {
      continent: string;
      done: number;
      total: number;
      pct: number;
      countries: string[];
    }[];
  };
  visitsTimeline: YearMonthTimelineResult<Country>;
  timelineCollapsed: boolean;
  onToggleTimeline: () => void;
  onOpenGallery: () => void;
  onGoToRecord: (summitId?: string) => void;
}

const DEFAULT_CONTINENT_COLORS = {
  bg: "rgba(100, 116, 139, 0.12)",
  text: "#475569",
  dot: "#64748b",
};

export function StatsCountriesView({
  metrics,
  visitsTimeline,
  timelineCollapsed,
  onToggleTimeline,
  onOpenGallery,
  onGoToRecord,
}: StatsCountriesViewProps) {
  return (
    <>
      <div className="stats-kpi-grid">
        <div className="stats-kpi-card">
          <div className="stats-kpi-header">
            <span className="stats-kpi-label">Países Explorados</span>
            <Globe2 size={16} className="stats-kpi-icon" />
          </div>
          <div className="stats-kpi-value">
            {metrics.completedCountriesCount} <small>/ 196</small>
          </div>
          <span className="stats-kpi-sub">{metrics.countriesPct}% del planeta visitado</span>
          <div className="stats-kpi-progress stats-kpi-progress--continents">
            {metrics.continentsBreakdown
              .filter((c) => c.done > 0)
              .map((cont) => {
                const color = CONTINENT_COLOR_MAP[cont.continent]?.dot || "#0081C8";
                const segWidthPct = (cont.done / 196) * 100;
                return (
                  <div
                    key={cont.continent}
                    className="stats-kpi-progress-segment"
                    style={{
                      width: `${segWidthPct}%`,
                      backgroundColor: color,
                    }}
                    title={`${cont.continent}: ${cont.done} países`}
                  />
                );
              })}
          </div>
        </div>

        <div className="stats-kpi-card">
          <div className="stats-kpi-header">
            <span className="stats-kpi-label">Por Descubrir</span>
            <Sparkles size={16} className="stats-kpi-icon" />
          </div>
          <div className="stats-kpi-value">
            {196 - metrics.completedCountriesCount} <small>países</small>
          </div>
          <span className="stats-kpi-sub">Resto del atlas mundial</span>
        </div>
      </div>

      <div className="stats-gallery-btn-wrap">
        <button type="button" className="stats-open-gallery-action-btn" onClick={onOpenGallery}>
          Ver galería
        </button>
      </div>

      <StatsTimeline
        timeline={visitsTimeline}
        collapsed={timelineCollapsed}
        onToggleCollapsed={onToggleTimeline}
        unitSingular="visita"
        unitPlural="visitas"
        emptyMessage="Aún no has registrado visitas a países. Selecciona cualquier país en el mapa para inaugurar tu cronología de viajes."
        showContinentLegend
        renderChip={(cEntry) => {
          const colors =
            CONTINENT_COLOR_MAP[cEntry.item.continent] || DEFAULT_CONTINENT_COLORS;
          return (
            <button
              key={cEntry.summitId}
              type="button"
              className="stats-travel-chip"
              style={{
                background: colors.bg,
                color: colors.text,
              }}
              onClick={() => onGoToRecord(cEntry.summitId)}
              title={`Abrir registro de ${cEntry.item.name}${
                cEntry.count > 1 ? ` (${cEntry.count} visitas)` : ""
              }`}
            >
              <span className="stats-travel-chip-dot" style={{ background: colors.dot }} />
              <span className="stats-travel-chip-name">{cEntry.item.name}</span>
              {cEntry.count > 1 && (
                <span className="stats-travel-chip-count">({cEntry.count})</span>
              )}
            </button>
          );
        }}
      />

      <div className="stats-section-card">
        <div className="stats-card-title-row">
          <h3 className="stats-card-title">Desglose por Continentes</h3>
          <span className="stats-card-chip">{metrics.completedCountriesCount} / 196</span>
        </div>

        {metrics.completedCountriesCount > 0 && (
          <div className="stats-continents-chart-wrap">
            <div className="stats-continents-proportion-track">
              {metrics.continentsBreakdown.map((cont) => {
                if (cont.done === 0) return null;
                const sharePct = (cont.done / metrics.completedCountriesCount) * 100;
                const color = CONTINENT_COLOR_MAP[cont.continent]?.dot || "#5b3a8c";
                return (
                  <div
                    key={cont.continent}
                    className="stats-continents-proportion-seg"
                    style={{
                      width: `${sharePct}%`,
                      backgroundColor: color,
                    }}
                    title={`${cont.continent}: ${cont.done} países (${Math.round(sharePct)}%)`}
                  />
                );
              })}
            </div>

            <div className="stats-continents-chart-legend">
              {metrics.continentsBreakdown.map((cont) => {
                if (cont.done === 0) return null;
                const sharePct = Math.round((cont.done / metrics.completedCountriesCount) * 100);
                const color = CONTINENT_COLOR_MAP[cont.continent]?.dot || "#5b3a8c";
                return (
                  <span key={cont.continent} className="stats-continents-legend-item">
                    <span
                      className="stats-continents-legend-dot"
                      style={{ backgroundColor: color }}
                    />
                    <span className="stats-continents-legend-label">{cont.continent}</span>
                    <strong className="stats-continents-legend-pct">{sharePct}%</strong>
                  </span>
                );
              })}
            </div>
          </div>
        )}

        <div className="stats-progress-list">
          {metrics.continentsBreakdown.map((cont) => {
            const contColor = CONTINENT_COLOR_MAP[cont.continent]?.dot || "var(--pine)";
            return (
              <div key={cont.continent} style={{ marginBottom: 12 }}>
                <div className="stats-progress-row-header" style={{ marginBottom: 4 }}>
                  <span style={{ display: "flex", alignItems: "center", gap: 6, fontWeight: 600 }}>
                    <span
                      style={{
                        width: 8,
                        height: 8,
                        borderRadius: "50%",
                        backgroundColor: contColor,
                        display: "inline-block",
                      }}
                    />
                    {cont.continent}
                  </span>
                  <span className="stats-row-num">
                    <strong>{cont.done}</strong> / {cont.total} ({cont.pct}%)
                  </span>
                </div>
                <div className="stats-progress-bar-track">
                  <div
                    className="stats-continent-progress-fill"
                    style={{
                      width: `${cont.pct}%`,
                      backgroundColor: contColor,
                    }}
                  />
                </div>
                {cont.countries.length > 0 && (
                  <div className="stats-chips-cloud" style={{ marginTop: 6 }}>
                    {cont.countries.map((cName) => (
                      <span key={cName} className="stats-chip-item stats-chip-item--done">
                        <Check size={11} /> {cName}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}
