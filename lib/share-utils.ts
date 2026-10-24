/**
 * Utilidades para compartir registros en WhatsApp y otras aplicaciones.
 * 
 * 1. Sanitización de fechas y años: Evita que WhatsApp, Apple NSDataDetector (iOS)
 *    y Android TextClassifier (Android/MIUI/Samsung) reconozcan las fechas o el año
 *    como hipervínculos verdes/azules de calendario.
 *    Inserta un Zero-Width Non-Joiner (\u200C / ZWNJ) invisible en la abreviatura del mes
 *    y en el año (ej: "20‌26" y "o‌ct").
 *    Visualmente es 100% idéntico para el ojo humano, pero rompe las expresiones regulares
 *    del sistema operativo.
 * 
 * 2. Deep links enriquecidos con cache-busting: Genera URLs con parámetro ?record=...
 *    y timestamp para que el crawler de WhatsApp siempre solicite los metadatos Open Graph
 *    frescos (fotos y título) sin usar caché antigua, y fragmento #panel=... para abrir
 *    la ficha en el cliente.
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
 * Inserta un carácter invisible ZWNJ en años, meses y separadores numéricos
 * para evitar que WhatsApp, Android TextClassifier e iOS Data Detectors
 * conviertan el año o la fecha en un hipervínculo interactivo de calendario.
 */
export function sanitizeDateForShare(dateStr: string | null | undefined): string {
  if (!dateStr) return "";

  let result = dateStr;

  // 1. Romper años de 4 dígitos (ej: 2026 -> 20‌26) para que Android/WhatsApp no los subraye en verde
  result = result.replace(/\b(19\d{2}|20\d{2})\b/g, (year) => {
    return year.slice(0, 2) + ZWNJ + year.slice(2);
  });

  // 2. Romper nombres y abreviaturas de meses en español (ej: "15 oct" -> "15 o‌ct")
  for (const month of SPANISH_MONTHS) {
    const regex = new RegExp(`\\b(${month})\\b`, "gi");
    result = result.replace(regex, (match) => {
      if (match.length <= 1) return match;
      return match[0] + ZWNJ + match.slice(1);
    });
  }

  // 3. Romper fechas numéricas si las hubiera (ej: 15/10/2026 -> 15‌/‌10‌/‌20‌26)
  result = result.replace(/(\d{1,4})([/.-])(\d{1,2})([/.-])(\d{2,4})/g, (_m, p1, s1, p2, s2, p3) => {
    return `${p1}${ZWNJ}${s1}${ZWNJ}${p2}${ZWNJ}${s2}${ZWNJ}${p3}`;
  });

  return result;
}

/**
 * Sanitiza textos libres (ej. notas) para neutralizar años que pudieran ser
 * detectados como enlaces de calendario por WhatsApp.
 */
export function sanitizeTextForShare(text: string | null | undefined): string {
  if (!text) return "";
  return text.replace(/\b(19\d{2}|20\d{2})\b/g, (year) => {
    return year.slice(0, 2) + ZWNJ + year.slice(2);
  });
}

/**
 * Construye la URL canónica de compartición de un registro.
 * Incluye ?record=... para que el servidor genere el Open Graph preview con la foto,
 * un parámetro de tiempo para invalidar la caché agresiva de WhatsApp,
 * y #panel=... para la navegación directa en el cliente.
 */
export function buildRecordShareUrl(options: {
  baseUrl: string;
  username: string;
  challenge: "peaks" | "countries" | "experiences" | string;
  recordId: string;
  from?: string;
  timestamp?: number;
}): string {
  const { baseUrl, username, challenge, recordId, from = "social", timestamp = Date.now() } = options;
  const cleanBase = baseUrl.replace(/\/+$/, "");
  const encodedRecord = encodeURIComponent(recordId);
  const fromParam = from ? `&from=${encodeURIComponent(from)}` : "";
  const timeParam = timestamp ? `&t=${timestamp}` : "";
  
  return `${cleanBase}/perfil/${encodeURIComponent(username)}?challenge=${encodeURIComponent(challenge)}${fromParam}&record=${encodedRecord}${timeParam}#panel=${encodedRecord}`;
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
      await navigator.share({
        title,
        text: shareTextWithUrl,
      });
      return true;
    } catch (err: any) {
      if (err?.name === "AbortError") {
        return false;
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
