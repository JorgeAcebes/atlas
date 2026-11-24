"use client";

import type React from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { datesOverlap, syncMutualTripInvitations } from "@/lib/companions";
import { formatDate } from "@/lib/date-utils";
import { compressImage, sortFilesByCaptureTime, sortPhotosByTime } from "@/lib/image-utils";
import { deleteStoragePhotos, getPhotoDisplayUrl, uploadPhotoBlob } from "@/lib/photo-client";
import {
  buildRecordShareUrl,
  executeShare,
  sanitizeDateForShare,
  sanitizeTextForShare,
} from "@/lib/share-utils";
import type { RecordSavePayload } from "../record-form-modal";
import type { Ascent, ExperienceRecord, SelectedItem, SummitPhoto } from "../types";

interface UseRecordMutationsOptions {
  session: Session | null;
  myProfile: { username?: string | null } | null;
  selected: SelectedItem | null;
  isPeaks: boolean;
  ascents: Ascent[];
  setAscents: React.Dispatch<React.SetStateAction<Ascent[]>>;
  photos: SummitPhoto[];
  setPhotos: React.Dispatch<React.SetStateAction<SummitPhoto[]>>;
  experienceRecords: ExperienceRecord[];
  setExperienceRecords: React.Dispatch<React.SetStateAction<ExperienceRecord[]>>;
  selectedPhotos: SummitPhoto[];
  selectedPhotosForEdit: string[];
  setSelectedPhotosForEdit: React.Dispatch<React.SetStateAction<string[]>>;
  hasWishlist: boolean;
  wishlistEntry: Ascent | null;
  wishlistNoteText: string;
  setShowWishlistNoteEditor: (v: boolean) => void;
  setNotice: (msg: string) => void;
  setSaving: (saving: boolean) => void;
  setRecordOpen: (open: boolean) => void;
  setAuthOpen: (tab: "login" | "register" | false) => void;
  setConfirmConfig: React.Dispatch<
    React.SetStateAction<{ isOpen: boolean; message: string; onConfirm: () => void } | null>
  >;
  lightboxPhoto: SummitPhoto | null;
  setLightboxPhoto: React.Dispatch<React.SetStateAction<SummitPhoto | null>>;
  lightboxNewCaption: string;
  setLightboxCaptionModalOpen: (open: boolean) => void;
  setAssignToRecordModalOpen: (open: boolean) => void;
  editorPhoto: SummitPhoto | null;
  setEditorPhoto: (photo: SummitPhoto | null) => void;
}

export function useRecordMutations({
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
}: UseRecordMutationsOptions) {
  async function saveWishlist() {
    if (!supabase || !session || !selected) {
      window.location.hash = "panel";
      setAuthOpen("login");
      return;
    }
    setNotice("");

    if (hasWishlist) {
      const { error } = await supabase
        .from("ascents")
        .delete()
        .match({ user_id: session.user.id, summit_id: selected.id, is_wishlist: true });
      if (error) {
        setNotice(error.message);
        return;
      }
      setAscents((prev) => prev.filter((a) => !(a.summit_id === selected.id && a.is_wishlist)));
      setNotice("Eliminado de tu lista de deseos.");
      return;
    }

    if (ascents.some((a) => a.summit_id === selected.id && !a.is_wishlist)) {
      setNotice("Ya has completado esta cumbre o lugar. No es necesario añadirlo a tu lista de deseos.");
      return;
    }

    const finalDate = new Date().toISOString().slice(0, 10);
    const { error } = await supabase.from("ascents").upsert(
      {
        user_id: session.user.id,
        summit_id: selected.id,
        achieved_on: finalDate,
        end_date: null,
        notes: null,
        is_wishlist: true,
      },
      { onConflict: "user_id,summit_id,achieved_on" }
    );
    if (error) {
      setNotice(error.message);
      return;
    }
    setAscents((prev) => [
      {
        summit_id: selected.id,
        achieved_on: finalDate,
        end_date: null,
        notes: null,
        is_wishlist: true,
      },
      ...prev.filter((a) => !(a.summit_id === selected.id && a.is_wishlist)),
    ]);
    setNotice("¡Añadido a tu lista de deseos!");
  }

  async function saveWishlistNote() {
    if (!supabase || !session || !selected || !wishlistEntry) return;
    const trimmed = wishlistNoteText.trim() || null;
    const { error } = await supabase
      .from("ascents")
      .update({ notes: trimmed })
      .match({ user_id: session.user.id, summit_id: selected.id, is_wishlist: true });
    if (error) {
      setNotice(error.message);
      return;
    }
    setAscents((prev) =>
      prev.map((a) => (a.summit_id === selected.id && a.is_wishlist ? { ...a, notes: trimmed } : a))
    );
    setShowWishlistNoteEditor(false);
    setNotice(trimmed ? "Nota guardada." : "Nota eliminada.");
  }

  async function handleShareRecord(
    item: SelectedItem,
    ascent: Ascent | any,
    _ascentPhotos: SummitPhoto[]
  ) {
    if (!myProfile?.username) {
      setNotice("Necesitas un nombre de usuario para compartir.");
      return;
    }

    const baseUrl = window.location.origin;
    const challenge =
      item.itemType === "experience"
        ? "experiences"
        : item.itemType === "peak" || isPeaks
          ? "peaks"
          : "countries";
    const recordId = item.sub_item_id ? `${item.id}::${item.sub_item_id}` : item.id;
    const profileUrl = buildRecordShareUrl({
      baseUrl,
      username: myProfile.username,
      challenge,
      recordId,
      from: isPeaks ? "mapa" : "social",
    });

    const hasKnownDate = ascent.achieved_on && ascent.achieved_on !== "1900-01-01";
    let dateSuffix = "";
    if (hasKnownDate) {
      const dateStr = formatDate(ascent.achieved_on);
      const endDateStr =
        ascent.end_date && ascent.end_date !== "1900-01-01" && ascent.end_date !== ascent.achieved_on
          ? ` - ${formatDate(ascent.end_date)}`
          : "";
      const dateRange = sanitizeDateForShare(`${dateStr}${endDateStr}`);
      dateSuffix = ` el ${dateRange}`;
    }

    let shareText =
      item.itemType === "peak"
        ? `Mi ascensión a ${item.title}${dateSuffix}`
        : item.itemType === "experience"
          ? `Mi experiencia en ${item.title}${dateSuffix}`
          : `Mi visita a ${item.title}${dateSuffix}`;

    const cleanNotes = sanitizeTextForShare(ascent.notes);
    if (cleanNotes) shareText += `\n"${cleanNotes}"`;
    shareText += `\n\n${profileUrl}`;

    await executeShare(
      {
        title: `${item.title} · @${myProfile.username}`,
        text: shareText,
        url: profileUrl,
      },
      () => setNotice("Enlace copiado al portapapeles")
    );
  }

  async function saveAscent(payload: RecordSavePayload): Promise<{ saved: boolean; tripGroupId?: string | null }> {
    if (!supabase || !session || !selected) return { saved: false };
    const isExperience = selected.itemType === "experience";
    if (isExperience && (!payload.selectedLatLng || payload.selectedLatLng.lat === undefined)) {
      setNotice("Debes registrar la experiencia en el mapa primero.");
      return { saved: false };
    }

    setSaving(true);
    setNotice("");

    const finalDate = payload.isDateUnknown
      ? "1900-01-01"
      : payload.climbDate ?? new Date().toISOString().slice(0, 10);
    const finalEndDate =
      payload.isEndDateEnabled && payload.climbEndDate ? payload.climbEndDate : null;

    if (finalEndDate && finalDate && finalEndDate < finalDate) {
      setNotice("La fecha de fin no puede ser anterior a la fecha de inicio.");
      setSaving(false);
      return { saved: false };
    }

    const expectedSummitId = selected.sub_item_id
      ? `${selected.id}::${selected.sub_item_id}`
      : selected.id;
    const originalAchievedOn = payload.originalAchievedOn;

    if (originalAchievedOn && originalAchievedOn !== finalDate) {
      if (!isExperience) {
        await supabase.from("ascents").delete().match({
          user_id: session.user.id,
          summit_id: selected.id,
          achieved_on: originalAchievedOn,
        });
      }
      await supabase.from("summit_photos").update({ taken_on: finalDate }).match({
        user_id: session.user.id,
        summit_id: expectedSummitId,
        taken_on: originalAchievedOn,
      });
      setPhotos((prev) =>
        prev.map((p) =>
          (p.summit_id === expectedSummitId || p.summit_id === selected.id) &&
          p.taken_on === originalAchievedOn
            ? { ...p, taken_on: finalDate }
            : p
        )
      );
    }

    let tripGroupIdToSave = payload.currentTripGroupId;
    if (payload.selectedCompanions.length > 0 && !tripGroupIdToSave) {
      const existingAscent = ascents.find(
        (a) =>
          a.summit_id === selected.id &&
          (a.achieved_on === finalDate || a.achieved_on === originalAchievedOn) &&
          !a.is_wishlist
      );
      if (existingAscent?.trip_group_id) tripGroupIdToSave = existingAscent.trip_group_id;

      if (!tripGroupIdToSave && isExperience) {
        const existingExp = experienceRecords.find(
          (r) =>
            r.experience_id === selected.id &&
            (r.achieved_on === finalDate || r.achieved_on === originalAchievedOn) &&
            (!selected.sub_item_id || r.sub_item_id === selected.sub_item_id)
        );
        if (existingExp?.trip_group_id) tripGroupIdToSave = existingExp.trip_group_id;
      }

      if (!tripGroupIdToSave) {
        try {
          const { data: existingInvs } = await supabase
            .from("record_companions")
            .select("trip_group_id, start_date, end_date")
            .or(`inviter_id.eq.${session.user.id},companion_id.eq.${session.user.id}`)
            .eq("item_id", selected.id)
            .limit(10);
          const matchingInv = (existingInvs || []).find((inv: any) =>
            datesOverlap(finalDate, finalEndDate, inv.start_date, inv.end_date)
          );
          if (matchingInv?.trip_group_id) tripGroupIdToSave = matchingInv.trip_group_id;
        } catch {
          /* ignore */
        }
      }

      if (!tripGroupIdToSave) tripGroupIdToSave = crypto.randomUUID();
    }

    let isSeparated = false;
    if (payload.originalTripDates && payload.currentTripGroupId) {
      if (
        !datesOverlap(
          finalDate,
          finalEndDate,
          payload.originalTripDates.start,
          payload.originalTripDates.end
        )
      ) {
        isSeparated = true;
        tripGroupIdToSave = null;
      }
    }

    let dbError: any = null;
    if (isExperience) {
      if (payload.editingExpRecordId) {
        const { error } = await supabase
          .from("experience_records")
          .update({
            achieved_on: finalDate,
            notes: payload.notes || null,
            link: payload.link || null,
            link_name: payload.linkName || null,
            link_2: payload.link2 || null,
            link_name_2: payload.linkName2 || null,
            lat: payload.selectedLatLng?.lat,
            lng: payload.selectedLatLng?.lng,
            location_name: payload.locationName || null,
            trip_group_id: tripGroupIdToSave,
          })
          .eq("id", payload.editingExpRecordId);
        dbError = error;
      } else {
        const { error } = await supabase.from("experience_records").insert({
          user_id: session.user.id,
          experience_id: selected.id,
          sub_item_id: selected.sub_item_id || null,
          achieved_on: finalDate,
          notes: payload.notes || null,
          link: payload.link || null,
          link_name: payload.linkName || null,
          link_2: payload.link2 || null,
          link_name_2: payload.linkName2 || null,
          lat: payload.selectedLatLng?.lat,
          lng: payload.selectedLatLng?.lng,
          location_name: payload.locationName || null,
          trip_group_id: tripGroupIdToSave,
        });
        dbError = error;
      }
    } else {
      const { error } = await supabase.from("ascents").upsert(
        {
          user_id: session.user.id,
          summit_id: selected.id,
          achieved_on: finalDate,
          end_date: finalEndDate,
          notes: payload.notes || null,
          link: payload.link || null,
          link_name: payload.linkName || null,
          link_2: payload.link2 || null,
          link_name_2: payload.linkName2 || null,
          trip_group_id: tripGroupIdToSave,
          is_wishlist: false,
        },
        { onConflict: "user_id,summit_id,achieved_on" }
      );
      dbError = error;

      if (!dbError && hasWishlist) {
        await supabase.from("ascents").delete().match({
          user_id: session.user.id,
          summit_id: selected.id,
          is_wishlist: true,
        });
      }
    }

    if (dbError) {
      setNotice(dbError.message);
      setSaving(false);
      return { saved: false };
    }

    if (isSeparated && payload.currentTripGroupId) {
      await supabase
        .from("record_companions")
        .update({
          status: "separated",
          companion_record_id: null,
          updated_at: new Date().toISOString(),
        })
        .eq("trip_group_id", payload.currentTripGroupId)
        .eq("companion_id", session.user.id);
    } else if (tripGroupIdToSave && payload.selectedCompanions.length > 0) {
      for (const comp of payload.selectedCompanions) {
        const syncResult = await syncMutualTripInvitations({
          currentUserId: session.user.id,
          companionId: comp.id,
          itemId: selected.id,
          subItemId: selected.sub_item_id || null,
          startDate: finalDate,
          endDate: finalEndDate,
          currentRecordId: payload.editingExpRecordId || null,
          currentTripGroupId: tripGroupIdToSave as string,
          recordType: isExperience ? "experience" : "ascent",
        });

        const effectiveTripGroupId: string =
          syncResult.resolvedTripGroupId || (tripGroupIdToSave as string);
        const effectiveStatus = syncResult.isMutual
          ? "accepted"
          : payload.companionStatuses[comp.id] || "pending";
        tripGroupIdToSave = effectiveTripGroupId;

        if (syncResult.isMutual && !isExperience) {
          await supabase
            .from("ascents")
            .update({ trip_group_id: effectiveTripGroupId })
            .match({ user_id: session.user.id, summit_id: selected.id, achieved_on: finalDate });
        }

        await supabase.from("record_companions").upsert(
          {
            trip_group_id: effectiveTripGroupId,
            inviter_id: session.user.id,
            companion_id: comp.id,
            record_type: isExperience ? "experience" : "ascent",
            item_type: isPeaks ? "peaks" : isExperience ? "experience" : "countries",
            item_id: selected.id,
            sub_item_id: selected.sub_item_id || null,
            location_name: payload.locationName || selected.title || null,
            start_date: finalDate,
            end_date: finalEndDate,
            original_start_date: finalDate,
            original_end_date: finalEndDate,
            lat: payload.selectedLatLng?.lat || null,
            lng: payload.selectedLatLng?.lng || null,
            status: effectiveStatus,
          },
          { onConflict: "trip_group_id,companion_id" }
        );
      }

      const selectedCompIds = payload.selectedCompanions.map((c) => c.id);
      if (selectedCompIds.length > 0) {
        await supabase
          .from("record_companions")
          .delete()
          .eq("trip_group_id", tripGroupIdToSave)
          .eq("inviter_id", session.user.id)
          .not("companion_id", "in", `(${selectedCompIds.join(",")})`);
      }

      if (tripGroupIdToSave) {
        await supabase
          .from("record_companions")
          .delete()
          .eq("inviter_id", session.user.id)
          .eq("item_id", selected.id)
          .eq("start_date", finalDate)
          .neq("trip_group_id", tripGroupIdToSave);
      }
    }

    // Recompute kept existing photos & gallery additions accurately
    const deletedSet = new Set(payload.deletedRecordPhotoIds);
    const existingRecordPhotos = photos.filter((p) => {
      const matchesSummit =
        p.summit_id === expectedSummitId ||
        (!selected.sub_item_id && p.summit_id === selected.id) ||
        (isExperience &&
          selected.sub_item_id &&
          (p.summit_id === expectedSummitId || p.summit_id === selected.id));
      if (!matchesSummit || deletedSet.has(p.id)) return false;
      if (originalAchievedOn) {
        return p.taken_on === originalAchievedOn || p.taken_on === finalDate;
      }
      return p.taken_on === finalDate;
    });
    const existingIds = new Set(existingRecordPhotos.map((p) => p.id));
    const galleryPhotosToAdd = selectedPhotosForEdit
      .map((id) => photos.find((p) => p.id === id))
      .filter((p): p is SummitPhoto => Boolean(p) && !existingIds.has(p!.id));

    const totalCountToSave =
      existingRecordPhotos.length + galleryPhotosToAdd.length + payload.files.length;
    if (totalCountToSave > 4) {
      setNotice(
        `No puede haber más de 4 fotos en un registro (actualmente hay ${totalCountToSave}). Elimina fotos antes de guardar.`
      );
      setSaving(false);
      return { saved: false };
    }

    if (payload.deletedRecordPhotoIds.length > 0) {
      const toDelete = photos.filter((p) => deletedSet.has(p.id));
      const storagePaths = toDelete.map((p) => p.storage_path).filter(Boolean);
      if (storagePaths.length > 0) {
        await deleteStoragePhotos({ paths: storagePaths, session, supabase });
      }
      await supabase
        .from("summit_photos")
        .delete()
        .in("id", payload.deletedRecordPhotoIds)
        .eq("user_id", session.user.id);
      setPhotos((prev) => prev.filter((p) => !deletedSet.has(p.id)));
    }

    const availableSlots = Math.max(
      0,
      4 - (existingRecordPhotos.length + galleryPhotosToAdd.length)
    );
    const sortedFilesWithTime = await sortFilesByCaptureTime(payload.files, finalDate);
    const filesToUpload = sortedFilesWithTime.slice(0, availableSlots);
    const uploaded: SummitPhoto[] = [];

    const uploadTasks = filesToUpload.map(async ({ file, shotAt }) => {
      if (!file.type.startsWith("image/")) return null;
      try {
        const compressedBlob = await compressImage(file);
        const uploadResult = await uploadPhotoBlob({
          blob: compressedBlob,
          fileName: file.name,
          summitId: selected.id,
          session,
          supabase: supabase!,
        });
        return {
          user_id: session.user.id,
          summit_id: expectedSummitId,
          storage_path: uploadResult.storagePath,
          public_url: uploadResult.publicUrl,
          file_size: uploadResult.fileSize,
          taken_on: finalDate,
          shot_at: shotAt,
        };
      } catch (uploadErr: any) {
        setNotice(`Registro guardado, pero una foto no pudo subirse: ${uploadErr.message}`);
        return null;
      }
    });

    const photoRecordsToInsert = (await Promise.all(uploadTasks)).filter(
      (item): item is NonNullable<typeof item> => Boolean(item)
    );
    if (photoRecordsToInsert.length > 0) {
      const photoResult = await supabase.from("summit_photos").insert(photoRecordsToInsert).select();
      if (photoResult.data) uploaded.push(...(photoResult.data as SummitPhoto[]));
    }

    if (isExperience) {
      const { data } = await supabase
        .from("experience_records")
        .select("*")
        .eq("user_id", session.user.id);
      if (data) setExperienceRecords(data as ExperienceRecord[]);
    } else {
      setAscents((prev) => {
        const remaining = prev.filter(
          (a) =>
            !(
              a.summit_id === selected.id &&
              (a.achieved_on === finalDate ||
                a.achieved_on === originalAchievedOn ||
                a.is_wishlist)
            )
        );
        return [
          {
            summit_id: selected.id,
            achieved_on: finalDate,
            end_date: finalEndDate,
            notes: payload.notes || null,
            link: payload.link || null,
            link_name: payload.linkName || null,
            link_2: payload.link2 || null,
            link_name_2: payload.linkName2 || null,
            trip_group_id: tripGroupIdToSave,
            is_wishlist: false,
          },
          ...remaining,
        ];
      });
    }

    if (uploaded.length > 0) setPhotos((prev) => sortPhotosByTime([...prev, ...uploaded]));
    if (galleryPhotosToAdd.length > 0) {
      const galleryIds = galleryPhotosToAdd.map((p) => p.id);
      await supabase
        .from("summit_photos")
        .update({ taken_on: finalDate, summit_id: expectedSummitId })
        .in("id", galleryIds)
        .eq("user_id", session.user.id);
      setPhotos((prev) =>
        prev.map((p) =>
          galleryIds.includes(p.id)
            ? { ...p, taken_on: finalDate, summit_id: expectedSummitId }
            : p
        )
      );
      setSelectedPhotosForEdit((prev) => prev.filter((id) => !galleryIds.includes(id)));
    }

    setSaving(false);
    setRecordOpen(false);

    const isEdit = isExperience ? Boolean(payload.editingExpRecordId) : Boolean(originalAchievedOn);
    const hasPrevious = isExperience
      ? experienceRecords.some((r) => r.experience_id === selected.id)
      : ascents.some((a) => a.summit_id === selected.id && !a.is_wishlist);

    const message = isEdit
      ? "Cambios guardados."
      : hasPrevious
        ? "Nuevo registro añadido."
        : isPeaks
          ? "Registro guardado. ¡Un pico más en tu lista!"
          : isExperience
            ? "Registro guardado. ¡Una experiencia más en tu lista!"
            : "Registro guardado. ¡Un país más en tu lista!";
    setNotice(message);
    return { saved: true, tripGroupId: tripGroupIdToSave };
  }

  function deleteAscent(editingExpRecordId: string | null, originalAchievedOn: string | null) {
    if (!supabase || !session || !selected || !originalAchievedOn) return;

    const remainingAscents = ascents.filter(
      (a) =>
        a.summit_id === selected.id && a.achieved_on !== originalAchievedOn && !a.is_wishlist
    );
    const registeredDates = new Set(
      ascents.filter((a) => a.summit_id === selected.id && !a.is_wishlist).map((a) => a.achieved_on)
    );
    const hasOtherPhotos = photos.some(
      (p) => p.summit_id === selected.id && !registeredDates.has(p.taken_on)
    );
    const isExperience = selected.itemType === "experience";

    let confirmMessage = isPeaks
      ? "¿Seguro que quieres eliminar esta ascensión?"
      : isExperience
        ? "¿Seguro que quieres eliminar esta experiencia?"
        : "¿Seguro que quieres eliminar la visita a este país?";
    if (remainingAscents.length === 0 && hasOtherPhotos) {
      confirmMessage += ' Se eliminarán también las fotos de "Otras fotos".';
    }

    setConfirmConfig({
      isOpen: true,
      message: confirmMessage,
      onConfirm: async () => {
        if (!supabase || !session || !selected) return;
        setSaving(true);
        setNotice("");

        let deleteError: any = null;
        if (isExperience && editingExpRecordId) {
          const { error } = await supabase
            .from("experience_records")
            .delete()
            .eq("id", editingExpRecordId);
          deleteError = error;
        } else {
          const { error } = await supabase.from("ascents").delete().match({
            user_id: session.user.id,
            summit_id: selected.id,
            achieved_on: originalAchievedOn,
          });
          deleteError = error;
        }

        if (deleteError) {
          setNotice(deleteError.message);
          setSaving(false);
          return;
        }

        if (remainingAscents.length === 0) {
          await supabase
            .from("summit_photos")
            .delete()
            .match({ user_id: session.user.id, summit_id: selected.id });
          setPhotos((prev) => prev.filter((p) => p.summit_id !== selected.id));
        }

        if (isExperience) {
          const { data } = await supabase
            .from("experience_records")
            .select("*")
            .eq("user_id", session.user.id);
          if (data) setExperienceRecords(data as ExperienceRecord[]);
        } else {
          setAscents((prev) =>
            prev.filter(
              (a) => !(a.summit_id === selected.id && a.achieved_on === originalAchievedOn)
            )
          );
        }

        setSaving(false);
        setRecordOpen(false);
        setNotice(
          isPeaks
            ? "Ascensión eliminada."
            : isExperience
              ? "Experiencia eliminada."
              : "País eliminado de tu lista."
        );
      },
    });
  }

  async function handleAddPhotosToDate(
    event: React.ChangeEvent<HTMLInputElement>,
    ascent: Ascent
  ) {
    const nextFiles = Array.from(event.target.files ?? []);
    if (!supabase || !session || !selected) return;

    const expectedSummitId = ascent.sub_item_id
      ? `${selected.id}::${ascent.sub_item_id}`
      : selected.id;
    const existingPhotos = selectedPhotos.filter(
      (p) =>
        p.taken_on === ascent.achieved_on &&
        (p.summit_id === expectedSummitId || p.summit_id === selected.id)
    );
    if (existingPhotos.length + nextFiles.length > 4) {
      const remainingSlots = Math.max(0, 4 - existingPhotos.length);
      setNotice(
        remainingSlots > 0
          ? `Máximo 4 fotos por registro. Solo puedes añadir ${remainingSlots} foto${remainingSlots !== 1 ? "s" : ""} más (ya tienes ${existingPhotos.length}).`
          : "Máximo 4 fotos por registro. Ya has alcanzado el límite de 4 fotos."
      );
      event.target.value = "";
      return;
    }

    const remainingSlots = Math.max(0, 4 - existingPhotos.length);
    const sortedFilesWithTime = await sortFilesByCaptureTime(nextFiles, ascent.achieved_on);
    const filesToUpload = sortedFilesWithTime.slice(0, remainingSlots);

    setSaving(true);
    setNotice("Subiendo fotos...");

    const uploaded: SummitPhoto[] = [];
    const uploadTasks = filesToUpload.map(async ({ file, shotAt }) => {
      if (!file.type.startsWith("image/")) return null;
      try {
        const compressedBlob = await compressImage(file);
        const uploadResult = await uploadPhotoBlob({
          blob: compressedBlob,
          fileName: file.name,
          summitId: selected.id,
          session,
          supabase: supabase!,
        });
        return {
          user_id: session.user.id,
          summit_id: expectedSummitId,
          storage_path: uploadResult.storagePath,
          public_url: uploadResult.publicUrl,
          file_size: uploadResult.fileSize,
          taken_on: ascent.achieved_on,
          shot_at: shotAt,
        };
      } catch (uploadErr: any) {
        setNotice(uploadErr.message || `Error al subir ${file.name}`);
        return null;
      }
    });

    const recordsToInsert = (await Promise.all(uploadTasks)).filter(
      (item): item is NonNullable<typeof item> => Boolean(item)
    );
    if (recordsToInsert.length > 0) {
      const { data } = await supabase.from("summit_photos").insert(recordsToInsert).select();
      if (data) uploaded.push(...(data as SummitPhoto[]));
    }

    if (uploaded.length > 0) setPhotos((prev) => sortPhotosByTime([...prev, ...uploaded]));
    event.target.value = "";
    setSaving(false);
    setNotice(uploaded.length > 0 ? "Fotos subidas correctamente." : "No se subieron fotos.");
  }

  async function handleSaveCaption() {
    if (!session || !lightboxPhoto || !supabase) return;
    setSaving(true);
    const trimmedCaption = lightboxNewCaption.trim();
    const { error } = await supabase
      .from("summit_photos")
      .update({ caption: trimmedCaption || null })
      .eq("id", lightboxPhoto.id)
      .eq("user_id", session.user.id);

    if (error) {
      setNotice(`Error: ${error.message}`);
    } else {
      setPhotos((prev) =>
        prev.map((p) => (p.id === lightboxPhoto.id ? { ...p, caption: trimmedCaption || null } : p))
      );
      setLightboxPhoto((prev) => (prev ? { ...prev, caption: trimmedCaption || null } : null));
      setLightboxCaptionModalOpen(false);
      setNotice("Descripción guardada correctamente.");
    }
    setSaving(false);
  }

  function deletePhoto(photo: SummitPhoto) {
    if (!supabase || !session) return;
    setConfirmConfig({
      isOpen: true,
      message: "¿Seguro que quieres eliminar esta foto?",
      onConfirm: async () => {
        if (!supabase || !session) return;
        setSaving(true);
        setNotice("Eliminando foto...");
        await deleteStoragePhotos({ paths: [photo.storage_path], session, supabase });
        const { error: dbError } = await supabase
          .from("summit_photos")
          .delete()
          .eq("id", photo.id);
        if (dbError) {
          setNotice(dbError.message);
          setSaving(false);
          return;
        }
        setPhotos((prev) => prev.filter((p) => p.id !== photo.id));
        setLightboxPhoto(null);
        if (typeof window !== "undefined" && window.location.hash === "#lightbox") {
          window.history.back();
        }
        setSaving(false);
        setNotice("Foto eliminada correctamente.");
      },
    });
  }

  function handleBatchDeletePhotos() {
    if (!supabase || !session || selectedPhotosForEdit.length === 0) return;
    setConfirmConfig({
      isOpen: true,
      message: `¿Seguro que quieres eliminar ${
        selectedPhotosForEdit.length === 1 ? "1 foto" : `${selectedPhotosForEdit.length} fotos`
      }?`,
      onConfirm: async () => {
        if (!supabase || !session) return;
        setSaving(true);
        setNotice("Eliminando fotos...");
        const storagePaths = photos
          .filter((p) => selectedPhotosForEdit.includes(p.id))
          .map((p) => p.storage_path);
        await deleteStoragePhotos({ paths: storagePaths, session, supabase });
        const { error: dbError } = await supabase
          .from("summit_photos")
          .delete()
          .in("id", selectedPhotosForEdit);
        if (dbError) {
          setNotice(dbError.message);
          setSaving(false);
          return;
        }
        setPhotos((prev) => prev.filter((p) => !selectedPhotosForEdit.includes(p.id)));
        setSelectedPhotosForEdit([]);
        setSaving(false);
        setNotice("Fotos eliminadas correctamente.");
      },
    });
  }

  async function handleAssignPhotosToRecord(targetDate: string) {
    if (!session || !supabase || selectedPhotosForEdit.length === 0 || !selected) return;
    const expectedSummitId = selected.sub_item_id
      ? `${selected.id}::${selected.sub_item_id}`
      : selected.id;
    const existingCount = photos.filter(
      (p) =>
        (p.summit_id === expectedSummitId || p.summit_id === selected.id) &&
        p.taken_on === targetDate &&
        !selectedPhotosForEdit.includes(p.id)
    ).length;

    if (existingCount + selectedPhotosForEdit.length > 4) {
      setNotice(
        `No puede haber más de 4 fotos en total en un solo registro (este registro ya tiene ${existingCount}).`
      );
      return;
    }

    setSaving(true);
    setNotice("Asignando fotos al registro...");
    const { error } = await supabase
      .from("summit_photos")
      .update({ taken_on: targetDate, summit_id: expectedSummitId })
      .in("id", selectedPhotosForEdit)
      .eq("user_id", session.user.id);

    if (error) {
      setNotice(`Error: ${error.message}`);
    } else {
      setPhotos((prev) =>
        prev.map((p) =>
          selectedPhotosForEdit.includes(p.id)
            ? { ...p, taken_on: targetDate, summit_id: expectedSummitId }
            : p
        )
      );
      setNotice(`Fotos asignadas al registro del ${formatDate(targetDate)}.`);
      setAssignToRecordModalOpen(false);
      setSelectedPhotosForEdit([]);
    }
    setSaving(false);
  }

  async function handleSaveEditedPhoto(blob: Blob) {
    if (!editorPhoto || !supabase || !session) return;
    window.history.back();

    const tempUrl = URL.createObjectURL(blob);
    setPhotos((prev) => prev.map((p) => (p.id === editorPhoto.id ? { ...p, public_url: tempUrl } : p)));
    if (lightboxPhoto?.id === editorPhoto.id) {
      setLightboxPhoto((prev) => (prev ? { ...prev, public_url: tempUrl } : null));
    }

    setSaving(true);
    try {
      const uploadResult = await uploadPhotoBlob({
        blob,
        fileName: `${Date.now()}.jpg`,
        summitId: selected?.id || "editor",
        session,
        supabase,
      });
      const finalUrl = getPhotoDisplayUrl(uploadResult.publicUrl, uploadResult.storagePath);
      const { error: dbError } = await supabase
        .from("summit_photos")
        .update({
          storage_path: uploadResult.storagePath,
          public_url: uploadResult.publicUrl,
          file_size: uploadResult.fileSize,
        })
        .eq("id", editorPhoto.id);

      if (!dbError) {
        await deleteStoragePhotos({ paths: [editorPhoto.storage_path], session, supabase });
        setPhotos((prev) =>
          prev.map((p) =>
            p.id === editorPhoto.id
              ? {
                  ...p,
                  storage_path: uploadResult.storagePath,
                  public_url: finalUrl,
                  file_size: uploadResult.fileSize,
                }
              : p
          )
        );
        setLightboxPhoto((prev) =>
          prev && prev.id === editorPhoto.id
            ? {
                ...prev,
                storage_path: uploadResult.storagePath,
                public_url: finalUrl,
                file_size: uploadResult.fileSize,
              }
            : prev
        );
        setNotice("Foto editada correctamente.");
      } else {
        setNotice("Error al actualizar la base de datos.");
      }
    } catch (uploadErr: any) {
      setNotice(uploadErr.message || "Error al subir la imagen editada.");
    } finally {
      URL.revokeObjectURL(tempUrl);
      setEditorPhoto(null);
      setSaving(false);
    }
  }

  return {
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
  };
}
