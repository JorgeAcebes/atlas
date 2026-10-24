/**
 * Utilidades para compartir registros en WhatsApp y otras aplicaciones.
 * 
 * 1. Sanitización de fechas: Evita que WhatsApp, Apple NSDataDetector (iOS)
 *    y Android Linkify reconozcan las fechas como enlaces o eventos de calendario,
 *    insertando un Zero-Width Non-Joiner (\u200C / ZWNJ) invisible en la abreviatura del mes.
 *    Visualmente es 100% idéntico para el ojo humano, pero rompe las expresiones regulares
 *    del sistema operativo.
 * 
 * 2. Deep links enriquecidos: Genera URLs con parámetro ?record=... y fragmento #panel=...,
 *    permitiendo que el crawler del servidor cargue los metadatos Open Graph (fotos y título)
 *    y que la aplicación cliente abra automáticamente el panel del registro.
 */

const SPANISH_MONTHS = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
  "ene", "feb", "mar", "abr", "may", "jun",
  "jul", "ago", "sep", "oct", "nov", "dic",
];

// Carácter invisible Unicode Zero-Width Non-Joiner
export const ZWNJ = "\u200C";

/**
 * Inserta un carácter invisible ZWNJ en las palabras que representan meses
 * y en separadores de fecha para evitar que WhatsApp o iOS Data Detectors
 * conviertan la fecha en un hipervínculo azul de calendario.
 */
export function sanitizeDateForShare(dateStr: string | null | undefined): string {
  if (!dateStr) return "";

  let result = dateStr;

  // 1. Romper nombres y abreviaturas de meses en español (ej: "15 oct 2024" -> "15 o‌ct 2024")
  // Insertamos ZWNJ tras la primera letra del mes para romper el token del diccionario del detector
  for (const month of SPANISH_MONTHS) {
    const regex = new RegExp(`\\b(${month})\\b`, "gi");
    result = result.replace(regex, (match) => {
      if (match.length <= 1) return match;
      return match[0] + ZWNJ + match.slice(1);
    });
  }

  // 2. Romper fechas numéricas si las hubiera (ej: 15/10/2024 -> 15‌/‌10‌/‌2024)
  result = result.replace(/(\d{1,4})([/.-])(\d{1,2})([/.-])(\d{2,4})/g, (_m, p1, s1, p2, s2, p3) => {
    return `${p1}${ZWNJ}${s1}${ZWNJ}${p2}${ZWNJ}${s2}${ZWNJ}${p3}`;
  });

  return result;
}

/**
 * Construye la URL canónica de compartición de un registro.
 * Incluye tanto ?record=... para que el servidor genere el Open Graph preview con la foto,
 * como #panel=... para navegación directa en el cliente.
 */
export function buildRecordShareUrl(options: {
  baseUrl: string;
  username: string;
  challenge: "peaks" | "countries" | "experiences" | string;
  recordId: string;
  from?: string;
}): string {
  const { baseUrl, username, challenge, recordId, from = "social" } = options;
  const cleanBase = baseUrl.replace(/\/+$/, "");
  const encodedRecord = encodeURIComponent(recordId);
  const fromParam = from ? `&from=${encodeURIComponent(from)}` : "";
  
  return `${cleanBase}/perfil/${encodeURIComponent(username)}?challenge=${encodeURIComponent(challenge)}${fromParam}&record=${encodedRecord}#panel=${encodedRecord}`;
}

export interface SharePayload {
  title: string;
  text: string;
  url: string;
}

/**
 * Ejecuta el compartido nativo a través de Web Share API o copia al portapapeles.
 * En móviles, poner la URL al final del texto garantiza que WhatsApp en iOS no ignore
 * el texto del mensaje ni duplique la URL en Android, al tiempo que carga el overview (previsualización con foto).
 */
export async function executeShare(
  payload: SharePayload,
  onCopied?: () => void
): Promise<boolean> {
  const { title, text, url } = payload;
  
  // Garantizar que la URL forma parte del mensaje compartido
  const shareTextWithUrl = text.includes(url) ? text : `${text}\n\n${url}`;

  if (typeof navigator !== "undefined" && navigator.share) {
    try {
      // Pasamos title y text (que ya contiene la URL limpia al final)
      // WhatsApp genera automáticamente la tarjeta de previsualización (overview) con foto
      await navigator.share({
        title,
        text: shareTextWithUrl,
      });
      return true;
    } catch (err: any) {
      if (err?.name === "AbortError") {
        return false; // El usuario canceló la hoja de compartir
      }
    }
  }

  // Fallback: copiar al portapapeles
  if (typeof navigator !== "undefined" && navigator.clipboard) {
    try {
      await navigator.clipboard.writeText(shareTextWithUrl);
      onCopied?.();
      return true;
    } catch {
      // Ignorar fallo de portapapeles
    }
  }

  return false;
}
