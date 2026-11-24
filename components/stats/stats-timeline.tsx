"use client";

import React from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { MONTH_NAMES } from "@/lib/date-utils";
import {
  CONTINENT_COLOR_MAP,
  type TimelineGroup,
  type YearMonthTimelineResult,
} from "@/lib/stats-calculations";

interface StatsTimelineProps<TItem> {
  timeline: YearMonthTimelineResult<TItem>;
  collapsed: boolean;
  onToggleCollapsed: () => void;
  unitSingular: string;
  unitPlural: string;
  emptyMessage: string;
  showContinentLegend?: boolean;
  renderChip: (group: TimelineGroup<TItem>) => React.ReactNode;
}

export function StatsTimeline<TItem>({
  timeline,
  collapsed,
  onToggleCollapsed,
  unitSingular,
  unitPlural,
  emptyMessage,
  showContinentLegend = false,
  renderChip,
}: StatsTimelineProps<TItem>) {
  return (
    <div
      className={`stats-section-card stats-travel-timeline-card ${
        collapsed ? "stats-travel-timeline-card--collapsed" : ""
      }`}
    >
      <div className="stats-card-title-row">
        <button
          type="button"
          className="stats-card-title-btn"
          onClick={onToggleCollapsed}
          aria-expanded={!collapsed}
          aria-label={`${collapsed ? "Expandir" : "Contraer"} línea del tiempo`}
        >
          <h3 className="stats-card-title">Línea del tiempo</h3>
          {collapsed ? <ChevronDown size={18} /> : <ChevronUp size={18} />}
        </button>
        <span className="stats-card-chip">
          {timeline.totalCount} {timeline.totalCount === 1 ? unitSingular : unitPlural}
        </span>
      </div>

      {!collapsed && (
        <>
          {showContinentLegend && (
            <div className="stats-timeline-legend">
              {Object.entries(CONTINENT_COLOR_MAP).map(([cName, cColors]) => (
                <span key={cName} className="stats-timeline-legend-item">
                  <span className="stats-timeline-legend-dot" style={{ background: cColors.dot }} />
                  {cName}
                </span>
              ))}
            </div>
          )}

          {timeline.years.length === 0 && timeline.undated.length === 0 ? (
            <div className="stats-empty-notice">{emptyMessage}</div>
          ) : (
            <div className="stats-timeline-years">
              {timeline.years.map((y) => (
                <div key={y.year} className="stats-timeline-year-block">
                  <div className="stats-timeline-year-header">
                    <span className="stats-timeline-year-label">{y.year}</span>
                    <span className="stats-timeline-year-count">
                      <strong>{y.totalCount}</strong>{" "}
                      {y.totalCount === 1 ? unitSingular : unitPlural}
                    </span>
                  </div>

                  <div className="stats-timeline-months-grid">
                    {y.months.map((m) => (
                      <div key={m.month} className="stats-timeline-month-card">
                        <span className="stats-timeline-month-name">{MONTH_NAMES[m.month]}</span>
                        <div className="stats-timeline-chips-wrap">
                          {m.items.map((entry) => renderChip(entry))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}

              {timeline.undated.length > 0 && (
                <div className="stats-timeline-year-block">
                  <div className="stats-timeline-year-header">
                    <span className="stats-timeline-year-label">Sin fecha</span>
                    <span className="stats-timeline-year-count">
                      <strong>{timeline.totalUndated}</strong>{" "}
                      {timeline.totalUndated === 1 ? unitSingular : unitPlural}
                    </span>
                  </div>
                  <div className="stats-timeline-chips-wrap" style={{ marginTop: 6 }}>
                    {timeline.undated.map((entry) => renderChip(entry))}
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
