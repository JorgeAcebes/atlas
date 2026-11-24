"use client";

import React from "react";
import Link from "next/link";
import type { Session } from "@supabase/supabase-js";
import { getPhotoDisplayUrl } from "@/lib/photo-client";
import type { ModeFilter, RankedEntry, ScopeFilter } from "@/hooks/use-ranking-data";

interface RankingTableProps {
  entries: RankedEntry[];
  mode: ModeFilter;
  scope: ScopeFilter;
  session: Session | null;
  loading: boolean;
  searchQuery: string;
  totalPossible: number;
  unit: string;
}

export function RankingTable({
  entries,
  mode,
  scope,
  session,
  loading,
  searchQuery,
  totalPossible,
  unit,
}: RankingTableProps) {
  return (
    <section id="tabla" className="ranking-table-container">
      <div className="ranking-table-head">
        <span>#</span>
        <span>{mode === "peaks" ? "Escalador" : "Explorador"}</span>
        <span>Avance</span>
      </div>

      <div>
        {scope === "following" && !session ? (
          <div className="ranking-empty-msg">Inicia sesión para ver a quién sigues.</div>
        ) : loading ? (
          <div className="ranking-empty-msg">Cargando clasificación...</div>
        ) : entries.length === 0 ? (
          <div className="ranking-empty-msg">
            {searchQuery
              ? `No se encontró a nadie con "${searchQuery}"`
              : scope === "following"
                ? "Aún no sigues a nadie con registros en este reto."
                : "No hay resultados para este filtro todavía."}
          </div>
        ) : (
          entries.map((entry) => {
            const currentRank = entry.rank;
            const medalClass =
              currentRank === 1
                ? " rank-gold"
                : currentRank === 2
                  ? " rank-silver"
                  : currentRank === 3
                    ? " rank-bronze"
                    : "";
            const pct = Math.round((entry.ascents_count / totalPossible) * 100);
            const initial = entry.username ? entry.username.charAt(0).toUpperCase() : "?";
            const isMe = session?.user?.id === entry.user_id;

            return (
              <Link
                key={entry.user_id}
                id={`ranking-row-${entry.user_id}`}
                href={`/perfil/${entry.username}?challenge=${mode}&from=ranking`}
                className={`ranking-row${medalClass} ${isMe ? "ranking-row--me" : ""}`}
              >
                <div className="ranking-rank-num">{String(currentRank).padStart(2, "0")}</div>
                <div className="ranking-who">
                  <div className="ranking-avatar">
                    {entry.avatar_url ? (
                      <img
                        src={getPhotoDisplayUrl(entry.avatar_url)}
                        alt={entry.username}
                        loading="lazy"
                        decoding="async"
                      />
                    ) : (
                      initial
                    )}
                  </div>
                  <div className="ranking-who-text">
                    <span className="ranking-who-name">@{entry.username}</span>
                  </div>
                </div>
                <div className="ranking-stats-col">
                  <div className="ranking-countries-count">
                    {entry.ascents_count} / {totalPossible} {unit}
                  </div>
                  <div className="ranking-bar-track">
                    <div className="ranking-bar-fill" style={{ width: `${pct}%` }} />
                  </div>
                  <span className="ranking-pct">{pct}% completado</span>
                </div>
              </Link>
            );
          })
        )}
      </div>
    </section>
  );
}
