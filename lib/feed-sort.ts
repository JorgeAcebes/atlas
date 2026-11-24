import { datesOverlap } from "./companions";

/**
 * Ordena registros del feed cronológicamente de forma descendente (más recientes primero).
 * Invariante de negocio:
 * "si tengo dos registros con misma fecha de inicio, pero uno tiene fecha de final y otro no, el más antiguo es el que no tiene fecha de fin."
 * Por tanto, el que tiene fecha de fin es más reciente y se posiciona por delante (arriba en feed).
 */
function safeTime(value?: string | null): number {
  if (!value) return 0;
  const ts = new Date(value).getTime();
  return Number.isFinite(ts) ? ts : 0;
}

export function compareFeedRecords(
  a: {
    record_date: string;
    end_date?: string | null;
    created_at?: string;
    trip_group_id?: string | null;
    trip_is_inviter?: boolean;
    trip_joined_at?: string | null;
    user_id?: string;
  },
  b: {
    record_date: string;
    end_date?: string | null;
    created_at?: string;
    trip_group_id?: string | null;
    trip_is_inviter?: boolean;
    trip_joined_at?: string | null;
    user_id?: string;
  }
): number {
  const timeA = safeTime(a.record_date);
  const timeB = safeTime(b.record_date);
  if (timeA !== timeB) {
    return timeB - timeA;
  }

  const endA = safeTime(a.end_date);
  const endB = safeTime(b.end_date);
  const aHasEnd = Boolean(a.end_date && endA !== 0);
  const bHasEnd = Boolean(b.end_date && endB !== 0);

  if (aHasEnd && !bHasEnd) {
    // a tiene fin, b no -> b es más antiguo -> a va antes (arriba)
    return -1;
  }
  if (!aHasEnd && bHasEnd) {
    // a no tiene fin, b sí -> a es más antiguo -> b va antes (arriba)
    return 1;
  }
  if (aHasEnd && bHasEnd && endA !== endB) {
    return endB - endA;
  }

  // Si ambos o alguno pertenece a un viaje compartido en la misma fecha, agrupar por trip_group_id
  if (a.trip_group_id || b.trip_group_id) {
    if (a.trip_group_id && b.trip_group_id && a.trip_group_id === b.trip_group_id) {
      // Dentro de un mismo hilo: primero el creador/inviter, luego compañeros por orden de aceptación
      const rankA = a.trip_is_inviter ? 0 : 1;
      const rankB = b.trip_is_inviter ? 0 : 1;
      if (rankA !== rankB) {
        return rankA - rankB;
      }

      const joinedA = safeTime(a.trip_joined_at);
      const joinedB = safeTime(b.trip_joined_at);
      if (joinedA !== joinedB) {
        if (joinedA === 0) return 1;
        if (joinedB === 0) return -1;
        return joinedA - joinedB;
      }

      const createdA = safeTime(a.created_at);
      const createdB = safeTime(b.created_at);
      if (createdA !== createdB) {
        return createdA - createdB;
      }

      return (a.user_id || "").localeCompare(b.user_id || "");
    }
    const groupCompare = (b.trip_group_id || "").localeCompare(a.trip_group_id || "");
    if (groupCompare !== 0) {
      return groupCompare;
    }
  }

  // Desempate por fecha de creación (created_at) descendente
  const createdA = safeTime(a.created_at);
  const createdB = safeTime(b.created_at);
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
