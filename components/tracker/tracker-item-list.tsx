"use client";

import React, { useCallback, useDeferredValue, useMemo } from "react";
import { Check, Diamond, Star, Triangle, X } from "lucide-react";
import { predefinedCategories } from "@/data/experiences";
import { getIconComponent } from "@/components/icons";
import { MarqueeText } from "@/components/marquee-text";
import { IconEdit, IconSearch, IconTrash } from "./tracker-icons";
import type { Ascent, ListFilter, SelectedItem } from "./types";

const normalizeSearch = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

interface TrackerItemListProps {
  isPeaks: boolean;
  isExp: boolean;
  isReadOnly: boolean;
  listFilter: string;
  setListFilter: (filter: string) => void;
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  totalCount: number;
  achievedCount: number;
  wishlistCount: number;
  sortedItems: SelectedItem[];
  modeAscents: Ascent[];
  completedModeAscents: Ascent[];
  diffMode: boolean;
  diffItemOnlyViewer: Set<string>;
  diffItemOnlyTarget: Set<string>;
  diffItemBoth: Set<string>;
  dynamicCategories: Array<{
    id: string;
    name: string;
    iconName: string;
    experiences: Array<{ id: string; name: string; subItems?: any[] }>;
  }>;
  customExperiences: any[];
  customCategories: any[];
  isEditingExperiences: boolean;
  setIsEditingExperiences: React.Dispatch<React.SetStateAction<boolean>>;
  onOpenInformation: (item: SelectedItem) => void;
  onSetEditingCustomCategory: (cat: any) => void;
  onDeleteCustomCategory: (catId: string) => void;
  onHideItem: (id: string, type: "category" | "experience") => void;
  onOpenTrashModal: () => void;
  onSetEditingCustomExp: (exp: any) => void;
  onDeleteCustomExperience: (expId: string) => void;
  onOpenSelectCategoryForNewExp: () => void;
}

export function TrackerItemList({
  isPeaks,
  isExp,
  isReadOnly,
  listFilter,
  setListFilter,
  searchQuery,
  setSearchQuery,
  totalCount,
  achievedCount,
  wishlistCount,
  sortedItems,
  modeAscents,
  completedModeAscents,
  diffMode,
  diffItemOnlyViewer,
  diffItemOnlyTarget,
  diffItemBoth,
  dynamicCategories,
  customExperiences,
  customCategories,
  isEditingExperiences,
  setIsEditingExperiences,
  onOpenInformation,
  onSetEditingCustomCategory,
  onDeleteCustomCategory,
  onHideItem,
  onOpenTrashModal,
  onSetEditingCustomExp,
  onDeleteCustomExperience,
  onOpenSelectCategoryForNewExp,
}: TrackerItemListProps) {
  const deferredSearchQuery = useDeferredValue(searchQuery);

  // Precompute O(1) lookup structures instead of repeated .some()/.filter() per row
  const { completedIds, completedSubsByExp, wishlistIds, customExpById } = useMemo(() => {
    const compIds = new Set<string>();
    const subsMap = new Map<string, Set<string>>();
    for (const a of completedModeAscents) {
      compIds.add(a.summit_id);
      if (a.sub_item_id) {
        let s = subsMap.get(a.summit_id);
        if (!s) {
          s = new Set<string>();
          subsMap.set(a.summit_id, s);
        }
        s.add(a.sub_item_id);
      }
    }

    const wishIds = new Set<string>();
    for (const a of modeAscents) {
      if (a.is_wishlist) wishIds.add(a.summit_id);
    }

    const custMap = new Map<string, any>();
    for (const c of customExperiences) {
      custMap.set(c.id, c);
    }

    return {
      completedIds: compIds,
      completedSubsByExp: subsMap,
      wishlistIds: wishIds,
      customExpById: custMap,
    };
  }, [completedModeAscents, modeAscents, customExperiences]);

  const isItemDone = useCallback((item: SelectedItem): boolean => {
    if (isExp && item.subItems && item.subItems.length > 0) {
      const doneSubs = completedSubsByExp.get(item.id);
      if (!doneSubs) return false;
      return item.subItems.every((s: any) => doneSubs.has(s.id));
    }
    return completedIds.has(item.id);
  }, [isExp, completedSubsByExp, completedIds]);

  const filteredItems = useMemo(() => {
    const trimmedQuery = deferredSearchQuery.trim();
    const tokens = trimmedQuery
      ? trimmedQuery.split(/\s+/).map(normalizeSearch).filter(Boolean)
      : [];

    return sortedItems.filter((item) => {
      if (tokens.length > 0) {
        const matchesText = tokens.every(
          (t) =>
            normalizeSearch(item.title).includes(t) ||
            (item.label && normalizeSearch(item.label).includes(t)) ||
            (item.detail && normalizeSearch(item.detail).includes(t))
        );
        if (!matchesText) return false;
      }

      if (isExp && listFilter !== "all" && item.detail !== listFilter) {
        return false;
      }
      if (!isExp) {
        const done = isItemDone(item);
        const wish = wishlistIds.has(item.id);
        if (listFilter === "done") return done;
        if (listFilter === "pending") return !done;
        if (listFilter === "wishlist") return wish;
      }
      return true;
    });
  }, [sortedItems, deferredSearchQuery, isExp, listFilter, isItemDone, wishlistIds]);

  const predefinedCategoryIds = useMemo(
    () => new Set(predefinedCategories.map((c) => c.id)),
    []
  );

  return (
    <section className="peak-list-section">
      <div className="peak-list-controls">
        <div
          className="list-filters"
          style={{ overflowX: "auto", whiteSpace: "nowrap", display: "flex" }}
        >
          <button
            type="button"
            className={`list-filter-pill${listFilter === "all" ? " list-filter-pill--active" : ""}`}
            onClick={() => setListFilter("all")}
          >
            Todos <span className="pill-count">{totalCount}</span>
          </button>

          {isExp ? (
            <>
              {dynamicCategories.map((cat) => {
                // Invariant 4.2: predefinedCategories are strictly immutable in name & icon
                const isCustomCat = !predefinedCategoryIds.has(cat.id);
                return (
                  <div key={cat.id} style={{ position: "relative" }}>
                    <button
                      type="button"
                      className={`list-filter-pill${
                        listFilter === cat.name ? " list-filter-pill--active" : ""
                      }`}
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
                        type="button"
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
                          onSetEditingCustomCategory({
                            id: cat.id,
                            name: cat.name,
                            icon_name: cat.iconName,
                          });
                        }}
                      >
                        <IconEdit style={{ width: 10, height: 10 }} strokeWidth={2.5} />
                      </button>
                    )}
                    <button
                      type="button"
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
                          onDeleteCustomCategory(cat.id);
                        } else {
                          onHideItem(cat.id, "category");
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
                        <line x1="18" y1="6" x2="6" y2="18" />
                        <line x1="6" y1="6" x2="18" y2="18" />
                      </svg>
                    </button>
                  </div>
                );
              })}

              {!isReadOnly && (
                <>
                  <button
                    type="button"
                    className="list-filter-pill"
                    onClick={() =>
                      onSetEditingCustomCategory({ id: "new", name: "", iconName: "star" })
                    }
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
                      <line x1="12" y1="5" x2="12" y2="19" />
                      <line x1="5" y1="12" x2="19" y2="12" />
                    </svg>
                    Crear nueva categoría
                  </button>
                  <button
                    type="button"
                    className={`list-filter-pill${
                      isEditingExperiences ? " list-filter-pill--active" : ""
                    }`}
                    onClick={() => setIsEditingExperiences((prev) => !prev)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                      marginLeft: "auto",
                      borderStyle: "solid",
                      borderColor: "var(--pine)",
                      color: isEditingExperiences ? "#fff" : "var(--pine)",
                      background: isEditingExperiences ? "var(--pine)" : "transparent",
                    }}
                  >
                    <IconEdit style={{ width: 14, height: 14 }} />
                    Modificar experiencias
                  </button>
                  <button
                    type="button"
                    className="list-filter-pill"
                    onClick={onOpenTrashModal}
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
                type="button"
                className={`list-filter-pill${
                  listFilter === "done" ? " list-filter-pill--active" : ""
                }`}
                onClick={() => setListFilter("done")}
              >
                {isPeaks ? "Completadas" : "Visitados"}{" "}
                <span className="pill-count">{achievedCount}</span>
              </button>
              <button
                type="button"
                className={`list-filter-pill${
                  listFilter === "pending" ? " list-filter-pill--active" : ""
                }`}
                onClick={() => setListFilter("pending")}
              >
                Pendientes <span className="pill-count">{totalCount - achievedCount}</span>
              </button>
              <button
                type="button"
                className={`list-filter-pill${
                  listFilter === "wishlist" ? " list-filter-pill--active" : ""
                }`}
                onClick={() => setListFilter("wishlist")}
              >
                Quiero ir <span className="pill-count">{wishlistCount}</span>
              </button>
            </>
          )}
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

      <div className="peak-list-grid">
        {filteredItems.map((item) => {
          const done = isItemDone(item);
          const wish = wishlistIds.has(item.id);

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

          const customExp = isExp ? customExpById.get(item.id) : undefined;
          const isCustomExp = Boolean(customExp);
          // Unique stable key handles shared provincial peaks (e.g. Gorbea Álava vs Vizcaya)
          const itemKey = item.label ? `${item.id}-${item.label}` : item.id;

          return (
            <div key={itemKey} style={{ position: "relative", overflow: "hidden" }}>
              <button
                type="button"
                className={itemClass}
                onClick={() => onOpenInformation(item)}
                style={{
                  width: "100%",
                  height: "100%",
                  paddingRight:
                    isExp && isEditingExperiences ? (isCustomExp ? "64px" : "38px") : undefined,
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
                    <i className="legend-pin" style={{ margin: 0 }}>
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
                      <span className="item-province">{item.label}</span>
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
                      type="button"
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
                        onSetEditingCustomExp(
                          customExp || {
                            id: item.id,
                            name: item.title,
                            subItems: item.subItems,
                          }
                        );
                      }}
                    >
                      <IconEdit style={{ width: 14, height: 14 }} strokeWidth={2.5} />
                    </button>
                  )}
                  <button
                    type="button"
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
                      if (isCustomExp) onDeleteCustomExperience(item.id);
                      else onHideItem(item.id, "experience");
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
                      <line x1="18" y1="6" x2="6" y2="18" />
                      <line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                  </button>
                </div>
              )}
            </div>
          );
        })}

        {isExp && !isReadOnly && (
          <button
            type="button"
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
                onSetEditingCustomExp(
                  isPseudoCat
                    ? { id: "new", name: "", category_id: null, static_category_id: null }
                    : isCustomCat
                      ? { id: "new", name: "", category_id: cat.id }
                      : { id: "new", name: "", static_category_id: cat.id }
                );
              } else {
                onOpenSelectCategoryForNewExp();
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
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
            </span>
            <span className="item-info">
              <span className="item-name" style={{ color: "var(--pine)", fontWeight: 600 }}>
                Añadir experiencia
              </span>
            </span>
          </button>
        )}
      </div>
    </section>
  );
}
