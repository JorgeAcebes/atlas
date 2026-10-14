export async function compressImage(
  file: File | Blob,
  maxWidthPx = 1200,
  quality = 0.75,
  targetFormat: "image/webp" | "image/jpeg" = "image/webp"
): Promise<Blob> {
  let bitmap: ImageBitmap | null = null;
  try {
    // createImageBitmap is widely supported and efficient for this
    bitmap = await createImageBitmap(file);

    let width = bitmap.width;
    let height = bitmap.height;

    // Scale down if dimensions exceed the maximum allowed
    if (width > maxWidthPx || height > maxWidthPx) {
      const ratio = Math.min(maxWidthPx / width, maxWidthPx / height);
      width = Math.round(width * ratio);
      height = Math.round(height * ratio);
    }

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext("2d");
    if (!ctx) return file; // Fallback in case canvas isn't supported

    // Detect if image format may contain an alpha channel (PNG, WebP, GIF, SVG)
    const isTransparentFormat =
      !file.type ||
      file.type === "image/png" ||
      file.type === "image/webp" ||
      file.type === "image/gif" ||
      file.type === "image/svg+xml";

    // When exporting to JPEG, fill white background to prevent transparent pixels from becoming black
    if (targetFormat === "image/jpeg" && isTransparentFormat) {
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, width, height);
    }

    ctx.drawImage(bitmap, 0, 0, width, height);

    return await new Promise((resolve) => {
      // First attempt target format (default: image/webp)
      canvas.toBlob(
        (blob) => {
          if (blob && (blob.type === "image/webp" || blob.type === "image/jpeg")) {
            resolve(blob);
          } else {
            // Fallback to JPEG if WebP blob generation is not supported
            if (isTransparentFormat) {
              ctx.fillStyle = "#ffffff";
              ctx.fillRect(0, 0, width, height);
              ctx.drawImage(bitmap!, 0, 0, width, height);
            }
            canvas.toBlob(
              (fallbackBlob) => resolve(fallbackBlob || file),
              "image/jpeg",
              quality
            );
          }
        },
        targetFormat,
        quality
      );
    });
  } catch (error) {
    console.error("Error compressing image:", error);
    return file; // Fallback to original if anything fails
  } finally {
    if (bitmap) {
      try {
        bitmap.close();
      } catch (err) {
        console.error("Error closing ImageBitmap:", err);
      }
    }
  }
}

/**
 * Intenta leer la fecha y hora de captura original desde los metadatos EXIF (JPEG).
 * Busca los tags DateTimeOriginal (0x9003), CreateDate (0x9004) o DateTime (0x0132).
 */
export async function extractExifDate(file: File | Blob): Promise<Date | null> {
  try {
    if (!file || typeof file.slice !== "function") return null;
    const slice = file.slice(0, 131072); // leer los primeros 128 KB
    const buffer = await slice.arrayBuffer();
    const view = new DataView(buffer);

    // Comprobar SOI JPEG (0xFFD8)
    if (view.byteLength < 4 || view.getUint16(0) !== 0xffd8) {
      return null;
    }

    let offset = 2;
    while (offset < view.byteLength - 4) {
      const marker = view.getUint16(offset);
      offset += 2;

      // APP1 es 0xFFE1
      if (marker === 0xffe1) {
        offset += 2; // saltar longitud de APP1

        // Comprobar "Exif\0\0" (0x45786966, 0x0000)
        if (
          offset + 6 <= view.byteLength &&
          view.getUint32(offset) === 0x45786966 &&
          view.getUint16(offset + 4) === 0x0000
        ) {
          const tiffStart = offset + 6;
          // Orden de bytes: "II" (0x4949 little-endian) o "MM" (0x4D4D big-endian)
          const byteOrder = view.getUint16(tiffStart);
          const littleEndian = byteOrder === 0x4949;

          // Offset de IFD0 relativo a tiffStart
          const ifd0Offset = view.getUint32(tiffStart + 4, littleEndian);
          const dirStart = tiffStart + ifd0Offset;

          const readDateFromIFD = (start: number): Date | null => {
            if (start + 2 > view.byteLength) return null;
            const entries = view.getUint16(start, littleEndian);
            let exifSubIfdOffset = 0;

            for (let i = 0; i < entries; i++) {
              const entryOffset = start + 2 + i * 12;
              if (entryOffset + 12 > view.byteLength) break;
              const tag = view.getUint16(entryOffset, littleEndian);

              // 0x8769 = Exif SubIFD
              if (tag === 0x8769) {
                exifSubIfdOffset = view.getUint32(entryOffset + 8, littleEndian);
              }

              // 0x9003 = DateTimeOriginal, 0x9004 = CreateDate, 0x0132 = DateTime
              if (tag === 0x9003 || tag === 0x9004 || tag === 0x0132) {
                const valueOffset = view.getUint32(entryOffset + 8, littleEndian);
                const strStart = tiffStart + valueOffset;
                if (strStart + 19 <= view.byteLength) {
                  let dateStr = "";
                  for (let j = 0; j < 19; j++) {
                    dateStr += String.fromCharCode(view.getUint8(strStart + j));
                  }
                  // Formato: "YYYY:MM:DD HH:MM:SS"
                  const match = dateStr.match(/^(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2}):(\d{2})$/);
                  if (match) {
                    const [, y, m, d, hh, mm, ss] = match;
                    const date = new Date(
                      parseInt(y, 10),
                      parseInt(m, 10) - 1,
                      parseInt(d, 10),
                      parseInt(hh, 10),
                      parseInt(mm, 10),
                      parseInt(ss, 10)
                    );
                    if (!isNaN(date.getTime())) return date;
                  }
                }
              }
            }

            if (exifSubIfdOffset > 0) {
              return readDateFromIFD(tiffStart + exifSubIfdOffset);
            }
            return null;
          };

          const found = readDateFromIFD(dirStart);
          if (found) return found;
        }
        break;
      } else if ((marker & 0xff00) !== 0xff00 || marker === 0xffda) {
        break;
      } else {
        const markerLength = view.getUint16(offset);
        offset += markerLength;
      }
    }
  } catch {
    // Si falla la lectura de EXIF, retornar null silenciosamente
  }
  return null;
}

/**
 * Extrae la fecha/hora de captura de un fichero de imagen (File | Blob).
 * Prioridad:
 * 1. EXIF DateTimeOriginal / CreateDate
 * 2. Patrón de fecha/hora en el nombre del fichero (e.g. IMG_20241010_143000.jpg)
 * 3. file.lastModified (timestamp del archivo en el dispositivo móvil u ordenador)
 */
export async function extractPhotoCaptureTime(
  file: File | Blob,
  baseDateStr?: string
): Promise<Date | null> {
  // 1. Probar EXIF
  const exifDate = await extractExifDate(file);
  if (exifDate) return exifDate;

  // 2. Probar patrón en el nombre del fichero si es File
  if ("name" in file && typeof file.name === "string") {
    const filename = file.name;
    const dtMatch = filename.match(/(\d{4})[_-]?(\d{2})[_-]?(\d{2})[_\-T\s]+(\d{2})[._\-](\d{2})[._\-](\d{2})/);
    if (dtMatch) {
      const [, y, m, d, hh, mm, ss] = dtMatch;
      const date = new Date(
        parseInt(y, 10),
        parseInt(m, 10) - 1,
        parseInt(d, 10),
        parseInt(hh, 10),
        parseInt(mm, 10),
        parseInt(ss, 10)
      );
      if (!isNaN(date.getTime())) return date;
    }
  }

  // 3. Probar lastModified si es File
  if ("lastModified" in file && typeof file.lastModified === "number" && file.lastModified > 0) {
    const modifiedDate = new Date(file.lastModified);
    if (!isNaN(modifiedDate.getTime())) {
      // Si se proporciona una fecha base del registro (ej. '2026-10-10'), sincronizamos el día
      // pero conservamos la hora, minutos y segundos exactos del archivo
      if (baseDateStr && /^\d{4}-\d{2}-\d{2}$/.test(baseDateStr)) {
        const [y, m, d] = baseDateStr.split("-").map(Number);
        return new Date(
          y,
          m - 1,
          d,
          modifiedDate.getHours(),
          modifiedDate.getMinutes(),
          modifiedDate.getSeconds(),
          modifiedDate.getMilliseconds()
        );
      }
      return modifiedDate;
    }
  }

  return null;
}

/**
 * Ordena ficheros de usuario por hora de captura ascendente (la más temprana primero).
 */
export async function sortFilesByCaptureTime(
  files: File[],
  baseDateStr?: string
): Promise<{ file: File; shotAt: string }[]> {
  const items = await Promise.all(
    files.map(async (file) => {
      const date = await extractPhotoCaptureTime(file, baseDateStr);
      const isoString = date ? date.toISOString() : new Date().toISOString();
      let sortKey = date ? date.getTime() : (file.lastModified || 0);

      // Si no hay fecha o son idénticas, buscar secuencia numérica en el nombre (ej. 1000050860)
      if ("name" in file) {
        const seqMatch = file.name.match(/(\d{8,12})/);
        if (seqMatch) {
          const seq = parseInt(seqMatch[1], 10);
          if (!isNaN(seq)) {
            sortKey += seq;
          }
        }
      }

      return { file, shotAt: isoString, sortKey };
    })
  );

  items.sort((a, b) => {
    if (a.sortKey !== b.sortKey) return a.sortKey - b.sortKey;
    return a.file.name.localeCompare(b.file.name);
  });

  return items.map(({ file, shotAt }) => ({ file, shotAt }));
}

/**
 * Calcula una clave numérica de ordenación para una foto (SummitPhoto).
 * Prioridad:
 * 1. shot_at explícito (timestamp ISO)
 * 2. Patrón de fecha/hora en storage_path / public_url (ej. IMG_20210812_093112.jpg)
 * 3. Secuencia numérica de cámara en filename (ej. 1000050860 vs 1000050885)
 * 4. created_at (timestamp de inserción en BD)
 * 5. taken_on (fecha del ascenso)
 */
export function getPhotoTimeSortKey(photo: {
  shot_at?: string | null;
  created_at?: string;
  storage_path?: string;
  public_url?: string;
  taken_on?: string;
}): number {
  if (photo.shot_at) {
    const t = new Date(photo.shot_at).getTime();
    if (!isNaN(t) && t > 0) return t;
  }

  const path = photo.storage_path || photo.public_url || "";
  const filename = path.split("/").pop() || "";

  // Patrón: YYYYMMDD_HHMMSS o YYYY-MM-DD_HH-MM-SS
  const dtMatch = filename.match(/(\d{4})[_-]?(\d{2})[_-]?(\d{2})[_\-T\s]+(\d{2})[._\-](\d{2})[._\-](\d{2})/);
  if (dtMatch) {
    const [, y, m, d, hh, mm, ss] = dtMatch;
    const date = new Date(
      parseInt(y, 10),
      parseInt(m, 10) - 1,
      parseInt(d, 10),
      parseInt(hh, 10),
      parseInt(mm, 10),
      parseInt(ss, 10)
    );
    if (!isNaN(date.getTime())) return date.getTime();
  }

  // Patrón: HHMMSS aislado
  const timeOnlyMatch = filename.match(/[_\-](\d{2})(\d{2})(\d{2})[._\-]/);
  if (timeOnlyMatch) {
    const [, hh, mm, ss] = timeOnlyMatch;
    const h = parseInt(hh, 10);
    const m = parseInt(mm, 10);
    const s = parseInt(ss, 10);
    if (h >= 0 && h < 24 && m >= 0 && m < 60 && s >= 0 && s < 60) {
      const baseMs = photo.taken_on ? new Date(photo.taken_on).getTime() : 0;
      return baseMs + (h * 3600 + m * 60 + s) * 1000;
    }
  }

  // Secuencia de cámara Android/Google Photos: 1000050860
  const seqMatch = filename.match(/(\d{8,12})/);
  if (seqMatch) {
    const seq = parseInt(seqMatch[1], 10);
    if (!isNaN(seq)) {
      const base = photo.created_at ? new Date(photo.created_at).getTime() : 0;
      return base + seq;
    }
  }

  if (photo.created_at) {
    const t = new Date(photo.created_at).getTime();
    if (!isNaN(t) && t > 0) return t;
  }

  if (photo.taken_on) {
    const t = new Date(photo.taken_on).getTime();
    if (!isNaN(t) && t > 0) return t;
  }

  return 0;
}

/**
 * Ordena un conjunto de fotos por hora de toma ascendente (cronológicamente de más temprana a más tardía).
 * En una cuadrícula de 2 columnas (grid-template-columns: 1fr 1fr):
 * - Índice 0: Arriba a la izquierda (la más temprana)
 * - Índice 1: Arriba a la derecha (la segunda)
 * - Índice 2: Abajo a la izquierda (la tercera)
 * - Índice 3: Abajo a la derecha (la cuarta)
 */
export function sortPhotosByTime<T extends {
  shot_at?: string | null;
  created_at?: string;
  storage_path?: string;
  public_url?: string;
  taken_on?: string;
}>(photos: T[]): T[] {
  if (!photos || photos.length <= 1) return photos ? [...photos] : [];
  return [...photos].sort((a, b) => {
    const keyA = getPhotoTimeSortKey(a);
    const keyB = getPhotoTimeSortKey(b);
    if (keyA !== keyB) return keyA - keyB;
    const pathA = a.storage_path || a.public_url || "";
    const pathB = b.storage_path || b.public_url || "";
    return pathA.localeCompare(pathB);
  });
}
