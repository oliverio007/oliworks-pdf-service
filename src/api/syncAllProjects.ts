// src/api/syncAllProjects.ts
import { loadProjects, syncProjects } from "../storage/db";
import type { ProjectSyncItem } from "../storage/db";

/**
 * Sincroniza Projects usando el motor real: src/storage/db.ts -> syncProjects()
 * y regresa CUÁNTOS se limpiaron (pendingSync pasó de true -> false).
 */
export async function syncAllProjects(): Promise<number> {
  const before: ProjectSyncItem[] = await loadProjects();
  const pendingBefore = before.filter((p) => !!p.pendingSync && !p.deletedAt);

  console.log("[syncAllProjects] locales:", before.length);
  console.log("[syncAllProjects] pendientes antes:", pendingBefore.length);

  if (pendingBefore.length === 0) return 0;

  await syncProjects();

  const after: ProjectSyncItem[] = await loadProjects();
  const pendingAfter = after.filter((p) => !!p.pendingSync && !p.deletedAt);

  console.log("[syncAllProjects] pendientes despues:", pendingAfter.length);

  // lo que realmente se limpió
  const cleaned = Math.max(0, pendingBefore.length - pendingAfter.length);
  return cleaned;
}
