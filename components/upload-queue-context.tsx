"use client";

import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { Check, AlertCircle, RefreshCw, X } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { precompressPhotoFile } from "@/lib/image-utils";
import { seedPhotoServiceWorkerCache } from "@/lib/image-preloader";
import { getPhotoDisplayUrl, uploadPhotoBlobsBatch } from "@/lib/photo-client";
import type { SummitPhoto } from "@/components/tracker/types";

export interface QueuedPhotoItem {
  tempId: string;
  tempUrl: string;
  file: File | Blob;
  fileName: string;
  shotAt: string;
}

export interface EnqueuePhotoUploadJob {
  items: QueuedPhotoItem[];
  summitId: string;
  expectedSummitId: string;
  takenOn: string;
  userId: string;
  session: any;
  onComplete: (result: { inserted: SummitPhoto[]; replacedTempIds: string[] }) => void;
  onDiscardFailed?: (tempIds: string[]) => void;
}

interface UploadJobState {
  id: string;
  totalCount: number;
  uploadedCount: number;
  status: "uploading" | "done" | "error";
  errorMessage?: string;
  job: EnqueuePhotoUploadJob;
}

interface UploadQueueContextValue {
  enqueuePhotoUpload: (job: EnqueuePhotoUploadJob) => void;
  hasActiveUploads: boolean;
}

const UploadQueueContext = createContext<UploadQueueContextValue>({
  enqueuePhotoUpload: () => {},
  hasActiveUploads: false,
});

export function UploadQueueProvider({ children }: { children: React.ReactNode }) {
  const [jobs, setJobs] = useState<UploadJobState[]>([]);
  const mountedRef = useRef(true);
  const dismissTimersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  useEffect(() => {
    mountedRef.current = true;
    const timers = dismissTimersRef.current;
    return () => {
      mountedRef.current = false;
      Object.values(timers).forEach(clearTimeout);
    };
  }, []);

  const hasActiveUploads = jobs.some((j) => j.status === "uploading");

  // Guard strictly while an upload batch is actively in flight so users don't accidentally drop photos
  useEffect(() => {
    if (!hasActiveUploads || typeof window === "undefined") return;
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [hasActiveUploads]);

  const executeJob = useCallback(async (jobId: string, job: EnqueuePhotoUploadJob) => {
    try {
      if (!supabase) {
        throw new Error("Cliente Supabase no disponible.");
      }

      const validItems = job.items.filter(
        (item) => !item.file.type || item.file.type.startsWith("image/")
      );
      if (validItems.length === 0) {
        if (mountedRef.current) {
          setJobs((prev) => prev.filter((j) => j.id !== jobId));
        }
        return;
      }

      const compressedBlobs = await Promise.all(
        validItems.map((item) => precompressPhotoFile(item.file))
      );

      if (mountedRef.current) {
        setJobs((prev) =>
          prev.map((j) =>
            j.id === jobId ? { ...j, uploadedCount: Math.max(0, Math.floor(validItems.length / 2)) } : j
          )
        );
      }

      const uploadResults = await uploadPhotoBlobsBatch({
        items: validItems.map((item, idx) => ({
          blob: compressedBlobs[idx],
          fileName: item.fileName,
        })),
        summitId: job.summitId,
        session: job.session,
      });

      const rowsToInsert = uploadResults.map((res, idx) => ({
        user_id: job.userId,
        summit_id: job.expectedSummitId,
        storage_path: res.storagePath,
        public_url: res.publicUrl,
        file_size: res.fileSize,
        taken_on: job.takenOn,
        shot_at: validItems[idx].shotAt,
      }));

      const { data: insertedData, error: dbError } = await supabase
        .from("summit_photos")
        .insert(rowsToInsert)
        .select();

      if (dbError || !insertedData) {
        throw new Error(dbError?.message || "No se pudieron guardar las fotos en la base de datos.");
      }

      const insertedPhotos = insertedData as SummitPhoto[];

      // Seed the Service Worker cache directly from the compressed local Blob so zero extra download occurs
      await Promise.all(
        insertedPhotos.map((row, idx) => {
          const blob = compressedBlobs[idx];
          const displayUrl = getPhotoDisplayUrl(row.public_url, row.storage_path);
          return blob && displayUrl ? seedPhotoServiceWorkerCache(displayUrl, blob) : Promise.resolve();
        })
      );

      job.onComplete({
        inserted: insertedPhotos,
        replacedTempIds: job.items.map((item) => item.tempId),
      });

      // Defer revoking blob: URLs briefly so swapped display URLs stay painted with zero flicker
      setTimeout(() => {
        job.items.forEach((item) => {
          if (item.tempUrl.startsWith("blob:")) {
            try {
              URL.revokeObjectURL(item.tempUrl);
            } catch {
              /* ignore */
            }
          }
        });
      }, 400);

      if (mountedRef.current) {
        setJobs((prev) =>
          prev.map((j) =>
            j.id === jobId ? { ...j, status: "done", uploadedCount: j.totalCount } : j
          )
        );
        if (dismissTimersRef.current[jobId]) clearTimeout(dismissTimersRef.current[jobId]);
        dismissTimersRef.current[jobId] = setTimeout(() => {
          if (mountedRef.current) {
            setJobs((prev) => prev.filter((j) => j.id !== jobId));
          }
          delete dismissTimersRef.current[jobId];
        }, 2500);
      }
    } catch (err: any) {
      if (mountedRef.current) {
        setJobs((prev) =>
          prev.map((j) =>
            j.id === jobId
              ? {
                  ...j,
                  status: "error",
                  errorMessage: err?.message || "Error al subir las fotos.",
                }
              : j
          )
        );
      }
    }
  }, []);

  const enqueuePhotoUpload = useCallback(
    (job: EnqueuePhotoUploadJob) => {
      if (!job.items || job.items.length === 0) return;
      const id =
        typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random()}`;
      setJobs((prev) => [
        ...prev,
        {
          id,
          totalCount: job.items.length,
          uploadedCount: 0,
          status: "uploading",
          job,
        },
      ]);
      void executeJob(id, job);
    },
    [executeJob]
  );

  const handleRetry = (jobState: UploadJobState) => {
    setJobs((prev) =>
      prev.map((j) =>
        j.id === jobState.id
          ? { ...j, status: "uploading", uploadedCount: 0, errorMessage: undefined }
          : j
      )
    );
    void executeJob(jobState.id, jobState.job);
  };

  const handleDismiss = (jobState: UploadJobState) => {
    if (jobState.status === "error") {
      jobState.job.onDiscardFailed?.(jobState.job.items.map((item) => item.tempId));
      jobState.job.items.forEach((item) => {
        if (item.tempUrl.startsWith("blob:")) {
          try {
            URL.revokeObjectURL(item.tempUrl);
          } catch {
            /* ignore */
          }
        }
      });
    }
    if (dismissTimersRef.current[jobState.id]) {
      clearTimeout(dismissTimersRef.current[jobState.id]);
      delete dismissTimersRef.current[jobState.id];
    }
    setJobs((prev) => prev.filter((j) => j.id !== jobState.id));
  };

  return (
    <UploadQueueContext.Provider value={{ enqueuePhotoUpload, hasActiveUploads }}>
      {children}
      {jobs.length > 0 && (
        <div className="upload-queue-stack" role="status" aria-live="polite">
          {jobs.map((jobState) => (
            <div
              key={jobState.id}
              className={`upload-queue-toast upload-queue-toast--${jobState.status}`}
            >
              {jobState.status === "uploading" && (
                <>
                  <span className="upload-queue-spinner" aria-hidden="true" />
                  <span className="upload-queue-text">
                    {jobState.totalCount === 1
                      ? "Subiendo foto en segundo plano..."
                      : `Subiendo ${jobState.totalCount} fotos (${jobState.uploadedCount}/${jobState.totalCount})...`}
                  </span>
                </>
              )}
              {jobState.status === "done" && (
                <>
                  <Check size={15} className="upload-queue-icon-done" aria-hidden="true" />
                  <span className="upload-queue-text">
                    {jobState.totalCount === 1 ? "Foto subida" : "Fotos subidas"}
                  </span>
                </>
              )}
              {jobState.status === "error" && (
                <>
                  <AlertCircle size={15} className="upload-queue-icon-err" aria-hidden="true" />
                  <span className="upload-queue-text" title={jobState.errorMessage}>
                    {jobState.errorMessage || "Error al subir fotos"}
                  </span>
                  <button
                    type="button"
                    className="upload-queue-btn"
                    onClick={() => handleRetry(jobState)}
                    title="Reintentar subida"
                  >
                    <RefreshCw size={13} />
                    Reintentar
                  </button>
                  <button
                    type="button"
                    className="upload-queue-close"
                    onClick={() => handleDismiss(jobState)}
                    aria-label="Cerrar aviso"
                    title="Cerrar"
                  >
                    <X size={14} />
                  </button>
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </UploadQueueContext.Provider>
  );
}

export function useUploadQueue() {
  return useContext(UploadQueueContext);
}
