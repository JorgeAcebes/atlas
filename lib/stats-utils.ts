import { peaks } from "@/data/peaks";
import { countries, type Country } from "@/data/countries";
import { predefinedCategories } from "@/data/experiences";

/**
 * Resuelve el nombre y tipo de una ubicación a partir de su summitId.
 * Prioriza estrictamente picos y provincias de España para evitar colisiones
 * (por ejemplo, "granada" provincia/pico Mulhacén vs "country-gd" país Granada/Grenada).
 */
export function getLocationInfo(summitId?: string): {
  name: string;
  type: "peak" | "country" | "experience" | "unknown";
} {
  if (!summitId) return { name: "Registro", type: "unknown" };
  const cleanId = summitId.split("::")[0];
  const lowerId = cleanId.toLowerCase();

  // 1. Picos y provincias de España (prioridad estricta)
  const peak = peaks.find(
    (p) =>
      p.id === cleanId ||
      p.name.toLowerCase() === lowerId ||
      p.province.toLowerCase() === lowerId
  );
  if (peak) return { name: peak.name, type: "peak" };

  // 2. Países (estrictamente por ID 'country-xx' o prefijo 'country-')
  const country = countries.find(
    (c) =>
      c.id === cleanId ||
      (cleanId.startsWith("country-") &&
        (c.iso_a2.toLowerCase() === cleanId.replace("country-", "").toLowerCase() ||
          c.name.toLowerCase() === cleanId.replace("country-", "").toLowerCase()))
  );
  if (country) return { name: country.name, type: "country" };
  if (cleanId.startsWith("country-")) {
    return { name: cleanId.replace("country-", "").toUpperCase(), type: "country" };
  }

  // 3. Experiencias
  const exp = predefinedCategories.flatMap((c) => c.experiences).find((e) => e.id === cleanId);
  if (exp) return { name: exp.name, type: "experience" };

  return { name: cleanId, type: "unknown" };
}

/**
 * Determina el país asociado a un registro de ascenso.
 * Si el registro corresponde a un pico o provincia española, retorna null
 * garantizando que nunca se compute como visita a un país.
 */
export function getCountryForAscent(a: any): Country | null {
  if (!a) return null;

  // 1. Si explícitamente tiene peak_id o su summit_id coincide con un pico/provincia de España, NUNCA es un país
  const sid = a.summit_id ? String(a.summit_id).split("::")[0] : "";
  const lowerSid = sid.toLowerCase();
  if (
    a.peak_id ||
    peaks.some(
      (p) =>
        p.id === sid ||
        p.name.toLowerCase() === lowerSid ||
        p.province.toLowerCase() === lowerSid
    )
  ) {
    return null;
  }

  // 2. Comprobar si el ID objetivo es de un país (requiere country_id, country_code o prefijo 'country-')
  const targetId = a.country_id || a.country_code || (sid.startsWith("country-") ? sid : null);
  if (!targetId) return null;
  const cleanId = String(targetId).split("::")[0];

  // Buscar por ID exacto de país (ej. 'country-es', 'country-gd')
  const byId = countries.find((c) => c.id === cleanId);
  if (byId) return byId;

  // Si empieza por 'country-', buscar por ISO o nombre
  if (cleanId.startsWith("country-")) {
    const sub = cleanId.replace("country-", "").toLowerCase();
    const byIso = countries.find((c) => c.iso_a2.toLowerCase() === sub);
    if (byIso) return byIso;
    const byName = countries.find((c) => c.name.toLowerCase() === sub);
    if (byName) return byName;
  }

  return null;
}

/**
 * Determina el pico provincial asociado a un registro de ascenso.
 * Retorna el objeto Peak correspondiente o null si no es un pico provincial o es un elemento de wishlist.
 */
export function getPeakForAscent(a: any) {
  if (!a || a.is_wishlist) return null;
  const targetId = a.peak_id || a.summit_id || a.country_id;
  if (!targetId) return null;
  const cleanId = String(targetId).split("::")[0];
  const lowerId = cleanId.toLowerCase();

  return (
    peaks.find(
      (p) =>
        p.id === cleanId ||
        p.name.toLowerCase() === lowerId ||
        p.province.toLowerCase() === lowerId
    ) || null
  );
}
