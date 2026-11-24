"use client";

import React from "react";
import { Check, ChevronDown, ChevronUp, Sparkles } from "lucide-react";
import type { YearMonthTimelineResult } from "@/lib/stats-calculations";
import { StatsTimeline } from "./stats-timeline";

interface StatsExperiencesViewProps {
  expMetrics: {
    totalCount: number;
    completedCount: number;
    pct: number;
    categoriesStatus: {
      id: string;
      name: string;
      iconName: string;
      done: number;
      total: number;
      pct: number;
      experiencesList: {
        id: string;
        name: string;
        completed: boolean;
        subItemsDone: number;
        subItemsTotal: number;
      }[];
    }[];
  };
  experiencesTimeline: YearMonthTimelineResult<{ name: string }>;
  timelineCollapsed: boolean;
  expandedRanges: Record<string, boolean>;
  onToggleTimeline: () => void;
  onToggleRange: (id: string) => void;
  onOpenGallery: () => void;
  onGoToRecord: (summitId?: string) => void;
}

export function StatsExperiencesView({
  expMetrics,
  experiencesTimeline,
  timelineCollapsed,
  expandedRanges,
  onToggleTimeline,
  onToggleRange,
  onOpenGallery,
  onGoToRecord,
}: StatsExperiencesViewProps) {
  return (
    <>
      <div className="stats-kpi-grid">
        <div className="stats-kpi-card">
          <div className="stats-kpi-header">
            <span className="stats-kpi-label">Experiencias Registradas</span>
            <svg
              className="stats-kpi-icon"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{ width: 16, height: 16 }}
            >
              <circle cx="12" cy="12" r="10" />
              <circle cx="12" cy="12" r="6" />
              <circle cx="12" cy="12" r="2" />
            </svg>
          </div>
          <div className="stats-kpi-value">
            {expMetrics.completedCount} <small>/ {expMetrics.totalCount}</small>
          </div>
          <span className="stats-kpi-sub">{expMetrics.pct}% completado</span>
          <div className="stats-kpi-progress">
            <div
              className="stats-kpi-progress-bar stats-progress-bar-fill--experience"
              style={{ width: `${expMetrics.pct}%` }}
            />
          </div>
        </div>

        <div className="stats-kpi-card">
          <div className="stats-kpi-header">
            <span className="stats-kpi-label">Por Vivir</span>
            <Sparkles size={16} className="stats-kpi-icon" />
          </div>
          <div className="stats-kpi-value">
            {Math.max(0, expMetrics.totalCount - expMetrics.completedCount)}{" "}
            <small>experiencias</small>
          </div>
          <span className="stats-kpi-sub">Retos y aventuras por descubrir</span>
        </div>
      </div>

      <div className="stats-gallery-btn-wrap">
        <button type="button" className="stats-open-gallery-action-btn" onClick={onOpenGallery}>
          Ver galería
        </button>
      </div>

      <StatsTimeline
        timeline={experiencesTimeline}
        collapsed={timelineCollapsed}
        onToggleCollapsed={onToggleTimeline}
        unitSingular="experiencia"
        unitPlural="experiencias"
        emptyMessage="Aún no has registrado experiencias vividas. Selecciona cualquier experiencia en el mapa para inaugurar tu cronología de aventuras."
        renderChip={(expEntry) => (
          <button
            key={expEntry.summitId}
            type="button"
            className="stats-travel-chip stats-travel-chip--experience"
            onClick={() => onGoToRecord(expEntry.summitId)}
            title={`Abrir registro de ${expEntry.item.name}${
              expEntry.count > 1 ? ` (${expEntry.count} registros)` : ""
            }`}
          >
            <span className="stats-travel-chip-dot stats-travel-chip-dot--experience" />
            <span className="stats-travel-chip-name">{expEntry.item.name}</span>
            {expEntry.count > 1 && (
              <span className="stats-travel-chip-count">({expEntry.count})</span>
            )}
          </button>
        )}
      />

      <div className="stats-section-card">
        <div className="stats-card-title-row">
          <h3 className="stats-card-title">Categorías de Experiencias</h3>
          <span className="stats-card-chip">
            {expMetrics.completedCount} / {expMetrics.totalCount}
          </span>
        </div>
        <div className="stats-progress-list">
          {expMetrics.categoriesStatus.map((cat) => {
            const isExpanded = !!expandedRanges[cat.id];
            return (
              <div key={cat.id} className="stats-range-card">
                <button
                  type="button"
                  className="stats-range-btn"
                  onClick={() => onToggleRange(cat.id)}
                  aria-expanded={isExpanded}
                  aria-label={`${cat.name}: ${isExpanded ? "Ocultar" : "Mostrar"} experiencias`}
                >
                  <div className="stats-range-btn-row">
                    <span className="stats-range-name">{cat.name}</span>
                    <div className="stats-range-meta">
                      <span className="stats-range-count-num">
                        <strong>{cat.done}</strong> / {cat.total}
                      </span>
                      {isExpanded ? (
                        <ChevronUp size={16} className="stats-range-chevron" />
                      ) : (
                        <ChevronDown size={16} className="stats-range-chevron" />
                      )}
                    </div>
                  </div>
                  <div className="stats-progress-bar-track">
                    <div
                      className="stats-progress-bar-fill stats-progress-bar-fill--experience"
                      style={{ width: `${cat.pct}%` }}
                    />
                  </div>
                </button>

                {isExpanded && (
                  <div className="stats-range-dropdown">
                    {cat.experiencesList.map((exp) => (
                      <button
                        key={exp.id}
                        type="button"
                        className="stats-range-peak-row"
                        onClick={() => onGoToRecord(exp.id)}
                        title={`Abrir registro de ${exp.name}`}
                      >
                        <span className="stats-range-peak-info">
                          {exp.completed ? (
                            <span className="stats-range-peak-check stats-range-peak-check--experience">
                              <Check size={13} />
                            </span>
                          ) : (
                            <span className="stats-range-peak-pending">○</span>
                          )}
                          <span className="stats-range-peak-text">
                            <span className="stats-range-peak-name">{exp.name}</span>
                            {exp.subItemsTotal > 0 && (
                              <span className="stats-range-subitems-meta">
                                ({exp.subItemsDone}/{exp.subItemsTotal} sub-ítems)
                              </span>
                            )}
                          </span>
                        </span>
                      </button>
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
