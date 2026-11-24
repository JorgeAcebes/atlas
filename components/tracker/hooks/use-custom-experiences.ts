"use client";

import type React from "react";
import type { Session } from "@supabase/supabase-js";
import { predefinedCategories } from "@/data/experiences";
import { supabase } from "@/lib/supabase";
import type { HiddenItem } from "../types";

interface UseCustomExperiencesOptions {
  session: Session | null;
  editingCustomCategory: any;
  setEditingCustomCategory: React.Dispatch<React.SetStateAction<any>>;
  editingCustomExp: any;
  setEditingCustomExp: React.Dispatch<React.SetStateAction<any>>;
  customExperiences: any[];
  setCustomCategories: React.Dispatch<React.SetStateAction<any[]>>;
  setCustomExperiences: React.Dispatch<React.SetStateAction<any[]>>;
  setHiddenItems: React.Dispatch<React.SetStateAction<HiddenItem[]>>;
  setExpSelectorOpen: (open: boolean) => void;
  setNotice: (msg: string) => void;
  setSaving: (saving: boolean) => void;
  setConfirmConfig: React.Dispatch<
    React.SetStateAction<{ isOpen: boolean; message: string; onConfirm: () => void } | null>
  >;
}

export function useCustomExperiences({
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
}: UseCustomExperiencesOptions) {
  const handleHideItem = (itemId: string, itemType: "category" | "experience") => {
    setConfirmConfig({
      isOpen: true,
      message:
        itemType === "category"
          ? "¿Estás seguro de que quieres eliminar esta categoría y sus experiencias asociadas?"
          : "¿Estás seguro de que quieres eliminar esta experiencia?",
      onConfirm: async () => {
        if (!supabase || !session) return;
        const { data, error } = await supabase
          .from("hidden_items")
          .insert({ user_id: session.user.id, item_id: itemId, item_type: itemType })
          .select()
          .single();
        if (!error && data) {
          setHiddenItems((prev) => [...prev, data as HiddenItem]);
        } else if (error) {
          setNotice(`Error al ocultar: ${error.message}`);
        }
      },
    });
  };

  async function handleSaveCustomCategory() {
    if (!editingCustomCategory || !editingCustomCategory.name?.trim() || !supabase || !session) {
      return;
    }
    setSaving(true);

    // Invariant 4.2: predefined categories are strictly immutable
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
      const { data, error } = await supabase
        .from("custom_experience_categories")
        .insert({
          user_id: session.user.id,
          name: editingCustomCategory.name.trim(),
          icon_name: editingCustomCategory.icon_name || "star",
        })
        .select()
        .single();
      if (error) setNotice(error.message);
      else if (data) {
        setCustomCategories((prev) => [...prev, data]);
        setEditingCustomCategory(null);
      }
    } else {
      const { data, error } = await supabase
        .from("custom_experience_categories")
        .update({
          name: editingCustomCategory.name.trim(),
          icon_name: editingCustomCategory.icon_name || "star",
        })
        .eq("id", editingCustomCategory.id)
        .select()
        .single();
      if (error) setNotice(error.message);
      else if (data) {
        setCustomCategories((prev) => prev.map((c) => (c.id === data.id ? data : c)));
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

    if (predefinedCategories.some((c) => c.id === targetId)) {
      handleHideItem(targetId, "category");
      if (editingCustomCategory && editingCustomCategory.id === targetId) {
        setEditingCustomCategory(null);
      }
      return;
    }

    setConfirmConfig({
      isOpen: true,
      message: "¿Estás seguro de que quieres eliminar esta categoría y sus experiencias asociadas?",
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
          setCustomExperiences((prev) => prev.filter((c) => c.category_id !== targetId));
          if (editingCustomCategory && editingCustomCategory.id === targetId) {
            setEditingCustomCategory(null);
          }
        }
        setSaving(false);
      },
    });
  }

  function handleDeleteCustomExperience(expId: string) {
    setConfirmConfig({
      isOpen: true,
      message:
        "¿Estás seguro de que quieres eliminar esta experiencia? Se eliminarán también todos los registros asociados.",
      onConfirm: async () => {
        if (!supabase || !session) return;
        setSaving(true);
        const { error } = await supabase.from("custom_experiences").delete().eq("id", expId);
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

  function handlePermanentDelete(item: HiddenItem) {
    setConfirmConfig({
      isOpen: true,
      message:
        item.item_type === "category"
          ? "¿Seguro que quieres borrar TODOS tus registros y fotos de esta categoría? Esta acción no se puede deshacer."
          : "¿Seguro que quieres borrar TODOS tus registros y fotos de esta experiencia? Esta acción no se puede deshacer.",
      onConfirm: async () => {
        if (!supabase || !session) return;
        setSaving(true);
        try {
          if (item.item_type === "category") {
            const staticCat = predefinedCategories.find((c) => c.id === item.item_id);
            const expIds = staticCat ? staticCat.experiences.map((e) => e.id) : [];
            const relatedCustom = customExperiences.filter(
              (c) => c.category_id === item.item_id || c.static_category_id === item.item_id
            );
            expIds.push(...relatedCustom.map((c) => c.id));

            if (expIds.length > 0) {
              await supabase.from("experience_records").delete().in("experience_id", expIds);
            }
            const customExpIds = relatedCustom.map((c) => c.id);
            if (customExpIds.length > 0) {
              await supabase.from("custom_experiences").delete().in("id", customExpIds);
            }
            await supabase.from("custom_experience_categories").delete().eq("id", item.item_id);

            setCustomCategories((prev) => prev.filter((c) => c.id !== item.item_id));
            setCustomExperiences((prev) => prev.filter((c) => c.category_id !== item.item_id));
          } else {
            await supabase.from("experience_records").delete().eq("experience_id", item.item_id);
            await supabase.from("custom_experiences").delete().eq("id", item.item_id);
            setCustomExperiences((prev) => prev.filter((c) => c.id !== item.item_id));
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
    if (!editingCustomExp || !editingCustomExp.name?.trim() || !supabase || !session) return;
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
      subItems =
        lines.length > 0
          ? lines.map((line) => {
              const existing = (editingCustomExp.sub_items || []).find((s: any) => s.name === line);
              return existing || { id: `sub-${crypto.randomUUID()}`, name: line };
            })
          : [];
    } else if (editingCustomExp.sub_items) {
      subItems = editingCustomExp.sub_items;
    }

    if (editingCustomExp.id === "new") {
      const rawCatId = editingCustomExp.category_id;
      const validCategoryId =
        rawCatId && typeof rawCatId === "string" && !rawCatId.startsWith("cat-")
          ? rawCatId
          : null;
      const { data, error } = await supabase
        .from("custom_experiences")
        .insert({
          user_id: session.user.id,
          name: editingCustomExp.name.trim(),
          category_id: validCategoryId,
          static_category_id: editingCustomExp.static_category_id || null,
          sub_items: subItems || [],
        })
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
        setCustomExperiences((prev) => prev.map((c) => (c.id === data.id ? data : c)));
        setEditingCustomExp(null);
        setExpSelectorOpen(true);
      }
    }
    setSaving(false);
  }

  return {
    handleHideItem,
    handleSaveCustomCategory,
    handleDeleteCustomCategory,
    handleDeleteCustomExperience,
    handleRestoreHiddenItem,
    handlePermanentDelete,
    handleSaveCustomExperience,
  };
}
