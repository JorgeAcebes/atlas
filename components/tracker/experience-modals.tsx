"use client";

import React, { useEffect, useState } from "react";
import { RotateCcw } from "lucide-react";
import { predefinedCategories } from "@/data/experiences";
import { getIconComponent } from "@/components/icons";
import { IconClose, IconTrash } from "./tracker-icons";
import type { HiddenItem } from "./types";

const CUSTOM_CATEGORY_ICONS = [
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
];

interface ExperienceModalsProps {
  saving: boolean;
  dynamicCategories: Array<{
    id: string;
    name: string;
    iconName: string;
    experiences: Array<{ id: string; name: string; subItems?: any[] }>;
  }>;
  customCategories: any[];
  customExperiences: any[];
  hiddenItems: HiddenItem[];
  expSelectorOpen: boolean;
  setExpSelectorOpen: (open: boolean) => void;
  showTrashModal: boolean;
  setShowTrashModal: (open: boolean) => void;
  editingCustomCategory: any;
  setEditingCustomCategory: React.Dispatch<React.SetStateAction<any>>;
  selectingCategoryForNewExp: boolean;
  setSelectingCategoryForNewExp: (open: boolean) => void;
  editingCustomExp: any;
  setEditingCustomExp: React.Dispatch<React.SetStateAction<any>>;
  onStartPickExpLocation: (subItemKey: string) => void;
  onRestoreHiddenItem: (id: string) => void;
  onPermanentDelete: (item: HiddenItem) => void;
  onSaveCustomCategory: () => void;
  onDeleteCustomCategory: (catId?: string | React.MouseEvent) => void;
  onSaveCustomExperience: () => void;
  onDeleteCustomExperience: (expId: string) => void;
  onHideItem: (itemId: string, itemType: "category" | "experience") => void;
}

export function ExperienceModals({
  saving,
  dynamicCategories,
  customCategories,
  customExperiences,
  hiddenItems,
  expSelectorOpen,
  setExpSelectorOpen,
  showTrashModal,
  setShowTrashModal,
  editingCustomCategory,
  setEditingCustomCategory,
  selectingCategoryForNewExp,
  setSelectingCategoryForNewExp,
  editingCustomExp,
  setEditingCustomExp,
  onStartPickExpLocation,
  onRestoreHiddenItem,
  onPermanentDelete,
  onSaveCustomCategory,
  onDeleteCustomCategory,
  onSaveCustomExperience,
  onDeleteCustomExperience,
  onHideItem,
}: ExperienceModalsProps) {
  const [expandedExpCategory, setExpandedExpCategory] = useState<string | null>(null);

  useEffect(() => {
    const anyOpen =
      expSelectorOpen ||
      showTrashModal ||
      Boolean(editingCustomCategory) ||
      selectingCategoryForNewExp ||
      Boolean(editingCustomExp);
    if (!anyOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (editingCustomExp) setEditingCustomExp(null);
      else if (editingCustomCategory) setEditingCustomCategory(null);
      else if (selectingCategoryForNewExp) setSelectingCategoryForNewExp(false);
      else if (showTrashModal) setShowTrashModal(false);
      else if (expSelectorOpen) setExpSelectorOpen(false);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    expSelectorOpen,
    showTrashModal,
    editingCustomCategory,
    selectingCategoryForNewExp,
    editingCustomExp,
    setEditingCustomExp,
    setEditingCustomCategory,
    setSelectingCategoryForNewExp,
    setShowTrashModal,
    setExpSelectorOpen,
  ]);

  const currentSubItemsStr = editingCustomExp
    ? editingCustomExp.sub_items_input !== undefined
      ? editingCustomExp.sub_items_input
      : editingCustomExp.subItems || editingCustomExp.sub_items
        ? (editingCustomExp.subItems || editingCustomExp.sub_items)
            .map((s: any) => s.name)
            .join("\n")
        : ""
    : "";

  const hasMiniExperiences = editingCustomExp
    ? editingCustomExp.has_sub_items !== undefined
      ? Boolean(editingCustomExp.has_sub_items)
      : currentSubItemsStr.length > 0
    : false;

  const miniExpList: string[] = hasMiniExperiences
    ? currentSubItemsStr
      ? currentSubItemsStr.split("\n")
      : [""]
    : [];

  return (
    <>
      {expSelectorOpen && (
        <div
          className="modal-backdrop"
          onClick={() => setExpSelectorOpen(false)}
          onWheel={(e) => e.stopPropagation()}
        >
          <div
            className="auth-dialog"
            role="dialog"
            aria-modal="true"
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
              <h3 style={{ margin: 0, paddingRight: 32 }}>Elige una categoría</h3>
              <button
                type="button"
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
                const isExpanded = expandedExpCategory === cat.id;
                return (
                  <div key={cat.id} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    <button
                      type="button"
                      className="button button--outline"
                      style={{
                        justifyContent: "flex-start",
                        padding: "12px 16px",
                        fontWeight: 500,
                        width: "100%",
                      }}
                      onClick={() => setExpandedExpCategory(isExpanded ? null : cat.id)}
                    >
                      <span style={{ marginRight: 12, color: "var(--pine)", display: "flex" }}>
                        {cat.iconName && getIconComponent(cat.iconName, 18)}
                      </span>
                      {cat.name}
                    </button>

                    {isExpanded && (
                      <div style={{ padding: "4px 0 12px 16px" }}>
                        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                          {cat.experiences.map((exp) => (
                            <div key={exp.id} style={{ marginBottom: "8px" }}>
                              {!exp.subItems ? (
                                <div style={{ display: "flex", gap: 6 }}>
                                  <button
                                    type="button"
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
                                    onClick={() => {
                                      onStartPickExpLocation(`${exp.id}::`);
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
                                      style={{ width: 16, height: 16, opacity: 0.7 }}
                                    >
                                      <circle cx="12" cy="12" r="10" />
                                      <polyline points="12 16 16 12 12 8" />
                                      <line x1="8" y1="12" x2="16" y2="12" />
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
                                      gridTemplateColumns: "repeat(auto-fill, minmax(130px, 1fr))",
                                      gap: 8,
                                    }}
                                  >
                                    {exp.subItems.map((item: any) => (
                                      <button
                                        key={item.id}
                                        type="button"
                                        className="button button--outline button--small"
                                        style={{ justifyContent: "center", transition: "all 0.2s" }}
                                        onClick={() => {
                                          onStartPickExpLocation(`${exp.id}::${item.id}`);
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
                          ))}
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
            role="dialog"
            aria-modal="true"
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
                type="button"
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
                    const staticCat = predefinedCategories.find((c) => c.id === item.item_id);
                    const customCat = customCategories.find((c) => c.id === item.item_id);
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
                    const customExp = customExperiences.find((e) => e.id === item.item_id);
                    if (customExp) {
                      name = customExp.name;
                      if (customExp.category_id) {
                        const parentCat = customCategories.find(
                          (c) => c.id === customExp.category_id
                        );
                        if (parentCat) icon = parentCat.icon_name;
                      } else if (customExp.static_category_id) {
                        const parentCat = predefinedCategories.find(
                          (c) => c.id === customExp.static_category_id
                        );
                        if (parentCat) icon = parentCat.iconName;
                      }
                    } else {
                      for (const c of predefinedCategories) {
                        const ex = c.experiences.find((e) => e.id === item.item_id);
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
                          <div style={{ fontSize: "0.8rem", color: "var(--muted)" }}>
                            {item.item_type === "category" ? "Categoría" : "Experiencia"}
                          </div>
                        </div>
                      </div>
                      <div style={{ display: "flex", gap: 6, marginLeft: 12 }}>
                        <button
                          type="button"
                          className="button button--quiet button--small"
                          disabled={saving}
                          onClick={() => onRestoreHiddenItem(item.id)}
                          style={{ padding: "6px", minWidth: "auto", height: "auto" }}
                          title="Restaurar"
                        >
                          <RotateCcw size={16} />
                        </button>
                        {!isStatic && (
                          <button
                            type="button"
                            className="button button--quiet button--small"
                            disabled={saving}
                            style={{
                              color: "var(--danger, #a34f3d)",
                              padding: "6px",
                              minWidth: "auto",
                              height: "auto",
                            }}
                            onClick={() => onPermanentDelete(item)}
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
          onClick={() => setEditingCustomCategory(null)}
          onWheel={(e) => e.stopPropagation()}
        >
          <div
            className="auth-dialog"
            role="dialog"
            aria-modal="true"
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
                {editingCustomCategory.id === "new" ? "Crear Categoría" : "Editar Categoría"}
              </h3>
              <button
                type="button"
                className="icon-button"
                onClick={() => setEditingCustomCategory(null)}
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
                <label style={{ display: "block", marginBottom: 8, fontWeight: 500 }}>
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
                <label style={{ display: "block", marginBottom: 8, fontWeight: 500 }}>Icono</label>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fill, minmax(44px, 1fr))",
                    gap: 10,
                  }}
                >
                  {CUSTOM_CATEGORY_ICONS.map((iconValue) => {
                    const isIconSelected =
                      (editingCustomCategory.icon_name || "star") === iconValue;
                    return (
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
                          border: isIconSelected
                            ? "2px solid var(--pine)"
                            : "1px solid var(--border)",
                          background: isIconSelected ? "var(--surface)" : "var(--background)",
                          color: isIconSelected ? "var(--pine)" : "var(--foreground)",
                          cursor: "pointer",
                          transition: "all 0.2s ease",
                        }}
                        onClick={() =>
                          setEditingCustomCategory({
                            ...editingCustomCategory,
                            icon_name: iconValue,
                          })
                        }
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
                    );
                  })}
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
                  type="button"
                  className="button button--quiet"
                  style={{ color: "var(--danger, #a34f3d)" }}
                  disabled={saving}
                  onClick={onDeleteCustomCategory}
                >
                  Eliminar
                </button>
              ) : (
                <div />
              )}
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  type="button"
                  className="button button--outline"
                  onClick={() => setEditingCustomCategory(null)}
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  className="button"
                  disabled={saving || !editingCustomCategory.name?.trim()}
                  onClick={onSaveCustomCategory}
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
            role="dialog"
            aria-modal="true"
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
                type="button"
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
                  type="button"
                  className="button button--outline"
                  style={{ justifyContent: "flex-start", padding: "12px 16px", fontWeight: 500 }}
                  onClick={() => {
                    const isPseudoCat = cat.id.startsWith("cat-custom-");
                    const isCustomCat = customCategories.some((c) => c.id === cat.id);
                    setEditingCustomExp(
                      isPseudoCat
                        ? { id: "new", name: "", category_id: null, static_category_id: null }
                        : isCustomCat
                          ? { id: "new", name: "", category_id: cat.id }
                          : { id: "new", name: "", static_category_id: cat.id }
                    );
                    setSelectingCategoryForNewExp(false);
                  }}
                >
                  <span style={{ marginRight: 12, color: "var(--pine)", display: "flex" }}>
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
          onClick={() => setEditingCustomExp(null)}
          onWheel={(e) => e.stopPropagation()}
        >
          <div
            className="auth-dialog"
            role="dialog"
            aria-modal="true"
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
                {editingCustomExp.id === "new" ? "Crear Experiencia" : "Editar Experiencia"}
              </h3>
              <button
                type="button"
                className="icon-button"
                onClick={() => setEditingCustomExp(null)}
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
                <label style={{ display: "block", marginBottom: 8, fontWeight: 500 }}>Nombre</label>
                <input
                  type="text"
                  value={editingCustomExp.name || ""}
                  onChange={(e) =>
                    setEditingCustomExp({ ...editingCustomExp, name: e.target.value })
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
                  <label style={{ margin: 0, fontWeight: 500 }}>Mini-experiencias</label>
                  <button
                    type="button"
                    aria-label="Activar mini-experiencias"
                    onClick={() =>
                      setEditingCustomExp({
                        ...editingCustomExp,
                        has_sub_items: !hasMiniExperiences,
                        sub_items_input: "",
                      })
                    }
                    style={{
                      width: 44,
                      height: 24,
                      borderRadius: 12,
                      background: hasMiniExperiences ? "var(--pine)" : "#71717a",
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
                        left: hasMiniExperiences ? 22 : 2,
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

                {hasMiniExperiences && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 12 }}>
                    {miniExpList.map((item, idx) => (
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
                          <IconTrash style={{ width: 18, height: 18 }} />
                        </button>
                      </div>
                    ))}
                    <button
                      type="button"
                      onClick={() =>
                        setEditingCustomExp({
                          ...editingCustomExp,
                          sub_items_input: [...miniExpList, ""].join("\n"),
                          has_sub_items: true,
                        })
                      }
                      className="button button--outline button--small"
                      style={{ alignSelf: "flex-start", marginTop: 4 }}
                    >
                      + Añadir mini experiencia
                    </button>
                  </div>
                )}
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
                  type="button"
                  className="button button--quiet"
                  style={{ color: "var(--danger, #a34f3d)" }}
                  disabled={saving}
                  onClick={() => {
                    const isCustom = customExperiences.some((c) => c.id === editingCustomExp.id);
                    if (isCustom) onDeleteCustomExperience(editingCustomExp.id);
                    else onHideItem(editingCustomExp.id, "experience");
                    setEditingCustomExp(null);
                  }}
                >
                  Eliminar
                </button>
              ) : (
                <div />
              )}
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  type="button"
                  className="button button--outline"
                  onClick={() => setEditingCustomExp(null)}
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  className="button"
                  disabled={saving || !editingCustomExp.name?.trim()}
                  onClick={onSaveCustomExperience}
                >
                  {saving ? "Guardando..." : "Guardar"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
