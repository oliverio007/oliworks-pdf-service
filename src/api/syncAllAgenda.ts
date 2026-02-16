// src/api/syncAllAgenda.ts
import { loadAgenda, syncAgenda } from "../storage/db";
import type { AgendaSyncItem } from "../storage/db";

/**
 * Sincroniza Agenda usando el motor real: storage/db.ts -> syncAgenda()
 * y regresa CUÁNTOS estaban pendientes (pendingSync=true) al presionar.
 */
export async function syncAllAgenda(): Promise<number> {
  const local: AgendaSyncItem[] = await loadAgenda();

  // pendientes que además no estén soft deleted
  const pending = local.filter((a) => !!a.pendingSync && !a.deletedAt);

  console.log("[syncAllAgenda] locales:", local.length);
  console.log("[syncAllAgenda] pendientes:", pending.length);

  if (pending.length === 0) return 0;

  await syncAgenda(); // push + pull + limpia flags
  return pending.length;
}
