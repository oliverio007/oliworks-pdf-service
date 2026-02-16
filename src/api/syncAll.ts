// src/api/syncAll.ts
import { syncAll } from "../storage/db";
import type { SyncAllResult } from "../storage/db";

/**
 * Botón único: sincroniza TODO lo que ya existe:
 * projects + tracks + artist_profiles + wallet + agenda(events) + pendings
 *
 * Regresa result completo para que puedas:
 * - mostrar resumen
 * - ver errores por módulo
 * - ver cuántos items quedaron
 */
export async function syncAllNow(): Promise<SyncAllResult> {
  console.log("[syncAllNow] start");
  const res = await syncAll({ gcDays: 21 });
  console.log("[syncAllNow] done", {
    agenda: res.agenda?.length,
    pendings: res.pendings?.length,
    projects: res.projects?.length,
    tracks: res.tracks?.length,
    wallet: res.wallet?.length,
    artistProfiles: res.artistProfiles?.length,
    cleaned: res.cleaned,
    errors: res.errors,
  });
  return res;
}

/**
 * Versión compacta para alerts:
 * - te dice si hubo errores
 * - y te da conteo de módulos
 */
export async function syncAllNowSummary(): Promise<{
  ok: boolean;
  counts: {
    projects: number;
    tracks: number;
    agenda: number;
    pendings: number;
    wallet: number;
    artistProfiles: number;
  };
  cleaned: SyncAllResult["cleaned"];
  errors: SyncAllResult["errors"];
}> {
  const res = await syncAllNow();
  const errors = res.errors || {};
  const ok = Object.keys(errors).length === 0;

  return {
    ok,
    counts: {
      projects: res.projects?.length ?? 0,
      tracks: res.tracks?.length ?? 0,
      agenda: res.agenda?.length ?? 0,
      pendings: res.pendings?.length ?? 0,
      wallet: res.wallet?.length ?? 0,
      artistProfiles: res.artistProfiles?.length ?? 0,
    },
    cleaned: res.cleaned,
    errors,
  };
}
