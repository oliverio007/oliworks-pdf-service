import { loadTracks, syncTracks } from "../storage/db";
import type { TrackSyncItem } from "../storage/db";

export async function syncAllTracks(): Promise<number> {
  const local: TrackSyncItem[] = await loadTracks();
  const pending = local.filter((t) => !!t.pendingSync && !t.deletedAt);

  if (pending.length === 0) return 0;
  await syncTracks();
  return pending.length;
}
