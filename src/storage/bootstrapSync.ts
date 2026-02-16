import AsyncStorage from "@react-native-async-storage/async-storage";
import { syncAllNow } from "../api/syncAll";

const KEY_FIRST_BOOT_DONE = "ow:first_boot_done:v1";
const KEY_LAST_FULL_SYNC_TS = "ow:last_full_sync_ts:v1";

export async function runBootstrapSync(opts?: { maxAgeMs?: number }) {
  const maxAgeMs = opts?.maxAgeMs ?? 6 * 60 * 60 * 1000; // 6 horas

  const first = !(await AsyncStorage.getItem(KEY_FIRST_BOOT_DONE));
  const lastRaw = await AsyncStorage.getItem(KEY_LAST_FULL_SYNC_TS);
  const last = lastRaw ? Number(lastRaw) || 0 : 0;

  const now = Date.now();
  const shouldSync = first || now - last > maxAgeMs;

  if (!shouldSync) return { didSync: false, ok: true, errorsCount: 0 };

  const res = await syncAllNow();
  const errors = res.errors || {};
  const errorsCount = Object.keys(errors).length;

  await AsyncStorage.setItem(KEY_LAST_FULL_SYNC_TS, String(now));
  if (first) await AsyncStorage.setItem(KEY_FIRST_BOOT_DONE, "1");

  return { didSync: true, ok: errorsCount === 0, errorsCount };
}
