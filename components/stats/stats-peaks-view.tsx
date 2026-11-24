"use client";

import React from "react";
import { Check, ChevronDown, ChevronUp, Flame, Mountain, TrendingUp, Trophy } from "lucide-react";
import type { Peak } from "@/data/peaks";
import type { YearMonthTimelineResult } from "@/lib/stats-calculations";
import { StatsTimeline } from "./stats-timeline";

interface StatsPeaksViewProps {
  metrics: {
    completedPeaksCount: number;
    peaksPct: number;
    totalAltitudeAscended: number;
    highestPeak: Peak | null;
    threeThousanders: {
      id: string;
      name: string;
      altitude: number;
      province: string;
      completed: boolean;
    }[];
    twoThousandersCount: number;
    twoThousandersTotal: number;
    midCount: number;
    midTotal: number;
    lowCount: number;
    lowTotal: number;
    rangesStatus: {
      id: string;
      name: string;
      done: number;
      total: number;
      pct: number;
      peaksList: {
        id: string;
        name: string;
        province: string;
        altitude: number;
        completed: boolean;
      }[];
    }[];
  };
  peaksTimeline: YearMonthTimelineResult<Peak>;
  timelineCollapsed: boolean;
  expandedRanges: Record<string, boolean>;
  onToggleTimeline: () => void;
  onToggleRange: (id: string) => void;
  onOpenGallery: () => void;
  onGoToRecord: (summitId?: string) => void;
}

export function StatsPeaksView({
  metrics,
  peaksTimeline,
  timelineCollapsed,
  expandedRanges,
  onToggleTimeline,
  onToggleRange,
  onOpenGallery,
  onGoToRecord,
}: StatsPeaksViewProps) {
  return (
    <>
      <div className="stats-kpi-grid">
        <div className="stats-kpi-card">
          <div className="stats-kpi-header">
            <span className="stats-kpi-label">Picos Provinciales</span>
            <Mountain size={16} className="stats-kpi-icon" />
          </div>
          <div className="stats-kpi-value">
            {metrics.completedPeaksCount} <small>/ 47</small>
          </div>
          <span className="stats-kpi-sub">{metrics.peaksPct}% completado</span>
          <div className="stats-kpi-progress">
            <div className="stats-kpi-progress-bar" style={{ width: `${metrics.peaksPct}%` }} />
          </div>
        </div>

        <div className="stats-kpi-card">
          <div className="stats-kpi-header">
            <span className="stats-kpi-label">Altitud Total</span>
            <TrendingUp size={16} className="stats-kpi-icon" />
          </div>
          <div className="stats-kpi-value">
            {metrics.totalAltitudeAscended.toLocaleString("es-ES")} <small>m</small>
          </div>
          <span className="stats-kpi-sub">Desnivel acumulado</span>
        </div>
      </div>

      <div className="stats-gallery-btn-wrap">
        <button type="button" className="stats-open-gallery-action-btn" onClick={onOpenGallery}>
          Ver galería
        </button>
      </div>

      <StatsTimeline
        timeline={peaksTimeline}
        collapsed={timelineCollapsed}
        onToggleCollapsed={onToggleTimeline}
        unitSingular="ascenso"
        unitPlural="ascensos"
        emptyMessage="Aún no has registrado ascensos a picos provinciales. Selecciona cualquier cima en el mapa para inaugurar tu cronología de montaña."
        renderChip={(pEntry) => (
          <button
            key={pEntry.summitId}
            type="button"
            className="stats-travel-chip stats-travel-chip--peak"
            onClick={() => onGoToRecord(pEntry.summitId)}
            title={`Abrir registro de ${pEntry.item.name}${
              pEntry.count > 1 ? ` (${pEntry.count} ascensos)` : ""
            }`}
          >
            <span className="stats-travel-chip-dot stats-travel-chip-dot--peak" />
            <span className="stats-travel-chip-name">{pEntry.item.name}</span>
            {pEntry.count > 1 && <span className="stats-travel-chip-count">({pEntry.count})</span>}
          </button>
        )}
      />

      {metrics.highestPeak ? (
        <div className="stats-highlight-banner">
          <div className="stats-highlight-icon-wrap">
            <Trophy size={22} />
          </div>
          <div className="stats-highlight-body">
            <div className="stats-highlight-title">Techo Más Alto Alcanzado</div>
            <div className="stats-highlight-peak-row">
              <h3 className="stats-highlight-text">{metrics.highestPeak.name}</h3>
              <span className="stats-highlight-alt">
                <strong>{Math.round(metrics.highestPeak.altitude).toLocaleString("es-ES")}</strong>{" "}
                <small>m</small>
              </span>
            </div>
            <div className="stats-highlight-sub">
              {metrics.highestPeak.province} · {metrics.highestPeak.range}
            </div>
          </div>
        </div>
      ) : (
        <div className="stats-highlight-banner">
          <div className="stats-highlight-icon-wrap">
            <Flame size={22} />
          </div>
          <div className="stats-highlight-body">
            <div className="stats-highlight-title">El Reto Te Espera</div>
            <h3 className="stats-highlight-text">Comienza tu primera cima</h3>
            <div className="stats-highlight-sub">
              Registra cualquier ascenso en el mapa para inaugurar tus hitos de altitud.
            </div>
          </div>
        </div>
      )}

      <div className="stats-section-card">
        <div className="stats-card-title-row">
          <h3 className="stats-card-title">Techos de +3.000 metros</h3>
          <span className="stats-card-chip">
            {metrics.threeThousanders.filter((p) => p.completed).length} /{" "}
            {metrics.threeThousanders.length}
          </span>
        </div>
        <div className="stats-progress-list">
          {metrics.threeThousanders.map((p) => (
            <div key={p.id} className="stats-progress-row">
              <div className="stats-progress-row-header">
                <span className="stats-range-peak-info">
                  {p.completed ? (
                    <span className="stats-range-peak-check">
                      <Check size={14} />
                    </span>
                  ) : (
                    <span className="stats-range-peak-pending">○</span>
                  )}
                  <span className="stats-range-peak-text">
                    <span className="stats-range-peak-name">{p.name}</span>{" "}
                    <span className="stats-range-peak-province">({p.province})</span>
                  </span>
                </span>
                <span className="stats-peak-alt-num">
                  <strong>{Math.round(p.altitude).toLocaleString("es-ES")}</strong> <small>m</small>
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="stats-section-card">
        <div className="stats-card-title-row">
          <h3 className="stats-card-title">Distribución por Altitud</h3>
        </div>
        <div className="stats-progress-list">
          <div className="stats-progress-row">
            <div className="stats-progress-row-header">
              <span>Alta montaña (+2.000 m)</span>
              <span className="stats-row-num">
                <strong>{metrics.twoThousandersCount}</strong> / {metrics.twoThousandersTotal}
              </span>
            </div>
            <div className="stats-progress-bar-track">
              <div
                className="stats-progress-bar-fill"
                style={{
                  width: `${(metrics.twoThousandersCount / (metrics.twoThousandersTotal || 1)) * 100}%`,
                }}
              />
            </div>
          </div>

          <div className="stats-progress-row">
            <div className="stats-progress-row-header">
              <span>Media montaña (1.000 m – 2.000 m)</span>
              <span className="stats-row-num">
                <strong>{metrics.midCount}</strong> / {metrics.midTotal}
              </span>
            </div>
            <div className="stats-progress-bar-track">
              <div
                className="stats-progress-bar-fill stats-progress-bar-fill--amber"
                style={{ width: `${(metrics.midCount / (metrics.midTotal || 1)) * 100}%` }}
              />
            </div>
          </div>

          <div className="stats-progress-row">
            <div className="stats-progress-row-header">
              <span>Colinas y techos costeros (&lt; 1.000 m)</span>
              <span className="stats-row-num">
                <strong>{metrics.lowCount}</strong> / <strong>{metrics.lowTotal}</strong>
              </span>
            </div>
            <div className="stats-progress-bar-track">
              <div
                className="stats-progress-bar-fill stats-progress-bar-fill--pine"
                style={{ width: `${(metrics.lowCount / (metrics.lowTotal || 1)) * 100}%` }}
              />
            </div>
          </div>
        </div>
      </div>

      <div className="stats-section-card">
        <div className="stats-card-title-row">
          <h3 className="stats-card-title">Grandes Macizos y Cordilleras</h3>
        </div>
        <div className="stats-progress-list">
          {metrics.rangesStatus.map((r) => {
            const isExpanded = !!expandedRanges[r.id];
            return (
              <div key={r.id} className="stats-range-card">
                <button
                  type="button"
                  className="stats-range-btn"
                  onClick={() => onToggleRange(r.id)}
                  aria-expanded={isExpanded}
                  aria-label={`${r.name}: ${isExpanded ? "Ocultar" : "Mostrar"} picos`}
                >
                  <div className="stats-range-btn-row">
                    <span className="stats-range-name">{r.name}</span>
                    <div className="stats-range-meta">
                      <span className="stats-range-count-num">
                        <strong>{r.done}</strong> / {r.total}
                      </span>
                      {isExpanded ? (
                        <ChevronUp size={16} className="stats-range-chevron" />
                      ) : (
                        <ChevronDown size={16} className="stats-range-chevron" />
                      )}
                    </div>
                  </div>
                  <div className="stats-progress-bar-track">
                    <div className="stats-progress-bar-fill" style={{ width: `${r.pct}%` }} />
                  </div>
                </button>

                {isExpanded && (
                  <div className="stats-range-dropdown">
                    {r.peaksList.map((peak) => (
                      <button
                        key={peak.id}
                        type="button"
                        className="stats-range-peak-row"
                        onClick={() => onGoToRecord(peak.id)}
                        title={`Abrir registro de ${peak.name}`}
                      >
                        <span className="stats-range-peak-info">
                          {peak.completed ? (
                            <span className="stats-range-peak-check">
                              <Check size={13} />
                            </span>
                          ) : (
                            <span className="stats-range-peak-pending">○</span>
                          )}
                          <span className="stats-range-peak-text">
                            <span className="stats-range-peak-name">{peak.name}</span>{" "}
                            <span className="stats-range-peak-province">({peak.province})</span>
                          </span>
                        </span>
                        <span className="stats-range-peak-alt">
                          <strong>{Math.round(peak.altitude).toLocaleString("es-ES")}</strong>{" "}
                          <small>m</small>
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
