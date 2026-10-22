import { datesOverlap } from "./companions";

/**
 * Ordena registros del feed cronológicamente de forma descendente (más recientes primero).
 * Invariante de negocio:
 * "si tengo dos registros con misma fecha de inicio, pero uno tiene fecha de final y otro no, el más antiguo es el que no tiene fecha de fin."
 * Por tanto, el que tiene fecha de fin es más reciente y se posiciona por delante (arriba en feed).
 */
export function compareFeedRecords(
  a: { record_date: string; end_date?: string | null; created_at?: string; trip_group_id?: string | null; user_id?: string },
  b: { record_date: string; end_date?: string | null; created_at?: string; trip_group_id?: string | null; user_id?: string }
): number {
  const timeA = new Date(a.record_date).getTime();
  const timeB = new Date(b.record_date).getTime();
  if (timeA !== timeB) {
    return timeB - timeA;
  }

  const aHasEnd = !!(a.end_date && !isNaN(new Date(a.end_date).getTime()));
  const bHasEnd = !!(b.end_date && !isNaN(new Date(b.end_date).getTime()));

  if (aHasEnd && !bHasEnd) {
    // a tiene fin, b no -> b es más antiguo -> a va antes (arriba)
    return -1;
  }
  if (!aHasEnd && bHasEnd) {
    // a no tiene fin, b sí -> a es más antiguo -> b va antes (arriba)
    return 1;
  }
  if (aHasEnd && bHasEnd) {
    const endA = new Date(a.end_date!).getTime();
    const endB = new Date(b.end_date!).getTime();
    if (endA !== endB) {
      return endB - endA;
    }
  }

  // Si ambos o alguno pertenece a un viaje compartido en la misma fecha, agrupar por trip_group_id
  if (a.trip_group_id || b.trip_group_id) {
    if (a.trip_group_id && b.trip_group_id && a.trip_group_id === b.trip_group_id) {
      return (a.user_id || "").localeCompare(b.user_id || "");
    }
    const groupCompare = (b.trip_group_id || "").localeCompare(a.trip_group_id || "");
    if (groupCompare !== 0) {
      return groupCompare;
    }
  }

  // Desempate por fecha de creación (created_at) descendente
  const createdA = a.created_at ? new Date(a.created_at).getTime() : 0;
  const createdB = b.created_at ? new Date(b.created_at).getTime() : 0;
  return createdB - createdA;
}

/**
 * Determina si dos publicaciones consecutivas del feed forman parte del mismo viaje / actividad compartida
 * y por tanto deben enlazarse visualmente mediante el hilo ("feed-thread-connector").
 */
export function areFeedItemsConnected(itemA: any, itemB: any): boolean {
  if (!itemA || !itemB) return false;
  if (itemA.type === "error" || itemB.type === "error") return false;

  // 1. Coincidencia directa de trip_group_id
  if (itemA.trip_group_id && itemB.trip_group_id && itemA.trip_group_id === itemB.trip_group_id) {
    return true;
  }

  // 2. Mismo destino/actividad y fechas solapadas o idénticas
  const sameSummit = Boolean(itemA.summit_id && itemB.summit_id && itemA.summit_id === itemB.summit_id);
  const sameExp = Boolean(
    itemA.experience_id &&
    itemB.experience_id &&
    itemA.experience_id === itemB.experience_id &&
    (itemA.sub_item_id || null) === (itemB.sub_item_id || null)
  );
  if (!sameSummit && !sameExp) return false;

  const dateA = itemA.record_date || itemA.achieved_on;
  const dateB = itemB.record_date || itemB.achieved_on;
  if (!dateA || !dateB) return false;

  const datesMatch = Boolean(
    (dateA === dateB && (itemA.end_date || null) === (itemB.end_date || null)) ||
    datesOverlap(dateA, itemA.end_date, dateB, itemB.end_date)
  );
  if (!datesMatch) return false;

  // 3. Relación de compañeros de viaje en esta actividad
  const aComps: any[] = itemA.companions || [];
  const bComps: any[] = itemB.companions || [];

  const aHasB = aComps.some((c: any) => c.id === itemB.user_id);
  const bHasA = bComps.some((c: any) => c.id === itemA.user_id);

  return aHasB || bHasA;
}
