// src/api/syncAllPendings.ts
import { loadPendings, syncPendings } from "../storage/db";
import type { PendingSyncItem } from "../storage/db";

/**
 * Sincroniza Pendings usando el motor real: src/storage/db.ts -> syncPendings()
 * y regresa CUÁNTOS estaban pendientes (pendingSync=true) al momento de presionar.
 *
 * Resultado esperado:
 * - Primera vez (si había X dirty): X
 * - Segunda vez sin cambios: 0
 */
export async function syncAllPendings(): Promise<number> {
  const local: PendingSyncItem[] = await loadPendings();

  // Solo pendientes que además no estén soft deleted
  const pending = local.filter((p) => !!p.pendingSync && !p.deletedAt);

  console.log("[syncAllPendings] locales:", local.length);
  console.log("[syncAllPendings] pendientes:", pending.length);

  if (pending.length === 0) return 0;

  await syncPendings();

  return pending.length;
}
