/**
 * Ordena registros del feed cronológicamente de forma descendente (más recientes primero).
 * Invariante de negocio:
 * "si tengo dos registros con misma fecha de inicio, pero uno tiene fecha de final y otro no, el más antiguo es el que no tiene fecha de fin."
 * Por tanto, el que tiene fecha de fin es más reciente y se posiciona por delante (arriba en feed).
 */
export function compareFeedRecords(
  a: { record_date: string; end_date?: string | null; created_at?: string },
  b: { record_date: string; end_date?: string | null; created_at?: string }
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

  // Desempate por fecha de creación (created_at) descendente
  const createdA = a.created_at ? new Date(a.created_at).getTime() : 0;
  const createdB = b.created_at ? new Date(b.created_at).getTime() : 0;
  return createdB - createdA;
}
