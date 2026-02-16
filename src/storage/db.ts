// src/storage/db.ts
// OliWorks: Local storage + offline-first sync (Supabase)

import AsyncStorage from "@react-native-async-storage/async-storage";
import * as FileSystem from "expo-file-system/legacy";

import { supabase } from "../lib/supabase";
import { Alert } from "react-native";

import type { WalletMovement } from "../types"; // o donde esté
// ^ ojo: ajusta imports si esto ya está en el mismo archivo (db.ts)
// Si estás dentro de db.ts, NO te importes a ti mismo. Solo usa las funciones directas.

function pad2(n: number) {
  return String(n).padStart(2, "0");
}
function todayYMD() {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

type BillingSummary = {
  project_id: string;
  project_local_id?: string | null;
  artist_id: string | null;
  artist_local_id?: string | null;
  artist_name?: string | null;
  total_cost: number | null;
  applied: number | null;
  remaining: number | null;
};

type WalletBalance = { artist_id: string; balance: number };

export async function applySaldoToProject(projectId: string) {
  // 1) billing (por uuid o local_id)
  let billing: BillingSummary | null = null;

  const r1 = await supabase
    .from("project_billing_summary")
    .select("*")
    .eq("project_id", projectId)
    .maybeSingle();

  if (!r1.error && r1.data) billing = r1.data as any;

  if (!billing) {
    const r2 = await supabase
      .from("project_billing_summary")
      .select("*")
      .eq("project_local_id", projectId)
      .maybeSingle();

    if (!r2.error && r2.data) billing = r2.data as any;
  }

  if (!billing) return { appliedNow: 0, reason: "NO_BILLING" as const };

  // 2) resolver artistId (uuid)
  let artistId: string | null = billing.artist_id ?? null;

  if (!artistId) {
    const artistLocal =
      (billing as any)?.artist_local_id ??
      (billing as any)?.artist_key ??
      (billing as any)?.artist_local ??
      null;

    if (artistLocal) {
      const a1 = await supabase
        .from("artists")
        .select("id")
        .eq("local_id", String(artistLocal))
        .maybeSingle();
      if (!a1.error && a1.data?.id) artistId = String(a1.data.id);
    }
  }

  if (!artistId) return { appliedNow: 0, reason: "NO_ARTIST" as const };

  // 3) wallet balance
  let wallet: WalletBalance | null = null;
  const w1 = await supabase
    .from("artist_wallet_balance")
    .select("*")
    .eq("artist_id", artistId)
    .maybeSingle();

  if (!w1.error && w1.data) wallet = w1.data as any;

  const saldoGlobal = Number(wallet?.balance ?? 0) || 0;
  const applied = Number(billing.applied ?? 0) || 0;
  const remaining =
    Number(billing.remaining ?? 0) ||
    (Number(billing.total_cost ?? 0) - applied);

  const amountToApply = Math.max(0, Math.min(saldoGlobal, remaining));
  if (!amountToApply) return { appliedNow: 0, reason: "NOTHING_TO_APPLY" as const };

  // 4) necesitamos ids locales (texto)
  const projectLocalId = String(billing.project_local_id ?? "").trim() || String(projectId).trim();
  const artistLocalIdRaw =
    String(billing.artist_local_id ?? "").trim() ||
    String(billing.artist_name ?? "").trim() ||
    "sin_artista";

  const artistLocalId = normalizeArtistLocalId(artistLocalIdRaw) || "sin_artista";

  // 5) crear movimiento APLICADO offline-first
  const now = Date.now();
  const nowIso = new Date(now).toISOString();

  const local = await loadWallet();

  const movement = {
    id: uid(),
    createdAt: now,
    dateLabel: todayYMD(),
    kind: "APLICADO" as const,
    amount: amountToApply,
    currency: "MXN",
    projectId: projectLocalId,
    artist: artistLocalId,
    note: "Aplicado a tema",
    category: null,
    pendingSync: true,
    localUpdatedAt: now,
    updatedAt: nowIso,
    deletedAt: null,
  };

  await saveWallet([movement as any, ...local]);

  // sync best-effort
  // ❌ Wallet cloud aún no está habilitado
// try {
//   await syncWallet();
// } catch (e) {
//   console.log("[applySaldoToProject] syncWallet error:", e);
// }

  return { appliedNow: amountToApply, reason: "OK" as const };
}


import {
  AgendaItem,
  ArchiveVersion,
  Checklist,
  CHECKLIST_KEYS,
  PendingItem,
  Project,
  ProjectStatus,
} from "../types";

// ---------------- Keys ----------------

const SIN_ARTISTA_KEY = "sin_artista";
const SIN_ARTISTA_NAME = "Sin artista";


const KEY_PROJECTS = "oliworks_projects_v1_2";
const KEY_ARCHIVE = "oliworks_archive_v1_2";
const KEY_PROJECTS_LAST_PULL = "oliworks_projects_last_pull_v1_2";

const KEY_AGENDA = "oliworks_agenda_v1_2";
const KEY_AGENDA_LAST_PULL = "oliworks_agenda_last_pull_v1_2";

const KEY_PENDINGS = "oliworks_pendings_v1_2";
const KEY_PENDINGS_LAST_PULL = "oliworks_pendings_last_pull_v1_2";

const KEY_DRAFTS = "oliworks_drafts_v1_2";
const KEY_ARTIST_NOTES = "oliworks_artist_notes_v1_2";

// Tracks
const KEY_TRACKS = "oliworks_tracks_v1_2";
const KEY_TRACKS_LAST_PULL = "oliworks_tracks_last_pull_v1_2";

// Nuevos (A+B+C)
const KEY_ARTIST_PROFILES = "oliworks_artist_profiles_v1_2";
const KEY_ARTIST_PROFILES_LAST_PULL = "oliworks_artist_profiles_last_pull_v1_2";

const KEY_WALLET = "oliworks_wallet_v1_2";
const KEY_WALLET_LAST_PULL = "oliworks_wallet_last_pull_v1_2";

// ---------------- Types ----------------

type Draft = Partial<Project> & {
  id: string;
  createdAt: number;
  updatedAt: number;
};

type BackupSnapshot = {
  version: 1;
  createdAt: number;
  projects: any[]; // soporta campos extra de sync
  archive: ArchiveVersion[];
  agenda: AgendaSyncItem[];
  pendings: PendingSyncItem[];
  artistNotes: Record<string, string>;
  artistProfiles?: ArtistProfileSyncItem[];
  wallet?: WalletMovementSyncItem[];
};

// Extend AgendaItem sin tocar types.ts
export type AgendaSyncItem = AgendaItem & {
  pendingSync?: boolean;
  localUpdatedAt?: number;
  updatedAt?: string | null;
  deletedAt?: string | null;
};

// Extend PendingItem sin tocar types.ts
export type PendingSyncItem = PendingItem & {
  pendingSync?: boolean;
  localUpdatedAt?: number;
  updatedAt?: string | null;
  deletedAt?: string | null;
};

// Extend Project sin tocar types.ts (para sync)
export type ProjectSyncItem = Project & {
    project_id?: string | null;   // 👈 AGREGA ESTO
  // NUEVO (link + costo)
  artistLocalId?: string | null; // lo guardas local y se sube a cloud
  totalCost?: number | null; // costo del tema (si lo usas)

  pendingSync?: boolean;
  localUpdatedAt?: number;
  serverUpdatedAt?: string | null;
  deletedAt?: string | null;
};

export type ArtistProfileSyncItem = {
  artistKey: string; // ✅ SIEMPRE normalizado (slug)
  displayName: string; // ✅ nombre visible (sí cambia)
  note: string;
  advanceTotal: number;

  pendingSync?: boolean;
  localUpdatedAt?: number;
  updatedAt?: string | null;
  deletedAt?: string | null;
};

// ---------------- Compat layer for Screens (old names) ----------------

export type TrackSection = "GENERAL" | "MUSICIANS" | "TUNING" | "EDITION";
export type TrackSectionKey = "general" | "musicians" | "tuning" | "editing";

function mapSection(section: TrackSection | string): TrackSectionKey {
  const s = String(section || "").toUpperCase().trim();
  if (s === "MUSICIANS") return "musicians";
  if (s === "TUNING") return "tuning";
  if (s === "EDITION") return "editing";
  return "general";
}

// ✅ TracksScreen.tsx espera addTrack(projectId,title)
export async function addTrack(projectId: string, title: string) {
  const now = Date.now();
  const track: TrackSyncItem = normalizeTrackItem({
    id: uid(),
    projectId,
    title: String(title ?? "").trim(),
    status: "active",
    progress: 0,
    general: [],
    musicians: [],
    tuning: [],
    editing: [],
    pendingSync: true,
    localUpdatedAt: now,
    updatedAt: null,
    deletedAt: null,
  });

  await upsertTrack(track);
  return track;
}

// ✅ TrackDetailScreen / TrackSubmenu esperan cargar items por sección
export async function loadTrackSectionItems(
  trackId: string,
  section: TrackSection | string
) {
  const t = await getTrack(trackId);
  if (!t) return [];
  const key = mapSection(section);
  return (t[key] || []).filter((i) => !i.deletedAt);
}

// ✅ TrackSubmenu espera addTrackSectionItem(trackId, section, text)
export async function addTrackSectionItem(
  trackId: string,
  section: TrackSection | string,
  text: string
) {
  const key = mapSection(section);
  return await addTrackItem(trackId, key, text);
}

// ✅ TrackSubmenu espera toggleTrackSectionItem(trackId, section, itemId)
export async function toggleTrackSectionItem(
  trackId: string,
  section: TrackSection | string,
  itemId: string
) {
  const key = mapSection(section);
  return await toggleTrackItem(trackId, key, itemId);
}

// ✅ TrackSubmenu espera deleteTrackSectionItem(trackId, section, itemId)
// (soft delete)
export async function deleteTrackSectionItem(
  trackId: string,
  section: TrackSection | string,
  itemId: string
) {
  const key = mapSection(section);
  return await deleteTrackItem(trackId, key, itemId);
}

// ✅ TrackDetailScreen espera toggleTrackChecklist(trackId, itemId)
export async function toggleTrackChecklist(trackId: string, itemId: string) {
  return await toggleTrackItem(trackId, "general", itemId);
}

// ---------------- Wallet types ----------------

export async function applySaldoLocal(params: {
  projectLocalId: string;
  artistLocalId: string;
  amount: number;
  note?: string;
  autoSync?: boolean;
}) {
  const projectLocalId = String(params.projectLocalId || "").trim();
  const artistLocalId = normalizeArtistLocalId(String(params.artistLocalId || "").trim());
  const amt = Number(params.amount || 0);

  if (!projectLocalId) throw new Error("No hay project_local_id");
  if (!artistLocalId) throw new Error("No hay artist_local_id");
  if (!amt || amt <= 0) throw new Error("Monto inválido");

  const now = Date.now();
  const nowIso = new Date(now).toISOString();

  const dateLabel = (() => {
    const d = new Date(now);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  })();

  const local = await loadWallet();

  const movement: WalletMovementSyncItem = normalizeWalletMovement({
    id: uid(),
    createdAt: now,
    dateLabel,
    kind: "APLICADO",
    amount: amt,
    currency: "MXN",
    projectId: projectLocalId, // local_id del project (texto)
    artist: artistLocalId,     // local_id del artista (slug)
    note: params.note ?? "Aplicado a tema",
    category: null,
    pendingSync: true,
    localUpdatedAt: now,
    updatedAt: nowIso,
    deletedAt: null,
  });

  const next = [movement, ...local];
  await saveWallet(next);

  // ❌ Wallet cloud aún no está habilitado
// const autoSync = params.autoSync !== false;
// if (autoSync) {
//   try { await syncWallet(); } catch {}
// }


  return movement;
}





export type WalletMovementSyncItem = {
  id: string; // local_id
  createdAt: number;
  dateLabel: string; // YYYY-MM-DD
  kind: "IN" | "OUT" | "ANTICIPO" | "APLICADO";
  amount: number;
  currency: string; // "MXN"
  projectId?: string | null; // sigue siendo local_id en local storage
  artist?: string | null; 
  note?: string | null;
  category?: string | null;

  pendingSync?: boolean;
  localUpdatedAt?: number;
  updatedAt?: string | null;
  deletedAt?: string | null;
};

export type TrackChecklistItem = {
  id: string;
  text: string;
  done: boolean;
  deletedAt?: string | null;
};

export type TrackSyncItem = {
  id: string; // local_id
  projectId: string; // link a Project.id
  title: string;

  status: "active" | "done";
  progress: number; // 0-100

  general: TrackChecklistItem[];
  musicians: TrackChecklistItem[];
  tuning: TrackChecklistItem[];
  editing: TrackChecklistItem[];

  pendingSync?: boolean;
  localUpdatedAt?: number;
  updatedAt?: string | null;
  deletedAt?: string | null;
};

// ---------------- Sync All Result ----------------

export type SyncAllResult = {
  agenda: AgendaSyncItem[];
  pendings: PendingSyncItem[];
  projects: ProjectSyncItem[];
  artistProfiles: ArtistProfileSyncItem[];
  wallet: WalletMovementSyncItem[];
  tracks: TrackSyncItem[];

  cleaned: {
    agendaCleaned: number;
    pendingsCleaned: number;
    projectsCleaned: number;
    artistProfilesCleaned: number;
    walletCleaned: number;
    tracksCleaned: number;
  };

  errors: {
    agenda?: string;
    pendings?: string;
    projects?: string;
    artistProfiles?: string;
    wallet?: string;
    tracks?: string;
  };
};

export async function projectFinancials(params: {
  project_id: string;
}) {
  const { project_id } = params;

  const { data, error } = await supabase
    .rpc("project_financials", { project_id }); 
    // o fetch al Edge Function project-financial-snapshot

  if (error || !data) {
    return { ok: false, error: error?.message };
  }

  return {
    ok: true,
    total_cost: Number(data.total_cost ?? 0),
    advances: Number(data.advances ?? 0),
    applied: Number(data.applied ?? 0),
    remaining: Number(data.remaining ?? 0),
  };
}

// Long Press para Borrar Artista y Temas

export async function deleteArtistCascade(params: { artistKey: string }) {
  const artistKey = normalizeArtistLocalId(params.artistKey);
  if (!artistKey) return;

  const now = Date.now();
  const nowIso = new Date(now).toISOString();

  // 1) Proyectos del artista
  const projects = await loadProjects();
  const targetProjects = projects.filter((p: any) => {
    const k =
      (p.artistLocalId ?? p.artist_local_id ?? "") ||
      normalizeArtistLocalId(String(p.artist ?? ""));
    return normalizeArtistLocalId(String(k)) === artistKey && !p.deletedAt;
  });

  // 2) Soft delete projects
  const deletedProjectIds = new Set<string>();
  for (const p of targetProjects) {
    deletedProjectIds.add(String((p as any).id));
  }

  const nextProjects = projects.map((p: any) => {
    const k =
      (p.artistLocalId ?? p.artist_local_id ?? "") ||
      normalizeArtistLocalId(String(p.artist ?? ""));
    const match = normalizeArtistLocalId(String(k)) === artistKey;

    if (!match) return p;

    return normalizeProjectItem({
      ...p,
      deletedAt: nowIso,
      deleted_at: nowIso,
      pendingSync: true,
      localUpdatedAt: now,
      updatedAt: now,
    });
  });

  await saveProjects(nextProjects);

  // 3) Soft delete tracks ligados a esos projects
  const tracks = await loadTracks();
  const nextTracks = tracks.map((t) => {
    if (t.deletedAt) return t;
    if (!deletedProjectIds.has(String(t.projectId))) return t;

    return normalizeTrackItem({
      ...t,
      deletedAt: nowIso,
      pendingSync: true,
      localUpdatedAt: now,
    });
  });
  await saveTracks(nextTracks);

  // 4) Wallet: soft delete movimientos del artista y/o de esos proyectos
  const wallet = await loadWallet();
  const nextWallet = wallet.map((m) => {
    if (m.deletedAt) return m;

    const mArtist = normalizeArtistLocalId(String(m.artist ?? ""));
    const byArtist = mArtist === artistKey;

    const byProject = m.projectId ? deletedProjectIds.has(String(m.projectId)) : false;

    if (!byArtist && !byProject) return m;

    return normalizeWalletMovement({
      ...m,
      deletedAt: nowIso,
      pendingSync: true,
      localUpdatedAt: now,
    });
  });
  await saveWallet(nextWallet);

  // 5) Artist profile: soft delete
  const profiles = await loadArtistProfiles();
  const nextProfiles = profiles.map((p) => {
    if (p.deletedAt) return p;
    if (normalizeArtistLocalId(p.artistKey) !== artistKey) return p;

    return normalizeArtistProfile({
      ...p,
      deletedAt: nowIso,
      pendingSync: true,
      localUpdatedAt: now,
    });
  });
  await saveArtistProfiles(nextProfiles);

  // 6) Sync (elige una)
  // recomendado: syncAll para que suba todo lo marcado
  try {
    await syncAll();
  } catch (e) {
    console.log("[deleteArtistCascade] syncAll error:", e);
  }
}






// ---------------- Utils ----------------
function makeId(): string {
  // Expo / RN moderno
  const c: any = globalThis as any;
  if (c?.crypto?.randomUUID) return c.crypto.randomUUID();

  // fallback simple (suficiente como local_id)
  return `id_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}



export function uid() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export function todayLabel() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

export function labelToDate(dateLabel: string) {
  const [y, m, d] = (dateLabel || "").split("-").map((x) => Number(x));
  return new Date(y || 2000, (m || 1) - 1, d || 1);
}

function cap(s: string) {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

// ✅ Normaliza un nombre de artista a una clave estable (artist_local_id / artist_key)
// Ej: 'Banda El Recodo' -> 'banda_el_recodo'
export function normalizeArtistLocalId(name: string) {
  const s = String(name || "").trim();
  if (!s) return "";
  const noAccents = s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const slug = noAccents
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
  return slug;
}

export function formatDateEs(dateLabel: string) {
  const d = labelToDate(dateLabel);
  const weekday = new Intl.DateTimeFormat("es-MX", {
    weekday: "long",
  }).format(d);
  const month = new Intl.DateTimeFormat("es-MX", { month: "long" }).format(d);
  const day = new Intl.DateTimeFormat("es-MX", { day: "2-digit" }).format(d);
  const year = new Intl.DateTimeFormat("es-MX", { year: "numeric" }).format(d);
  return `${cap(weekday)} ${day} ${cap(month)} ${year}`;
}

async function getJson<T>(key: string, fallback: T): Promise<T> {
  const raw = await AsyncStorage.getItem(key);
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

async function setJson(key: string, value: any) {
  await AsyncStorage.setItem(key, JSON.stringify(value));
}

function safeBool(v: any) {
  if (typeof v === "boolean") return v;
  if (typeof v === "number") return v !== 0;
  if (typeof v === "string") return v !== "0" && v.toLowerCase() !== "false";
  return !!v;
}

function parseMoneyLike(v: any): number {
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  if (v == null) return 0;

  let s = String(v).trim();
  if (!s) return 0;

  // quita símbolos y letras (deja dígitos, coma, punto, -)
  s = s.replace(/[^\d.,-]/g, "");

  // si trae coma y punto, asumimos coma miles (1,234.56)
  if (s.includes(",") && s.includes(".")) {
    s = s.replace(/,/g, "");
    const n = Number(s);
    return Number.isFinite(n) ? n : 0;
  }

  // si solo trae coma:
  // - si parece decimal (12,50) => cambia a punto
  // - si parece miles (1,234) => quita coma
  if (s.includes(",") && !s.includes(".")) {
    const parts = s.split(",");
    if (parts.length === 2 && parts[1].length <= 2) {
      s = parts[0] + "." + parts[1];
    } else {
      s = s.replace(/,/g, "");
    }
    const n = Number(s);
    return Number.isFinite(n) ? n : 0;
  }

  // si solo trae punto, normal
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}


function toIsoOrNull(v: any): string | null {
  if (!v) return null;
  const s = String(v);
  return s.length ? s : null;
}

// Para que el día no “cambie” por zonas horarias, usamos mediodía UTC.
function ymdToStartsAtISO(ymd: string) {
  return `${ymd}T12:00:00.000Z`;
}
function startsAtISOToYMD(starts_at: string) {
  return String(starts_at || "").slice(0, 10) || todayLabel();
}

function normalizeWord(s: string) {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}


export function applyQuickCommandToProject(
  project: any,
  command: { section: "MUSICOS" | "EDICION" | "AFINACION"; instruments: string[] }
) {
  const mapKey =
    command.section === "MUSICOS"
      ? "musiciansDone"
      : command.section === "EDICION"
      ? "editionDone"
      : "tuningDone";

  const current = project[mapKey] || {};
  const next = { ...current };

  command.instruments.forEach((raw) => {
    // intenta hacer match con instrumentos reales
    const match = (project.instruments || []).find((i: string) =>
      normalizeWord(i).includes(normalizeWord(raw))
    );

    if (match) {
      next[match] = true;
    }
  });

  const updated = {
    ...project,
    [mapKey]: next,
  };

  updated.progress = computeProgress(updated);
  updated.status = computeStatus(updated);

  return updated;
}

// Timeout helper
const PULL_TIMEOUT_MS = 12000;
function withTimeout(p: any, ms = PULL_TIMEOUT_MS) {
  return Promise.race([
    Promise.resolve(p),
    new Promise((_, rej) =>
      setTimeout(() => rej(new Error("TIMEOUT_SYNC")), ms)
    ),
  ]);
}

export function getProjectCompletionState(p: Project) {
  const missing: string[] = [];

  // 1️⃣ Instrumentos grabados
  for (const [name, done] of Object.entries(p.musiciansDone || {})) {
    if (!done) missing.push(`Grabar ${name}`);
  }

  // 2️⃣ Edición
  for (const [name, done] of Object.entries(p.editionDone || {})) {
    if (!done) missing.push(`Editar ${name}`);
  }

  // 3️⃣ Afinación
  for (const [name, done] of Object.entries(p.tuningDone || {})) {
    if (!done) missing.push(`Afinar ${name}`);
  }

  // 4️⃣ Checklist global
  if (!p.checklist?.MIX) missing.push("Hacer Mix");
  if (!p.checklist?.MASTER) missing.push("Hacer Master");

  return {
    complete: missing.length === 0,
    missing,
  };
}


// ---------------- Tracks ----------------

function normalizeTrackItem(t: any): TrackSyncItem {
  const now = Date.now();
  const base: any = t && typeof t === "object" ? t : {};

  const normList = (arr: any): TrackChecklistItem[] => {
    const a = Array.isArray(arr) ? arr : [];
    return a.map((x) => ({
      id: String(x?.id ?? uid()),
      text: String(x?.text ?? "").trim(),
      done: safeBool(x?.done),
      deletedAt: toIsoOrNull(x?.deletedAt),
    }));
  };

  const out: TrackSyncItem = {
    id: String(base?.id ?? uid()),
    projectId: String(base?.projectId ?? base?.project_id ?? ""),
    title: String(base?.title ?? ""),

    status: (String(base?.status ?? "active") as any) || "active",
    progress: typeof base?.progress === "number" ? base.progress : 0,

    general: normList(base?.general),
    musicians: normList(base?.musicians),
    tuning: normList(base?.tuning),
    editing: normList(base?.editing),

    pendingSync: safeBool(base?.pendingSync),
    localUpdatedAt:
      typeof base?.localUpdatedAt === "number" ? base.localUpdatedAt : now,
    updatedAt: toIsoOrNull(base?.updatedAt),
    deletedAt: toIsoOrNull(base?.deletedAt),
  };

  // recalcula progreso seguro
  out.progress = computeTrackProgress(out);
  out.status = out.progress >= 100 ? "done" : "active";
  return out;
}

function aliveItems(items: TrackChecklistItem[]) {
  return (items || []).filter((i) => !i.deletedAt);
}

function computeTrackProgress(t: TrackSyncItem): number {
  const all = [
    ...aliveItems(t.general),
    ...aliveItems(t.musicians),
    ...aliveItems(t.tuning),
    ...aliveItems(t.editing),
  ];
  if (all.length === 0) return 0;
  const done = all.filter((i) => !!i.done).length;
  return Math.max(0, Math.min(100, Math.round((done / all.length) * 100)));
}

export async function loadTracks(): Promise<TrackSyncItem[]> {
  const raw = await getJson<any[]>(KEY_TRACKS, []);
  return (raw || []).map(normalizeTrackItem);
}

export async function saveTracks(items: TrackSyncItem[]) {
  await setJson(KEY_TRACKS, items.map(normalizeTrackItem));
}

export async function loadTracksByProject(
  projectId: string
): Promise<TrackSyncItem[]> {
  const all = await loadTracks();
  return all
    .filter((t) => t.projectId === projectId && !t.deletedAt)
    .sort((a, b) => (b.localUpdatedAt ?? 0) - (a.localUpdatedAt ?? 0));
}

export async function getTrack(id: string): Promise<TrackSyncItem | null> {
  const all = await loadTracks();
  return all.find((t) => t.id === id) ?? null;
}

export async function upsertTrack(
  track: Partial<TrackSyncItem> & { id: string; projectId: string; title: string }
) {
  const items = await loadTracks();
  const norm = normalizeTrackItem(track);

  norm.pendingSync = true;
  norm.localUpdatedAt = Date.now();
  norm.updatedAt = null; // el server la pondrá

  const idx = items.findIndex((x) => x.id === norm.id);
  const next = [...items];
  if (idx >= 0) next[idx] = { ...next[idx], ...norm };
  else next.unshift(norm);

  await saveTracks(next);
  return next;
}

export async function softDeleteTrack(trackId: string) {
  const items = await loadTracks();
  const nowIso = new Date().toISOString();
  const next = items.map((t) => {
    if (t.id !== trackId) return t;
    return normalizeTrackItem({
      ...t,
      deletedAt: nowIso,
      pendingSync: true,
      localUpdatedAt: Date.now(),
    });
  });
  await saveTracks(next);
  return next;
}

export async function addTrackItem(
  trackId: string,
  section: TrackSectionKey,
  text: string
) {
  const t = await getTrack(trackId);
  if (!t) return null;

  const item: TrackChecklistItem = {
    id: uid(),
    text: String(text ?? "").trim(),
    done: false,
    deletedAt: null,
  };

  const next: TrackSyncItem = normalizeTrackItem({
    ...t,
    [section]: [...(t[section] || []), item],
    pendingSync: true,
    localUpdatedAt: Date.now(),
  });

  await upsertTrack(next);
  return next;
}

export async function toggleTrackItem(
  trackId: string,
  section: TrackSectionKey,
  itemId: string
) {
  const t = await getTrack(trackId);
  if (!t) return null;

  const list = (t[section] || []).map((i) =>
    i.id === itemId ? { ...i, done: !i.done } : i
  );

  const next: TrackSyncItem = normalizeTrackItem({
    ...t,
    [section]: list,
    pendingSync: true,
    localUpdatedAt: Date.now(),
  });

  await upsertTrack(next);
  return next;
}

export async function deleteTrackItem(
  trackId: string,
  section: TrackSectionKey,
  itemId: string
) {
  const t = await getTrack(trackId);
  if (!t) return null;

  const nowIso = new Date().toISOString();
  const list = (t[section] || []).map((i) =>
    i.id === itemId ? { ...i, deletedAt: nowIso } : i
  );

  const next: TrackSyncItem = normalizeTrackItem({
    ...t,
    [section]: list,
    pendingSync: true,
    localUpdatedAt: Date.now(),
  });

  await upsertTrack(next);
  return next;
}

// ---------------- Projects ----------------

function normalizeProjectItem(p: any): ProjectSyncItem {
  const now = Date.now();
  const base: any = p && typeof p === "object" ? p : {};


  
  const id = String(base.id ?? uid());
  const createdAt = typeof base.createdAt === "number" ? base.createdAt : now;
  const updatedAt = typeof base.updatedAt === "number" ? base.updatedAt : now;

  const checklist: any =
    base.checklist && typeof base.checklist === "object" ? base.checklist : {};
  const musiciansDone =
    base.musiciansDone && typeof base.musiciansDone === "object"
      ? base.musiciansDone
      : {};
  const editionDone =
    base.editionDone && typeof base.editionDone === "object"
      ? base.editionDone
      : {};
  const tuningDone =
    base.tuningDone && typeof base.tuningDone === "object" ? base.tuningDone : {};

  const fixedChecklist: Checklist = {} as any;
  for (const k of CHECKLIST_KEYS) fixedChecklist[k] = safeBool(checklist[k]);

  let artistLocalId = base.artistLocalId ?? base.artist_local_id ?? null;

  // Backfill: si no viene link pero sí viene nombre de artista (legacy), genera clave estable
  if (!artistLocalId && base.artist) {
    const k = normalizeArtistLocalId(base.artist);
    artistLocalId = k || null;
  }

 const paymentCost = parseMoneyLike(base?.payment?.cost);

const rawTotal =
  base.totalCost !== undefined ? base.totalCost :
  base.total_cost !== undefined ? base.total_cost :
  undefined;

// ✅ “provided” = el usuario mandó algo (aunque sea 0)
const totalProvided =
  rawTotal !== undefined && rawTotal !== null && String(rawTotal).trim() !== "";

let totalCost =
  typeof rawTotal === "number"
    ? rawTotal
    : parseMoneyLike(rawTotal);

if (!Number.isFinite(totalCost)) totalCost = 0;

// ✅ Regla A: solo backfill si NO venía totalCost
if (!totalProvided && paymentCost > 0) {
  totalCost = paymentCost;
}

// ✅ Si el usuario puso 0, entonces cost también debe ser 0 (para que no salga alerta)
if (totalProvided && totalCost === 0) {
  base.payment = {
    ...(base.payment ?? {}),
    cost: 0,
    paidInFull: false, // opcional
  };
}


const instrumentationType =
  base.instrumentationType ??
  base.instrumentation_type ??
  "OTROS";


  return {
...(base as any),
   id,
  project_id: base.project_id ?? null,  // 👈 AGREGA ESTO
    artistLocalId,
    totalCost,
    instrumentationType, // ✅ siempre definido
    createdAt,
    updatedAt,
    title: String(base.title ?? ""),
    status: (String(base.status ?? "EN_PROCESO") as ProjectStatus) || "EN_PROCESO",
    progress: typeof base.progress === "number" ? base.progress : 0,

    checklist: fixedChecklist,
    musiciansDone,
    editionDone,
    tuningDone,

    pendingSync: safeBool(base.pendingSync),
    localUpdatedAt: typeof base.localUpdatedAt === "number" ? base.localUpdatedAt : updatedAt,
    serverUpdatedAt: toIsoOrNull(base.serverUpdatedAt),
    deletedAt: toIsoOrNull(base.deletedAt),
  };
}

export async function loadProjects(): Promise<ProjectSyncItem[]> {
  const raw = await getJson<any[]>(KEY_PROJECTS, []);
  const norm = (raw || []).map(normalizeProjectItem);

  // opcional pero recomendado: persistir si faltaba artistLocalId/checklist/etc.
  const rawStr = JSON.stringify(raw || []);
  const normStr = JSON.stringify(norm);
  if (rawStr !== normStr) {
    await setJson(KEY_PROJECTS, norm);
  }

  return norm;
}



export async function saveProjects(items: ProjectSyncItem[]) {
  await setJson(KEY_PROJECTS, (items || []).map(normalizeProjectItem));
}


export async function getProject(id: string): Promise<ProjectSyncItem | null> {
  const items = await loadProjects();
  return items.find((p) => p.id === id) ?? null;
}

// ---------------- Projects ----------------

// ✅ ARCHIVAR (offline-first)


export async function archiveProject(projectId: string) {
  const p = await getProject(projectId);
  if (!p) return await loadProjects();

  const now = Date.now();

  const next = await upsertProject({
    ...p,
    status: "ARCHIVO",
    progress: 100,          // opcional, si quieres que al archivar quede en 100
    pendingSync: true,
    localUpdatedAt: now,
    updatedAt: now,
  });

  // opcional: sync inmediato (si quieres)
  try { await syncProjects(); } catch {}

  return next;
}


// db.ts (o donde esté upsertProject)
export async function upsertProject(project: Partial<ProjectSyncItem> & { id?: string }) {
  const items = await loadProjects();

  // 0) id estable
  const id = project.id || makeId();

  // 1) normaliza (tu función existente)
  const norm: any = normalizeProjectItem({ ...project, id });

  // 2) local_id obligatorio (Supabase lo exige NOT NULL)
  const localId = norm.localId ?? norm.local_id ?? makeId();
  norm.localId = localId;
  norm.local_id = localId;

  // 3) artist_local_id obligatorio (Supabase lo exige NOT NULL)
  const artistKey =
    norm.artistLocalId ??
    norm.artist_local_id ??
    normalizeArtistLocalId(String(norm.artist ?? ""));

  if (artistKey) {
    norm.artistLocalId = artistKey;
    norm.artist_local_id = artistKey;
  }

  // 4) defaults para no ser filtrado
  norm.status = norm.status ?? "EN_PROCESO";

  norm.progress = norm.progress ?? 0;

  // 5) dirty flags
  norm.pendingSync = true;
  norm.localUpdatedAt = Date.now();
  norm.updatedAt = norm.localUpdatedAt;

  // 6) upsert local (por id; si no, por local_id)
  const next = [...items];
  const idxById = next.findIndex((p: any) => p.id === norm.id);

  const idxByLocal =
    idxById >= 0
      ? -1
      : next.findIndex((p: any) => {
          const a = p.localId ?? p.local_id;
          const b = norm.localId ?? norm.local_id;
          return !!a && !!b && a === b;
        });

  const idx = idxById >= 0 ? idxById : idxByLocal;

  if (idx >= 0) next[idx] = { ...next[idx], ...norm };
  else next.unshift(norm);

  await saveProjects(next);
  return next;
}


export async function softDeleteProject(projectId: string) {
  const items = await loadProjects();
  const nowIso = new Date().toISOString();

  const next = items.map((p: any) => {
    if (p.id !== projectId) return p;

    const norm = normalizeProjectItem({
      ...p,
      deletedAt: nowIso,
      deleted_at: nowIso,
      pendingSync: true,
      localUpdatedAt: Date.now(),
      updatedAt: Date.now(),
    });

    return norm;
  });

  await saveProjects(next);
  return next;
}



export function computeProgress(p: Project): number {
  const checklistDone = CHECKLIST_KEYS.filter((k) => p.checklist?.[k]).length;
  const checklistPct = (checklistDone / CHECKLIST_KEYS.length) * 100;

  const doneMapPct = (map: Record<string, boolean>) => {
    const keys = Object.keys(map || {});
    if (keys.length === 0) return 0;
    const done = keys.filter((k) => !!map[k]).length;
    return (done / keys.length) * 100;
  };

  const musiciansPct = doneMapPct(p.musiciansDone || {});
  const editionPct = doneMapPct(p.editionDone || {});
  const tuningPct = doneMapPct(p.tuningDone || {});

  const avg = (checklistPct + musiciansPct + editionPct + tuningPct) / 4;
  return Math.max(0, Math.min(100, Math.round(avg)));
}

export function computeStatus(p: Project): ProjectStatus {
  if (p.status === "ARCHIVO") return "ARCHIVO";
  if (p.status === "STANDBY") return "STANDBY";
  return "EN_PROCESO";
}


// ---------------- Drafts ----------------

export async function createDraft(): Promise<string> {
  const drafts = await getJson<Draft[]>(KEY_DRAFTS, []);
  const id = uid();
  const now = Date.now();
  const d: Draft = { id, createdAt: now, updatedAt: now };
  drafts.unshift(d);
  await setJson(KEY_DRAFTS, drafts);
  return id;
}

export async function getDraft(draftId: string): Promise<Draft | null> {
  const drafts = await getJson<Draft[]>(KEY_DRAFTS, []);
  return drafts.find((d) => d.id === draftId) ?? null;
}

export async function updateDraft(draftId: string, patch: Partial<Draft>) {
  const drafts = await getJson<Draft[]>(KEY_DRAFTS, []);
  const idx = drafts.findIndex((d) => d.id === draftId);
  if (idx < 0) return drafts;
  drafts[idx] = { ...drafts[idx], ...patch, updatedAt: Date.now() };
  await setJson(KEY_DRAFTS, drafts);
  return drafts;
}

export async function deleteDraft(draftId: string) {
  const drafts = await getJson<Draft[]>(KEY_DRAFTS, []);
  const next = drafts.filter((d) => d.id !== draftId);
  await setJson(KEY_DRAFTS, next);
  return next;
}

// ---------------- Archive ----------------

export async function loadArchive(): Promise<ArchiveVersion[]> {
  return await getJson<ArchiveVersion[]>(KEY_ARCHIVE, []);
}

export async function saveArchive(items: ArchiveVersion[]) {
  await setJson(KEY_ARCHIVE, items);
}

export async function archiveProjectVersion(project: Project): Promise<ArchiveVersion> {
  const archive = await loadArchive();
  const archiveGroupId = project.id;
  const version = archive.filter((a) => a.archiveGroupId === archiveGroupId).length + 1;

  const item: ArchiveVersion = {
    id: uid(),
    archivedAt: Date.now(),
    version,
    archiveGroupId,
    projectSnapshot: project,
  };

  const next = [item, ...archive];
  await saveArchive(next);
  return item;
}

export async function restoreArchiveVersionToInProcess(
  archiveId: string
): Promise<Project | null> {
  const archive = await loadArchive();
  const v = archive.find((a) => a.id === archiveId);
  if (!v) return null;

  const p: Project = {
    ...v.projectSnapshot,
    id: uid(),
    createdAt: Date.now(),
    updatedAt: Date.now(),
    status: "EN_PROCESO",
  };

  await upsertProject(p);
  return p;
}

// ---------------- Agenda (Offline-first) ----------------

function normalizeAgendaItem(a: any): AgendaSyncItem {
  return {
    id: String(a?.id ?? uid()),
    dateLabel: String(a?.dateLabel ?? todayLabel()),
    artist: String(a?.artist ?? ""),
    note: a?.note ? String(a.note) : undefined,

    pendingSync: safeBool(a?.pendingSync),
    localUpdatedAt: typeof a?.localUpdatedAt === "number" ? a.localUpdatedAt : Date.now(),
    updatedAt: toIsoOrNull(a?.updatedAt),
    deletedAt: toIsoOrNull(a?.deletedAt),
  };
}

export async function loadAgenda(): Promise<AgendaSyncItem[]> {
  const raw = await getJson<any[]>(KEY_AGENDA, []);
  return (raw || []).map(normalizeAgendaItem);
}

export async function saveAgenda(items: AgendaSyncItem[]) {
  await setJson(KEY_AGENDA, items);
}

export async function upsertAgendaItem(item: AgendaItem) {
  const items = await loadAgenda();
  const norm = normalizeAgendaItem(item);

  const idx = items.findIndex((x) => x.id === norm.id);
  const next = [...items];

  norm.pendingSync = true;
  norm.localUpdatedAt = Date.now();

  if (idx >= 0) next[idx] = { ...next[idx], ...norm };
  else next.unshift(norm);

  await saveAgenda(next);
  return next;
}

export async function deleteAgendaItem(id: string) {
  const items = await loadAgenda();
  const nowIso = new Date().toISOString();

  const next = items.map((x) => {
    if (x.id !== id) return x;
    return {
      ...x,
      deletedAt: nowIso,
      pendingSync: true,
      localUpdatedAt: Date.now(),
    };
  });

  await saveAgenda(next);
  return next;
}

// ---------------- Pendings ----------------

function normalizePendingItem(p: any): PendingSyncItem {
  return {
    id: String(p?.id ?? uid()),
    createdAt: typeof p?.createdAt === "number" ? p.createdAt : Date.now(),
    text: String(p?.text ?? "").trim(),
    done: safeBool(p?.done),

    pendingSync: safeBool(p?.pendingSync),
    localUpdatedAt: typeof p?.localUpdatedAt === "number" ? p.localUpdatedAt : Date.now(),
    updatedAt: toIsoOrNull(p?.updatedAt),
    deletedAt: toIsoOrNull(p?.deletedAt),
  };
}
export async function loadPendings(): Promise<PendingSyncItem[]> {
  const raw = await getJson<any[]>(KEY_PENDINGS, []);

  return (raw || [])
    .map(normalizePendingItem)
    .filter((p) => !p.deletedAt); // ✅ CLAVE: no mostrar borrados
}


export async function savePendings(items: PendingSyncItem[]) {
  await setJson(KEY_PENDINGS, items);
}

export async function addPending(text: string) {
  const items = await loadPendings();
  const now = Date.now();
  const p: PendingSyncItem = normalizePendingItem({
    id: uid(),
    createdAt: now,
    text: text.trim(),
    done: false,
    pendingSync: true,
    localUpdatedAt: now,
    updatedAt: null,
    deletedAt: null,
  });

  const next = [p, ...items];
  await savePendings(next);
  return next;
}

export async function togglePending(id: string) {
  const items = await loadPendings();
  const next = items.map((p) => {
    if (p.id !== id) return p;
    return normalizePendingItem({
      ...p,
      done: !p.done,
      pendingSync: true,
      localUpdatedAt: Date.now(),
    });
  });
  await savePendings(next);
  return next;
}

export async function deletePending(id: string) {
  const items = await loadPendings();
  const nowIso = new Date().toISOString();
  const next = items.map((p) => {
    if (p.id !== id) return p;
    return normalizePendingItem({
      ...p,
      deletedAt: nowIso,
      pendingSync: true,
      localUpdatedAt: Date.now(),
    });
  });
  await savePendings(next);
  return next;
}

export async function hardDeletePending(id: string) {
  const items = await loadPendings();
  const next = items.filter((p) => p.id !== id);
  await savePendings(next);
  return next;
}

// ---------------- Checklist helper ----------------

export function emptyChecklist(): Checklist {
  const c: any = {};
  CHECKLIST_KEYS.forEach((k) => (c[k] = false));
  return c as Checklist;
}

// ---------------- Artist Notes ----------------

type ArtistNotesMap = Record<string, string>;

// (Se deja por compat, pero ya no lo usamos para keys)
function normArtistLegacy(name: string) {
  return (name || "").trim().toLowerCase().replace(/\s+/g, " ");
}

export async function getArtistNote(artist: string): Promise<string> {
  const raw = await AsyncStorage.getItem(KEY_ARTIST_NOTES);
  if (!raw) return "";
  const map = JSON.parse(raw) as ArtistNotesMap;

  // ✅ key estable (slug)
  const k = normalizeArtistLocalId(artist);
  return map[k] || "";
}

export async function setArtistNote(artist: string, note: string) {
  const raw = await AsyncStorage.getItem(KEY_ARTIST_NOTES);
  const map: ArtistNotesMap = raw ? JSON.parse(raw) : {};

  // ✅ key estable (slug)
  const k = normalizeArtistLocalId(artist);
  map[k] = note;

  await AsyncStorage.setItem(KEY_ARTIST_NOTES, JSON.stringify(map));
  await setArtistProfileNote(artist, note);
}

// ---------------- Artist Profiles ----------------

async function ensureSinArtistaLocal() {
  const items = await loadArtistProfiles();
  const exists = items.some((p) => !p.deletedAt && p.artistKey === SIN_ARTISTA_KEY);
  if (exists) return;

  await upsertArtistProfile({
    artistKey: SIN_ARTISTA_KEY,
    displayName: SIN_ARTISTA_NAME,
  });
}


async function ensureSinArtistaCloud(userId: string) {
  const { error } = await supabase
    .from("artist_profiles")
    .upsert(
      {
        user_id: userId,
        artist_key: SIN_ARTISTA_KEY,
        display_name: SIN_ARTISTA_NAME,
        note: null,
        advance_total: 0,
        deleted_at: null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,artist_key" }
    );

  if (error) console.log("[ensureSinArtistaCloud] error:", error);
}


function normalizeArtistProfile(p: any): ArtistProfileSyncItem {
  const now = Date.now();

  // Nombre visible (lo que quieres ver en la app)
  const displayName = String(
    p?.displayName ?? p?.display_name ?? p?.artist ?? ""
  ).trim();

  // ✅ CLAVE ESTABLE (para joins y para no romper links)
  // Siempre slug, sin espacios, sin acentos, lower, _
 const rawKey = String(p?.artistKey ?? p?.artist_key ?? displayName ?? "").trim();
const artistKey = normalizeArtistLocalId(rawKey);


  return {
    artistKey,
    displayName: displayName || artistKey, // fallback si viene vacío
    note: String(p?.note ?? ""),
    advanceTotal: Number(p?.advanceTotal ?? p?.advance_total ?? 0) || 0,

    pendingSync: safeBool(p?.pendingSync),
    localUpdatedAt:
      typeof p?.localUpdatedAt === "number" ? p.localUpdatedAt : now,
    updatedAt: toIsoOrNull(p?.updatedAt ?? p?.updated_at),
    deletedAt: toIsoOrNull(p?.deletedAt ?? p?.deleted_at),
  };
}

function normalizeNameForMatch(name: string) {
  const s = String(name || "").trim();
  if (!s) return "";
  const noAccents = s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  return noAccents.toLowerCase().replace(/\s+/g, " ").trim();
}

/**
 * Dado un texto "MS Nuevo", intenta:
 * 1) encontrar profile por displayName (ignora mayúsculas/acentos)
 * 2) si no, por artistKey (slug)
 * 3) si no existe, regresa el slug nuevo
 */
function stripTrailingNumbersKey(k: string) {
  // banda_toro_pesado_99 -> banda_toro_pesado
  return String(k || "").replace(/(_\d+)+$/g, "");
}



export async function resolveArtistKeyFromInput(input: string): Promise<string> {
  const raw = String(input || "").trim();
  if (!raw) return "";

  const wantedKey = normalizeArtistLocalId(raw);
  const wantedName = normalizeNameForMatch(raw);

  const profiles = await loadArtistProfiles();
  const alive = (profiles || []).filter((p) => !p.deletedAt);

  // 1) match exacto por key
  const exactKey = alive.find((p) => p.artistKey === wantedKey);
  if (exactKey) return exactKey.artistKey;

  // 2) match exacto por displayName
  const exactName = alive.find((p) => normalizeNameForMatch(p.displayName) === wantedName);
  if (exactName) return exactName.artistKey;

  // 3) match por baseKey sin números finales
  const baseWanted = stripTrailingNumbersKey(wantedKey);
  if (baseWanted && baseWanted !== wantedKey) {
    const baseMatch = alive.find((p) => p.artistKey === baseWanted);
    if (baseMatch) return baseMatch.artistKey;

    // también intenta si el displayName coincide con el baseWanted “bonito”
    const basePretty = normalizeNameForMatch(prettyFromKey(baseWanted));
    const baseNameMatch = alive.find(
      (p) => normalizeNameForMatch(p.displayName) === basePretty
    );
    if (baseNameMatch) return baseNameMatch.artistKey;
  }

  // 4) match “suave” (por si escriben cosas como “Banda Toro Pesado (99)”)
  const wantedTokens = wantedName.split(" ").filter(Boolean);
  const soft = alive.find((p) => {
    const dn = normalizeNameForMatch(p.displayName);
    // si todos los tokens principales están en el displayName
    return wantedTokens.length > 0 && wantedTokens.every((t) => dn.includes(t));
  });
  if (soft) return soft.artistKey;

  // si no existe, sí crea nueva key
  return wantedKey;
}


/** Útil para UI: obtener profile por KEY sin inventar keys */
export async function getArtistProfileByKey(artistKey: string) {
  const key = normalizeArtistLocalId(artistKey);
  const items = await loadArtistProfiles();
  return items.find((x) => x.artistKey === key) ?? null;
}


export async function loadArtistProfiles(): Promise<ArtistProfileSyncItem[]> {
  const rawProfiles = await getJson<any[]>(KEY_ARTIST_PROFILES, []);
  let profiles = (rawProfiles || []).map(normalizeArtistProfile);

  // Migración desde KEY_ARTIST_NOTES si aún no hay profiles
  if (profiles.length === 0) {
    const rawNotes = await AsyncStorage.getItem(KEY_ARTIST_NOTES);
    if (rawNotes) {
      try {
        const map = JSON.parse(rawNotes) as ArtistNotesMap;

        // 1) Migrar con slug estable
        const migrated: ArtistProfileSyncItem[] = Object.keys(map || {}).map((k) => {
          const displayName = String(k ?? "").trim();
          const artistKey = normalizeArtistLocalId(displayName);

          return normalizeArtistProfile({
            artistKey,
            displayName,
            note: map[k] || "",
            advanceTotal: 0,
            pendingSync: true,
            localUpdatedAt: Date.now(),
          });
        });

        // 2) Dedup por artistKey (si hubo duplicados en legacy)
        const dedup = new Map<string, ArtistProfileSyncItem>();
        for (const p of migrated) {
          if (!p.artistKey) continue;

          const prev = dedup.get(p.artistKey);
          if (!prev) {
            dedup.set(p.artistKey, p);
          } else {
            // combina: conserva el displayName más largo y nota si la nueva tiene algo
            dedup.set(p.artistKey, normalizeArtistProfile({
              ...prev,
              displayName:
                (String(p.displayName || "").length > String(prev.displayName || "").length)
                  ? p.displayName
                  : prev.displayName,
              note: String(p.note || "").trim() ? p.note : prev.note,
              advanceTotal: Math.max(Number(prev.advanceTotal || 0), Number(p.advanceTotal || 0)),
              pendingSync: true,
              localUpdatedAt: Date.now(),
            }));
          }
        }

        profiles = Array.from(dedup.values());
        await saveArtistProfiles(profiles);
      } catch {
        // ignore
      }
    }
  }

  return profiles;
}

export async function saveArtistProfiles(items: ArtistProfileSyncItem[]) {
  await setJson(KEY_ARTIST_PROFILES, items.map(normalizeArtistProfile));
}

// ✅ Si te pasan "Artista 1", esto debe resolver a artistKey "artista_1"
export async function getArtistProfile(artist: string): Promise<ArtistProfileSyncItem> {
  const key = await resolveArtistKeyFromInput(artist);
  const items = await loadArtistProfiles();

  return (
    items.find((x) => x.artistKey === key) ||
    normalizeArtistProfile({
      artistKey: key,
      displayName: artist,
      note: "",
      advanceTotal: 0,
      pendingSync: false,
      localUpdatedAt: Date.now(),
    })
  );
}

// ✅ Nota global por artista (PRO): usar artistKey canónico
export async function getArtistNoteByKey(artistKey: string): Promise<string> {
  const k = normalizeArtistLocalId(String(artistKey || ""));
  if (!k) return "";

  try {
    const profiles = await loadArtistProfiles();
    const row = (profiles || []).find((p: any) => {
      const pk = normalizeArtistLocalId(String(p?.artistKey ?? p?.artist_key ?? ""));
      const del = p?.deletedAt ?? p?.deleted_at;
      return pk === k && !del;
    });

    return String(row?.note ?? "").trim();
  } catch (e) {
    console.log("[db] getArtistNoteByKey failed:", e);
    return "";
  }
}

export async function setArtistNoteByKey(artistKey: string, note: string): Promise<void> {
  const k = normalizeArtistLocalId(String(artistKey || ""));
  if (!k) return;

  try {
    // ✅ se guarda en artist_profiles.note (offline-first)
    // upsertArtistProfile debe manejar pendingSync/localUpdatedAt etc. si ya lo tienes
    await upsertArtistProfile({
      artistKey: k,
      note: String(note ?? ""),
    } as any);
  } catch (e) {
    console.log("[db] setArtistNoteByKey failed:", e);
  }
}


export async function upsertArtistProfile(
  profile: Partial<ArtistProfileSyncItem> & { artistKey: string; displayName?: string }
) {
  const items = await loadArtistProfiles();

  const key = normalizeArtistLocalId(profile.artistKey);
  const existing = items.find((x) => x.artistKey === key);

  const norm = normalizeArtistProfile({
    ...existing,
    ...profile,
    artistKey: key,
    displayName: String(profile.displayName ?? existing?.displayName ?? key).trim(),
  });

  norm.pendingSync = true;
  norm.localUpdatedAt = Date.now();

  const idx = items.findIndex((x) => x.artistKey === key);
  const next = [...items];
  if (idx >= 0) next[idx] = { ...next[idx], ...norm };
  else next.unshift(norm);

  await saveArtistProfiles(next);
  return next;
}


export async function setArtistProfileNote(artist: string, note: string) {
  // ✅ key estable (slug)
  const key = normalizeArtistLocalId(artist);

  const items = await loadArtistProfiles();
  const idx = items.findIndex((x) => x.artistKey === key);
  const next = [...items];

  if (idx >= 0) {
    next[idx] = normalizeArtistProfile({
      ...next[idx],
      artistKey: key,
      displayName: next[idx].displayName || artist,
      note,
      pendingSync: true,
      localUpdatedAt: Date.now(),
    });
  } else {
    next.unshift(
      normalizeArtistProfile({
        artistKey: key,
        displayName: artist,
        note,
        advanceTotal: 0,
        pendingSync: true,
        localUpdatedAt: Date.now(),
      })
    );
  }

  await saveArtistProfiles(next);
  return next;
}

/**
 * ✅ RENAME OFFLINE-FIRST (LO QUE NECESITAS)
 * - NO cambia artistKey (estable)
 * - SÍ cambia displayName (visible)
 * - marca pendingSync para que syncArtistProfiles lo suba
 */
export async function renameArtistDisplayName(params: {
  artistKey: string; // ejemplo: "artista_1"
  newDisplayName: string;
}) {
  const key = normalizeArtistLocalId(params.artistKey);
  const name = String(params.newDisplayName || "").trim();
  if (!key || !name) return await loadArtistProfiles();

  const items = await loadArtistProfiles();
  const idx = items.findIndex((x) => x.artistKey === key);
  const now = Date.now();

  const next = [...items];
  if (idx >= 0) {
    next[idx] = normalizeArtistProfile({
      ...next[idx],
      artistKey: key,
      displayName: name,
      pendingSync: true,
      localUpdatedAt: now,
    });
  } else {
    next.unshift(
      normalizeArtistProfile({
        artistKey: key,
        displayName: name,
        note: "",
        advanceTotal: 0,
        pendingSync: true,
        localUpdatedAt: now,
      })
    );
  }

  await saveArtistProfiles(next);
  return next;
}

// Helper: map rápido para UI (artistKey -> displayName)
export async function getArtistNameMap(): Promise<Record<string, string>> {
  const profiles = await loadArtistProfiles();
  const out: Record<string, string> = {};
  for (const p of profiles) {
    if (p.deletedAt) continue;
    out[p.artistKey] = p.displayName;
  }
  return out;
}



async function hydrateProjectsArtistNames(items: ProjectSyncItem[]) {
  const nameMap = await getArtistNameMap();
  return (items || []).map((p: any) => {
    const key =
      normalizeArtistLocalId(String(p.artistLocalId ?? p.artist_local_id ?? "")) ||
      SIN_ARTISTA_KEY;

    const display =
      nameMap[key] ||
      (key === SIN_ARTISTA_KEY ? SIN_ARTISTA_NAME : prettyFromKey(key));

    return normalizeProjectItem({
      ...p,
      artistLocalId: key,
      artist: display,
    });
  });
}


function prettyFromKey(key: string) {
  const s = String(key || "").replace(/_/g, " ").trim();
  return s.replace(/\b\w/g, (m) => m.toUpperCase());
}


// ---------------- Wallet ----------------

function normalizeWalletMovement(m: any): WalletMovementSyncItem {
  const now = Date.now();
  return {
    id: String(m?.id ?? uid()),
    createdAt: typeof m?.createdAt === "number" ? m.createdAt : now,
    dateLabel: String(m?.dateLabel ?? todayLabel()),
    kind: String(m?.kind ?? "IN") as any,
    amount: Number(m?.amount ?? 0) || 0,
    currency: String(m?.currency ?? "MXN"),
    projectId: m?.projectId ? String(m.projectId) : undefined,
    artist: m?.artist ? String(m.artist) : undefined,
    note: m?.note ? String(m.note) : undefined,
    category: m?.category ? String(m.category) : undefined,

    pendingSync: safeBool(m?.pendingSync),
    localUpdatedAt: typeof m?.localUpdatedAt === "number" ? m.localUpdatedAt : now,
    updatedAt: toIsoOrNull(m?.updatedAt),
    deletedAt: toIsoOrNull(m?.deletedAt),
  };
}

export async function loadWallet(): Promise<WalletMovementSyncItem[]> {
  const raw = await getJson<any[]>(KEY_WALLET, []);
  return (raw || []).map(normalizeWalletMovement);
}

export async function saveWallet(items: WalletMovementSyncItem[]) {
  await setJson(KEY_WALLET, items.map(normalizeWalletMovement));
}

export async function walletSummary(
  { includeDeleted = false }: { includeDeleted?: boolean } = {}
) {
  const items = await loadWallet();
  const vis = includeDeleted ? items : items.filter((x) => !x.deletedAt);

  let income = 0;
  let expense = 0;
  for (const m of vis) {
    const amt = Number(m.amount) || 0;
    const k = String(m.kind || "").toUpperCase();
    if (k === "OUT" || k === "GASTO" || k === "EGRESO") expense += amt;
    else income += amt;
  }
  return { income, expense, net: income - expense, count: vis.length };
}

// ---------------- Wallet CRUD (offline-first) ----------------

export async function addWalletMovement(input: {
  dateLabel?: string;          // YYYY-MM-DD
  kind: "IN" | "OUT";
  amount: number;
  currency?: string;           // default "MXN"
  projectId?: string | null;
  artist?: string | null;
  note?: string | null;
  category?: string | null;
}) {
  const items = await loadWallet();
  const now = Date.now();

  const m: WalletMovementSyncItem = normalizeWalletMovement({
    id: uid(),
    createdAt: now,
    dateLabel: input.dateLabel ?? todayLabel(),
    kind: input.kind,
    amount: Number(input.amount ?? 0) || 0,
    currency: input.currency ?? "MXN",
    projectId: input.projectId ?? null,
    artist: input.artist ?? null,
    note: input.note ?? null,
    category: input.category ?? null,
    pendingSync: true,
    localUpdatedAt: now,
    updatedAt: null,
    deletedAt: null,
  });

  const next = [m, ...items];
  await saveWallet(next);
  return m;
}

// ---------------- Wallet CRUD ----------------

export async function upsertWalletMovement(
  movement: Partial<WalletMovementSyncItem> & { id: string }
) {
  const items = await loadWallet();
  const norm = normalizeWalletMovement(movement);

  norm.pendingSync = true;
  norm.localUpdatedAt = Date.now();
  norm.updatedAt = null;

  const idx = items.findIndex((x) => x.id === norm.id);
  const next = [...items];
  if (idx >= 0) next[idx] = { ...next[idx], ...norm };
  else next.unshift(norm);

  await saveWallet(next);
  return next;
}

// db.ts


// ---------------- Wallet: map Anticipos del Project -> wallet_movements ----------------

// Convierte advances (del payment) a wallet_movements tipo IN, ligados al projectId.
// Mantiene IDs estables para evitar duplicados.
// Borra (soft) los anticipos anteriores del mismo proyecto que ya no existan.

export async function replaceProjectAdvancesInWallet(args: {
  projectId: string;
  artist: string | null;
  advances: Array<{
    id: string;
    amount: number;
    createdAt: number;
    note?: string;
  }>;
}) {
  const projectId = String(args.projectId || "").trim();
  if (!projectId) {
    return await loadWallet();
  }

  const artist = args.artist ? String(args.artist) : null;
  const rawAdvances = Array.isArray(args.advances) ? args.advances : [];

  // 🔥 SOLO anticipos con monto positivo
  const advances = rawAdvances.filter(
    (a) => Number(a?.amount) > 0
  );

  // ID estable por anticipo (evita duplicados)
  const makeAdvanceMovementId = (advId: string) =>
    `adv_${projectId}_${String(advId || "").trim() || "x"}`;

  const now = Date.now();
  const nowIso = new Date(now).toISOString();

  // =========================
  // 1) Cargar wallet local
  // =========================
  const items = await loadWallet();

  const isAdvanceForProject = (m: WalletMovementSyncItem) =>
    String(m.projectId || "") === projectId &&
    String(m.category || "").toUpperCase() === "ADVANCE";

  const existingAdv = items.filter(isAdvanceForProject);

  // =========================
  // 2) IDs vigentes
  // =========================
  const keepIds = new Set(
    advances
      .map((a) => makeAdvanceMovementId(a.id))
      .filter(Boolean)
  );

  // =========================
  // 3) Soft-delete de anticipos viejos
  // =========================
  const cleaned = items.map((m) => {
    if (!isAdvanceForProject(m)) return m;

    if (!keepIds.has(String(m.id))) {
      return normalizeWalletMovement({
        ...m,
        deletedAt: nowIso,
        pendingSync: true,
        localUpdatedAt: now,
      });
    }

    return m;
  });

  // =========================
  // 4) Map para upsert
  // =========================
  const byId = new Map<string, WalletMovementSyncItem>();
  for (const m of cleaned) {
    byId.set(m.id, m);
  }

  // =========================
  // 5) Helper fecha
  // =========================
  const toDateLabel = (ms: number) => {
    const d = new Date(ms || Date.now());
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  };

  // =========================
  // 6) Insert / Update anticipos válidos
  // =========================
  for (const a of advances) {
    const advId = String(a?.id || "").trim();
    if (!advId) continue;

    const amount = Number(a.amount);
    if (!Number.isFinite(amount) || amount <= 0) continue; // 🔒 blindaje final

    const createdAt = Number(a.createdAt) || now;
    const id = makeAdvanceMovementId(advId);

    const prev = byId.get(id);

    const next = normalizeWalletMovement({
      ...(prev || {}),
      id,
      createdAt,
      dateLabel: toDateLabel(createdAt),
      kind: "ANTICIPO",
      amount,
      currency: "MXN",
      projectId,
      artist,

      // Categoría fija para reconocerlos
      category: "ADVANCE",

      note: String(a.note ?? "").trim() || "Anticipo",

      pendingSync: true,
      localUpdatedAt: now,
      updatedAt: null,
      deletedAt: null,
    });

    byId.set(id, next);
  }

  // =========================
  // 7) Guardar wallet
  // =========================
  const nextAll = Array.from(byId.values()).sort(
    (a, b) => (b.localUpdatedAt ?? 0) - (a.localUpdatedAt ?? 0)
  );

  await saveWallet(nextAll);
  return nextAll;
}




// soft delete (cloud-friendly)
export async function softDeleteWalletMovement(id: string) {
  const items = await loadWallet();
  const nowIso = new Date().toISOString();

  const next = items.map((x) => {
    if (x.id !== id) return x;
    return normalizeWalletMovement({
      ...x,
      deletedAt: nowIso,
      pendingSync: true,
      localUpdatedAt: Date.now(),
    });
  });

  await saveWallet(next);
  return next;
}

// hard delete (solo local)
export async function hardDeleteWalletMovement(id: string) {
  const items = await loadWallet();
  const next = items.filter((x) => x.id !== id);
  await saveWallet(next);
  return next;
}



// ---------------- Supabase Sync (Tracks -> public.tracks) ----------------

function trackToRow(userId: string, t: TrackSyncItem) {
  const updatedMs = t.localUpdatedAt ?? Date.now();
  return {
    user_id: userId,
    id: t.id,
    project_id: t.projectId,
    title: t.title,
    status: t.status,
    progress: typeof t.progress === "number" ? t.progress : 0,
    general: t.general ?? [],
    musicians: t.musicians ?? [],
    tuning: t.tuning ?? [],
    editing: t.editing ?? [],
    deleted_at: t.deletedAt ?? null,
    updated_at: new Date(updatedMs).toISOString(),
  };
}

function rowToTrack(r: any): TrackSyncItem {
  return normalizeTrackItem({
    id: String(r?.id ?? uid()),
    projectId: String(r?.project_id ?? ""),
    title: String(r?.title ?? ""),
    status: String(r?.status ?? "active"),
    progress: typeof r?.progress === "number" ? r.progress : Number(r?.progress ?? 0),

    general: r?.general ?? [],
    musicians: r?.musicians ?? [],
    tuning: r?.tuning ?? [],
    editing: r?.editing ?? [],

    pendingSync: false,
    localUpdatedAt: r?.updated_at ? new Date(r.updated_at).getTime() : Date.now(),
    updatedAt: toIsoOrNull(r?.updated_at),
    deletedAt: toIsoOrNull(r?.deleted_at),
  });
}


// soft delete (marca deletedAt + pendingSync)
export async function deleteWalletMovement(id: string) {
  const items = await loadWallet();
  const nowIso = new Date().toISOString();

  const next = items.map((m) => {
    if (m.id !== id) return m;
    return normalizeWalletMovement({
      ...m,
      deletedAt: nowIso,
      pendingSync: true,
      localUpdatedAt: Date.now(),
    });
  });

  await saveWallet(next);
  return next;
}


export async function syncTracks(): Promise<TrackSyncItem[]> {
  const { data, error } = await supabase.auth.getSession();
  if (error || !data.session?.user) throw new Error("No hay sesión");
  const userId = data.session.user.id;

  let local = await loadTracks();
  const pendingLocal = local.filter((t) => safeBool((t as any).pendingSync));

  // ---- PUSH ----
  if (pendingLocal.length > 0) {
    const payload = pendingLocal.map((t) => trackToRow(userId, t));

    const { error: upErr } = await supabase
      .from("tracks")
      .upsert(payload, { onConflict: "user_id,id" });

    if (upErr) {
      console.log("[syncTracks] PUSH error:", upErr);
      throw upErr;
    }

    const nextLocal = local.map((t) => {
      if (!safeBool((t as any).pendingSync)) return t;
      return normalizeTrackItem({
        ...t,
        pendingSync: false,
        updatedAt: new Date().toISOString(),
      });
    });

    await saveTracks(nextLocal);
    local = nextLocal;
  }

  // ---- PULL ----
  const lastPullRaw =
    (await AsyncStorage.getItem(KEY_TRACKS_LAST_PULL)) || "1970-01-01T00:00:00.000Z";

  const backoffMs = 2000;
  const lastPull = new Date(new Date(lastPullRaw).getTime() - backoffMs).toISOString();

  let rows: any[] | null = null;
  let pullErr: any = null;

  try {
    const res: any = await withTimeout(
      supabase
        .from("tracks")
        .select("id, project_id, title, status, progress, general, musicians, tuning, editing, updated_at, deleted_at")
        .eq("user_id", userId)
        .gte("updated_at", lastPull)
        .order("updated_at", { ascending: true }),
      PULL_TIMEOUT_MS
    );

    rows = res?.data ?? null;
    pullErr = res?.error ?? null;
  } catch (e) {
    pullErr = e;
  }

  if (pullErr) {
    console.log("[syncTracks] PULL error:", pullErr);
    return local;
  }

  const map = new Map<string, TrackSyncItem>();
  for (const t of local) map.set(t.id, t);

  const toMs = (iso?: string | null) => (iso ? new Date(iso).getTime() : 0);
  let maxServerUpdatedAt = lastPullRaw;

  for (const r of rows ?? []) {
    const localId = String(r.id);

    const rUpdated = String(r.updated_at ?? "");
    if (rUpdated && toMs(rUpdated) > toMs(maxServerUpdatedAt)) maxServerUpdatedAt = rUpdated;

    const existing = map.get(localId);
    if (existing && safeBool((existing as any).pendingSync)) continue;

    map.set(localId, rowToTrack(r));
  }

  const merged = Array.from(map.values());
  await saveTracks(merged);

  if (rows && rows.length > 0) {
    await AsyncStorage.setItem(KEY_TRACKS_LAST_PULL, maxServerUpdatedAt);
  }

  return merged;
}

// ---------------- Backup ----------------

export async function exportBackupJson(): Promise<string> {
  const [projects, archive, agenda, pendings, artistProfiles, wallet] = await Promise.all([
    loadProjects(),
    loadArchive(),
    loadAgenda(),
    loadPendings(),
    loadArtistProfiles(),
    loadWallet(),
  ]);

  const rawNotes = await AsyncStorage.getItem(KEY_ARTIST_NOTES);
  const artistNotes = rawNotes ? JSON.parse(rawNotes) : {};

  const snapshot: BackupSnapshot = {
    version: 1,
    createdAt: Date.now(),
    projects,
    archive,
    agenda,
    pendings,
    artistNotes,
    artistProfiles,
    wallet,
  };

  return JSON.stringify(snapshot, null, 2);
}

export async function importBackupJson(json: string): Promise<void> {
  let parsed: BackupSnapshot;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new Error("El texto no es un JSON válido.");
  }

  if (!parsed || typeof parsed !== "object") {
    throw new Error("Formato de backup inválido.");
  }

  const projects = parsed.projects || [];
  const archive = parsed.archive || [];
  const agenda = (parsed.agenda || []).map(normalizeAgendaItem);
  const pendings = (parsed.pendings || []).map(normalizePendingItem);
  const artistProfiles = (parsed.artistProfiles || []).map(normalizeArtistProfile);
  const wallet = (parsed.wallet || []).map(normalizeWalletMovement);
  const artistNotes = (parsed as any).artistNotes || {};

  await Promise.all([
    saveProjects(projects.map(normalizeProjectItem)),
    saveArchive(archive),
    saveAgenda(agenda),
    savePendings(pendings),
    saveArtistProfiles(artistProfiles),
    saveWallet(wallet),
    AsyncStorage.setItem(KEY_ARTIST_NOTES, JSON.stringify(artistNotes)),
  ]);
}

export async function createBackupFile(): Promise<string> {
  const json = await exportBackupJson();
  const date = new Date().toISOString().slice(0, 10);
  const fileName = `oliworks-backup-${date}.json`;

  const dir =
    ((FileSystem as any).documentDirectory as string | undefined) ??
    ((FileSystem as any).cacheDirectory as string | undefined) ??
    "";

  const uri = dir + fileName;
  await FileSystem.writeAsStringAsync(uri, json);
  return uri;
}

// ---------------- Supabase Sync (Agenda -> public.events) ----------------

function agendaItemToEventRow(userId: string, a: AgendaSyncItem) {
  return {
    user_id: userId,
    local_id: a.id,
    title: a.artist,
    starts_at: ymdToStartsAtISO(a.dateLabel),
    notes: a.note ?? null,
    deleted_at: a.deletedAt ?? null,
    updated_at: new Date(a.localUpdatedAt || Date.now()).toISOString(),
  };
}

function eventRowToAgendaItem(r: any): AgendaSyncItem {
  const starts = String(r?.starts_at ?? "");
  const ymd = startsAtISOToYMD(starts);

  return normalizeAgendaItem({
    id: String(r.local_id),
    dateLabel: ymd,
    artist: String(r.title ?? ""),
    note: r.notes ?? undefined,
    pendingSync: false,
    localUpdatedAt: r?.updated_at ? new Date(r.updated_at).getTime() : Date.now(),
    updatedAt: toIsoOrNull(r.updated_at),
    deletedAt: toIsoOrNull(r.deleted_at),
  });
}

export async function syncAgenda(): Promise<AgendaSyncItem[]> {
  const { data, error } = await supabase.auth.getSession();
  if (error || !data.session?.user) throw new Error("No hay sesión");
  const userId = data.session.user.id;

  let local = await loadAgenda();
  const pending = local.filter((a) => safeBool((a as any).pendingSync));

  // ---------- PUSH ----------
  if (pending.length > 0) {
    const payload = pending.map((a) => agendaItemToEventRow(userId, a));

    const { error: upErr } = await supabase
      .from("events")
      .upsert(payload, { onConflict: "user_id,local_id" });

    if (upErr) {
      console.log("[syncAgenda] PUSH error:", upErr);
      throw upErr;
    }

    const nextLocal = local.map((a) => {
      if (!safeBool((a as any).pendingSync)) return a;
      return normalizeAgendaItem({
        ...a,
        pendingSync: false,
        updatedAt: new Date().toISOString(),
      });
    });

    await saveAgenda(nextLocal);
    local = nextLocal;
  }

  // ---------- PULL ----------
  const lastPullRaw =
    (await AsyncStorage.getItem(KEY_AGENDA_LAST_PULL)) || "1970-01-01T00:00:00.000Z";

  const backoffMs = 2000;
  const lastPull = new Date(new Date(lastPullRaw).getTime() - backoffMs).toISOString();

  let rows: any[] | null = null;
  let pullErr: any = null;

  try {
    const res: any = await withTimeout(
      supabase
        .from("events")
        .select("local_id, title, starts_at, notes, updated_at, deleted_at")
        .eq("user_id", userId)
        .gte("updated_at", lastPull)
        .order("updated_at", { ascending: true }),
      PULL_TIMEOUT_MS
    );
    rows = res?.data ?? null;
    pullErr = res?.error ?? null;
  } catch (e) {
    pullErr = e;
  }

  if (pullErr) {
    console.log("[syncAgenda] PULL error:", pullErr);
    return local;
  }

  const map = new Map<string, AgendaSyncItem>();
  for (const a of local) map.set(a.id, a);

  const toMs = (iso?: string | null) => (iso ? new Date(iso).getTime() : 0);
  let maxServerUpdatedAt = lastPullRaw;

  for (const r of rows ?? []) {
    const localId = String(r.local_id);

    const rUpdated = String(r.updated_at ?? "");
    if (rUpdated && toMs(rUpdated) > toMs(maxServerUpdatedAt)) maxServerUpdatedAt = rUpdated;

    const existing = map.get(localId);
    if (existing && safeBool((existing as any).pendingSync)) continue;

    map.set(localId, eventRowToAgendaItem(r));
  }

  const merged = Array.from(map.values());
  await saveAgenda(merged);

  if (rows && rows.length > 0) {
    await AsyncStorage.setItem(KEY_AGENDA_LAST_PULL, maxServerUpdatedAt);
  }

  return merged;
}

// ---------------- Supabase Sync (Pendings -> public.pendings) ----------------

function pendingItemToRow(userId: string, p: PendingSyncItem) {
  return {
    user_id: userId,
    local_id: p.id,
    text: p.text,
    done: !!p.done,
    deleted_at: p.deletedAt ?? null,
    updated_at: new Date(p.localUpdatedAt || Date.now()).toISOString(),
  };
}

function rowToPendingItem(r: any): PendingSyncItem {
  return normalizePendingItem({
    id: String(r.local_id),
    createdAt: Date.now(),
    text: String(r.text ?? ""),
    done: safeBool(r.done),
    pendingSync: false,
    localUpdatedAt: r?.updated_at ? new Date(r.updated_at).getTime() : Date.now(),
    updatedAt: toIsoOrNull(r.updated_at),
    deletedAt: toIsoOrNull(r.deleted_at),
  });
}

export async function syncPendings(): Promise<PendingSyncItem[]> {
  const { data, error } = await supabase.auth.getSession();
  if (error || !data.session?.user) throw new Error("No hay sesión");
  const userId = data.session.user.id;

  let local = await loadPendings();
  const pendingLocal = local.filter((p) => safeBool((p as any).pendingSync));

  // ---------------- PUSH ----------------
  if (pendingLocal.length > 0) {
    const payload = pendingLocal.map((p) => pendingItemToRow(userId, p));

    const { error: upErr } = await supabase
      .from("pendings")
      .upsert(payload, { onConflict: "user_id,local_id" });

    if (upErr) {
      console.log("[syncPendings] PUSH error:", upErr);
      throw upErr;
    }

    const nextLocal = local.map((p) => {
      if (!safeBool((p as any).pendingSync)) return p;
      return normalizePendingItem({
        ...p,
        pendingSync: false,
        updatedAt: new Date().toISOString(),
      });
    });

    await savePendings(nextLocal);
    local = nextLocal;
  }

  // ---------------- PULL ----------------
  const lastPullRaw =
    (await AsyncStorage.getItem(KEY_PENDINGS_LAST_PULL)) || "1970-01-01T00:00:00.000Z";

  const backoffMs = 2000;
  const lastPull = new Date(new Date(lastPullRaw).getTime() - backoffMs).toISOString();

  let rows: any[] | null = null;
  let pullErr: any = null;

  try {
    const res: any = await withTimeout(
      supabase
        .from("pendings")
        .select("local_id, text, done, updated_at, deleted_at")
        .eq("user_id", userId)
        .gte("updated_at", lastPull)
        .order("updated_at", { ascending: true }),
      PULL_TIMEOUT_MS
    );
    rows = res?.data ?? null;
    pullErr = res?.error ?? null;
  } catch (e) {
    pullErr = e;
  }

  if (pullErr) {
    console.log("[syncPendings] PULL error:", pullErr);
    return local;
  }

  const map = new Map<string, PendingSyncItem>();
  for (const p of local) map.set(p.id, p);

  const toMs = (iso?: string | null) => (iso ? new Date(iso).getTime() : 0);
  let maxServerUpdatedAt = lastPullRaw;

  for (const r of rows ?? []) {
    const localId = String(r.local_id);

    const rUpdated = String(r.updated_at ?? "");
    if (rUpdated && toMs(rUpdated) > toMs(maxServerUpdatedAt)) maxServerUpdatedAt = rUpdated;

    const existing = map.get(localId);
    if (existing && safeBool((existing as any).pendingSync)) continue;

    map.set(localId, rowToPendingItem(r));
  }

  const merged = Array.from(map.values());
  await savePendings(merged);

  if (rows && rows.length > 0) {
    await AsyncStorage.setItem(KEY_PENDINGS_LAST_PULL, maxServerUpdatedAt);
  }

  return merged;
}

// ---------------- Supabase Sync (Projects -> public.projects) ----------------

function stripProjectForJson(p: ProjectSyncItem): any {
  const {
    pendingSync,
    localUpdatedAt,
    serverUpdatedAt,
    deletedAt,
    instrumentationType, // 🔥 sácalo
    instrumentation_type, // por si acaso
    ...rest
  } = (p as any) || {};

  return rest;
}

function projectToRow(userId: string, p: ProjectSyncItem) {
  const anyP: any = p as any;

  // updatedMs: prefer localUpdatedAt -> updatedAt -> now
  const updatedMsRaw = anyP.localUpdatedAt ?? anyP.updatedAt ?? Date.now();
  const updatedMs =
    typeof updatedMsRaw === "number" ? updatedMsRaw : Number(updatedMsRaw) || Date.now();



  // ---------- artistLocalId ----------
  let artistLocalId =
    anyP.artistLocalId ??
    anyP.artist_local_id ??
    anyP.groupId ??
    anyP.artistId ??
    anyP.artist_id ??
    null;

  if ((!artistLocalId || String(artistLocalId).trim() === "") && anyP.artist) {
    const k = normalizeArtistLocalId(String(anyP.artist));
    artistLocalId = k || null;
  }

  if (!artistLocalId || String(artistLocalId).trim() === "") {
    artistLocalId = "sin_artista";
  } else {
    artistLocalId = normalizeArtistLocalId(String(artistLocalId));
  }

  // ---------- totalCost ----------
  // ---------- totalCost ----------
const paymentCost = parseMoneyLike(anyP?.payment?.cost);

const rawTotal =
  anyP.totalCost !== undefined ? anyP.totalCost :
  anyP.total_cost !== undefined ? anyP.total_cost :
  undefined;

const totalProvided =
  rawTotal !== undefined && rawTotal !== null && String(rawTotal).trim() !== "";

let totalCost =
  typeof rawTotal === "number"
    ? rawTotal
    : parseMoneyLike(rawTotal);

if (!Number.isFinite(totalCost)) totalCost = 0;

// ✅ Regla A: solo backfill si NO venía totalCost
if (!totalProvided && paymentCost > 0) {
  totalCost = paymentCost;
}

  // ---------- progress ----------
  const progressRaw = anyP.progress ?? 0;
  const progress = typeof progressRaw === "number" ? progressRaw : Number(progressRaw) || 0;

  // ---------- status ----------
  const status = String(anyP.status ?? "EN_PROCESO");

  // ---------- title ----------
  const title = String(anyP.title ?? "");

  // ---------- deletedAt ----------
  const deletedAt = anyP.deletedAt ?? anyP.deleted_at ?? null;

  // ✅ SUPER IMPORTANTE: imprime lo que vas a mandar

  console.log("[syncProjects] totalCost pick", {
  id: anyP.id,
  totalCost: anyP.totalCost,
  total_cost: anyP.total_cost,
  paymentCost: anyP?.payment?.cost,
});


  console.log("[projectToRow] ->", {
    local_id: String(anyP.id ?? anyP.local_id ?? p.id),
    title,
    artist_local_id: artistLocalId,
    total_cost: totalCost,
    payment_cost: paymentCost,
  });

      // 🔥 NORMALIZAR INSTRUMENTATION (app -> cloud)
const instrumentationType =
  anyP.instrumentationType ??
  anyP.instrumentation_type ??
  "OTROS";

  return {
    user_id: userId,
    local_id: String(anyP.id ?? anyP.local_id ?? p.id),
    title,
    status,
    progress,
    artist_local_id: artistLocalId,
    total_cost: totalCost,
    data: {
  ...stripProjectForJson(p),
  instrumentation_type: instrumentationType, // ✅ SOLO snake_case en cloud
},

    deleted_at: deletedAt,
    updated_at: new Date(updatedMs).toISOString(),
  };
}





function rowToProject(r: any): ProjectSyncItem {
  const localId = String(r?.local_id ?? uid());
  const data = r?.data && typeof r.data === "object" ? r.data : {};

  const cloudTitle = String(r?.title ?? "").trim();
  const dataTitle = String((data as any)?.title ?? "").trim();

  // 🔥 NORMALIZAR INSTRUMENTATION (cloud -> app)
const instrumentationType =
  r?.data?.instrumentation_type ??
  r?.data?.instrumentationType ??
  "OTROS";


  return normalizeProjectItem({
    ...data,
    id: localId,

    createdAt: r?.created_at ? new Date(r.created_at).getTime() : Date.now(),


    // ✅ title: prioridad cloud.title, luego data.title
    title: cloudTitle || dataTitle || "",

    artistLocalId: r?.artist_local_id ?? data.artistLocalId ?? data.artist_local_id ?? null,
instrumentationType, // ✅ SOLO camelCase en app

    totalCost:
      typeof r?.total_cost === "number"
        ? r.total_cost
        : Number(r?.total_cost ?? data.totalCost ?? data.total_cost ?? 0) || 0,

    status: String(r?.status ?? data.status ?? "EN_PROCESO"),
    progress:
      typeof r?.progress === "number"
        ? r.progress
        : Number(r?.progress ?? data.progress ?? 0) || 0,

    pendingSync: false,
    localUpdatedAt: r?.updated_at ? new Date(r.updated_at).getTime() : Date.now(),
    serverUpdatedAt: toIsoOrNull(r?.updated_at),
    deletedAt: toIsoOrNull(r?.deleted_at),
  });
}


// db.ts

async function ensureArtistsForProjectsPayload(params: {
  userId: string;
  payload: Array<{ artist_local_id?: any; data?: any }>;
}) {
  const { userId, payload } = params;

  const keys = Array.from(
    new Set(
      (payload || [])
        .map((x: any) => String(x?.artist_local_id ?? "").trim())
        .filter(Boolean)
        .map((k) => normalizeArtistLocalId(k))
        .filter(Boolean)
    )
  );

  // Siempre incluye sin_artista
  if (!keys.includes(SIN_ARTISTA_KEY)) keys.push(SIN_ARTISTA_KEY);
  if (keys.length === 0) return;

  // nombre “humano” si viene en data.artist
  const bestNameByKey = new Map<string, string>();
  for (const row of payload || []) {
    const k = normalizeArtistLocalId(String((row as any)?.artist_local_id ?? "").trim());
    if (!k) continue;
    const rawName = String((row as any)?.data?.artist ?? "").trim();
    if (rawName) bestNameByKey.set(k, rawName);
  }

  const nowIso = new Date().toISOString();

  const upArtists = keys.map((k) => ({
    user_id: userId,
    local_id: k,
    name: bestNameByKey.get(k) || (k === SIN_ARTISTA_KEY ? SIN_ARTISTA_NAME : prettyFromKey(k)),
    global_note: null,
    updated_at: nowIso,
    // deleted_at: null, // si tu tabla lo tiene y quieres mandarlo
  }));

  // IMPORTANTÍSIMO: ignoreDuplicates para NO pisar nombres existentes
  const { error } = await supabase
    .from("artists")
    .upsert(upArtists as any, {
      onConflict: "user_id,local_id",
      ignoreDuplicates: true,
    });

  if (error) console.log("[ensureArtistsForProjectsPayload] upsert error:", error);
}

// db.ts
// db.ts
async function ensureArtistProfilesForProjectsPayload(params: {
  userId: string;
  payload: Array<{ artist_local_id?: any; artist?: any; display_name?: any }>;
}) {
  const { userId, payload } = params;

  // 1) keys únicas + normalizadas
  const keys = Array.from(
    new Set(
      (payload || [])
        .map((x: any) => String(x?.artist_local_id ?? "").trim())
        .filter(Boolean)
        .map((k) => normalizeArtistLocalId(k))
        .filter(Boolean)
    )
  );

  if (keys.length === 0) return;

  // helper: chunk
  const chunk = <T,>(arr: T[], size: number) => {
    const out: T[][] = [];
    for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
    return out;
  };

  // helper: si viene nombre humano en payload, úsalo para CREAR
  const bestNameByKey = new Map<string, string>();
  for (const p of payload || []) {
    const key = normalizeArtistLocalId(String((p as any)?.artist_local_id ?? "").trim());
    if (!key) continue;

    const raw =
      String((p as any)?.display_name ?? "").trim() ||
      String((p as any)?.artist ?? "").trim(); // por si tu payload trae artist

    if (raw) bestNameByKey.set(key, raw);
  }

  // 2) consulta existentes en cloud (por chunks)
  const existingSet = new Set<string>();

  for (const part of chunk(keys, 300)) {
    const { data: existing, error: selErr } = await supabase
      .from("artist_profiles")
      .select("artist_key")
      .eq("user_id", userId)
      .in("artist_key", part);

    if (selErr) {
      console.log("[ensureArtistProfilesForProjectsPayload] select error:", selErr);
      return; // no hacemos nada para no arriesgar pisar/duplicar
    }

    for (const r of existing || []) {
      const k = String((r as any)?.artist_key ?? "").trim();
      if (k) existingSet.add(k);
    }
  }

  // 3) solo crear los que NO existen
  const missingKeys = keys.filter((k) => !existingSet.has(k));
  if (missingKeys.length === 0) return;

  const upProfiles = missingKeys.map((k) => {
    const preferred = bestNameByKey.get(k);
    return {
      user_id: userId,
      artist_key: k,
      display_name: preferred || prettyFromKey(k),
      // no mandamos updated_at (deja que DB lo maneje si aplica)
    };
  });

  // 4) upsert de SOLO faltantes (y además ignora duplicados por seguridad)
  const { error: upErr } = await supabase
    .from("artist_profiles")
    .upsert(upProfiles as any, {
      onConflict: "user_id,artist_key",
      ignoreDuplicates: true,
    });

  if (upErr) {
    console.log("[ensureArtistProfilesForProjectsPayload] upsert error:", upErr);
  }
}



export async function syncProjects(): Promise<ProjectSyncItem[]> {
  const { data, error } = await supabase.auth.getSession();
  if (error || !data.session?.user) throw new Error("No hay sesión");
  const userId = data.session.user.id;

  // 1) Load local (normaliza + backfills seguros)
  let local = (await loadProjects()) as ProjectSyncItem[];

  // 2) MIGRACIÓN legacy: si falta artistLocalId pero existe artist (nombre) -> slug estable
  try {
    let changed = 0;
    const nowMs = Date.now();

    const backfilled = local.map((p) => {
      const anyP: any = p as any;
      const cur = anyP.artistLocalId ?? anyP.artist_local_id ?? null;
      const name = String(anyP.artist ?? "").trim();

      if ((!cur || String(cur).trim() === "") && name) {
        const k = normalizeArtistLocalId(name);
        if (k) {
          changed++;
          return normalizeProjectItem({
            ...p,
            artistLocalId: k,
            pendingSync: true,
            localUpdatedAt: nowMs,
            updatedAt: nowMs,
          });
        }
      }
      return p;
    });

    if (changed > 0) {
      await saveProjects(backfilled);
      local = backfilled;
      console.log("[syncProjects] backfill artistLocalId ->", changed, "projects");
    }
  } catch (e) {
    console.log("[syncProjects] artistLocalId backfill error (ignored):", e);
  }

  const pendingLocal = local.filter((p) => safeBool((p as any).pendingSync));

  // 3) PUSH
  if (pendingLocal.length > 0) {
    const payload = pendingLocal.map((p) => projectToRow(userId, p));

    // Asegura "sin_artista" en cloud (profiles)
await ensureSinArtistaCloud(userId);

await ensureArtistsForProjectsPayload({
  userId,
  payload: [
    ...payload,
    { artist_local_id: "sin_artista", data: { artist: "Sin artista" } },
  ],
});



// ✅ 2) asegura ARTIST_PROFILES (para UI / notas / display)
await ensureArtistProfilesForProjectsPayload({
  userId,
  payload: [
    ...payload,
    { artist_local_id: "sin_artista", artist: "Sin artista" },
  ],
});

const { error: upErr } = await supabase
  .from("projects")
  .upsert(payload as any, { onConflict: "user_id,local_id" });


    if (upErr) {
      console.log("[syncProjects] PUSH error:", upErr);
      throw upErr;
    }

    // marca como synced
    const nowIso = new Date().toISOString();
    const nextLocal = local.map((p) => {
      if (!safeBool((p as any).pendingSync)) return p;
      return normalizeProjectItem({
        ...p,
        pendingSync: false,
        serverUpdatedAt: nowIso,
      });
    });

    await saveProjects(nextLocal);
    local = nextLocal;
  }

  // 4) PULL
  const lastPullRaw =
    (await AsyncStorage.getItem(KEY_PROJECTS_LAST_PULL)) || "1970-01-01T00:00:00.000Z";

  const backoffMs = 2000;
  const lastPull = new Date(new Date(lastPullRaw).getTime() - backoffMs).toISOString();

  const { data: rows, error: pullErr } = (await withTimeout(
    supabase
      .from("projects")
.select("local_id, title, data, artist_local_id, total_cost, status, progress, created_at, updated_at, deleted_at")

      .eq("user_id", userId)
      .gte("updated_at", lastPull)
      .order("updated_at", { ascending: true }),
    PULL_TIMEOUT_MS
  )) as any;

  if (pullErr) {
    console.log("[syncProjects] PULL error:", pullErr);
    return local;
  }

  const map = new Map<string, ProjectSyncItem>();
  for (const p of local) map.set(p.id, p);

  const toMs = (iso?: string | null) => (iso ? new Date(iso).getTime() : 0);
  let maxServerUpdatedAt = lastPullRaw;

  for (const r of rows ?? []) {
    console.log("[PULL] local_id:", r.local_id, "title:", r.title, "updated_at:", r.updated_at);

    const localId = String(r.local_id);

    const rUpdated = String(r.updated_at ?? "");
    if (rUpdated && toMs(rUpdated) > toMs(maxServerUpdatedAt)) {
      maxServerUpdatedAt = rUpdated;
    }

    const existing = map.get(localId);
    if (existing && safeBool((existing as any).pendingSync)) continue;

    map.set(localId, rowToProject(r));
  }

  let merged = Array.from(map.values());

  // ✅ hidrata artist displayName para UI (sin tocar cloud)
  merged = await hydrateProjectsArtistNames(merged);

  await saveProjects(merged);

  if (rows && rows.length > 0) {
    await AsyncStorage.setItem(KEY_PROJECTS_LAST_PULL, maxServerUpdatedAt);
  }

  return merged;
}

export async function forceResyncProjectsHard() {
  await AsyncStorage.removeItem(KEY_PROJECTS);
  await AsyncStorage.setItem(KEY_PROJECTS_LAST_PULL, "1970-01-01T00:00:00.000Z");
  const merged = await syncProjects();
  console.log("[forceResyncProjectsHard] projects:", merged.length);
  return merged;
}


// ---------------- Supabase Sync (Artist Profiles -> public.artist_profiles) ----------------

function profileToRow(userId: string, p: ArtistProfileSyncItem) {
  const updatedMs = p.localUpdatedAt ?? Date.now();
  return {
    user_id: userId,
    artist_key: normalizeArtistLocalId(p.artistKey),
    display_name: p.displayName,
    note: p.note ?? null,
    advance_total: typeof p.advanceTotal === "number" ? p.advanceTotal : 0,
    deleted_at: p.deletedAt ?? null,
    updated_at: new Date(updatedMs).toISOString(),
  };
}



function rowToProfile(r: any): ArtistProfileSyncItem {
  return normalizeArtistProfile({
    artistKey: String(r?.artist_key ?? ""),
    displayName: String(r?.display_name ?? ""),
    note: r?.note ?? "",
    advanceTotal:
      typeof r?.advance_total === "number" ? r.advance_total : Number(r?.advance_total ?? 0),
    pendingSync: false,
    localUpdatedAt: r?.updated_at ? new Date(r.updated_at).getTime() : Date.now(),
    updatedAt: toIsoOrNull(r?.updated_at),
    deletedAt: toIsoOrNull(r?.deleted_at),
  });
}

export async function syncArtistProfiles(): Promise<ArtistProfileSyncItem[]> {
  const { data, error } = await supabase.auth.getSession();
  if (error || !data.session?.user) throw new Error("No hay sesión");
  const userId = data.session.user.id;

  let local = await loadArtistProfiles();
  const pendingLocal = local.filter((p) => safeBool((p as any).pendingSync));

  // ---- PUSH ----
  if (pendingLocal.length > 0) {
    const payload = pendingLocal.map((p) => profileToRow(userId, p));

    const { error: upErr } = await supabase
      .from("artist_profiles")
      .upsert(payload, { onConflict: "user_id,artist_key" });

    if (upErr) {
      console.log("[syncArtistProfiles] PUSH error:", upErr);
      throw upErr;
    }

    const nextLocal = local.map((p) => {
      if (!safeBool((p as any).pendingSync)) return p;
      return normalizeArtistProfile({
        ...p,
        pendingSync: false,
        updatedAt: new Date().toISOString(),
      });
    });

    await saveArtistProfiles(nextLocal);
    local = nextLocal;
  }

  // ---- PULL ----
  const lastPullRaw =
    (await AsyncStorage.getItem(KEY_ARTIST_PROFILES_LAST_PULL)) || "1970-01-01T00:00:00.000Z";

  const backoffMs = 2000;
  const lastPull = new Date(new Date(lastPullRaw).getTime() - backoffMs).toISOString();

  const { data: rows, error: pullErr } = (await withTimeout(
    supabase
      .from("artist_profiles")
      .select("artist_key, display_name, note, advance_total, updated_at, deleted_at")
      .eq("user_id", userId)
      .gte("updated_at", lastPull)
      .order("updated_at", { ascending: true }),
    PULL_TIMEOUT_MS
  )) as any;

  if (pullErr) {
    console.log("[syncArtistProfiles] PULL error:", pullErr);
    return local;
  }

  const map = new Map<string, ArtistProfileSyncItem>();
  for (const p of local) map.set(p.artistKey, p);

  const toMs = (iso?: string | null) => (iso ? new Date(iso).getTime() : 0);
  let maxServerUpdatedAt = lastPullRaw;

  for (const r of rows ?? []) {
    const key = normalizeArtistLocalId(String(r.artist_key ?? ""));
    if (!key) continue;

    const rUpdated = String(r.updated_at ?? "");
    if (rUpdated && toMs(rUpdated) > toMs(maxServerUpdatedAt)) maxServerUpdatedAt = rUpdated;

    const existing = map.get(key);
    if (existing && safeBool((existing as any).pendingSync)) continue;

    map.set(key, rowToProfile({ ...r, artist_key: key }));
  }

  const merged = Array.from(map.values());
await saveArtistProfiles(merged);

if (rows && rows.length > 0) {
  await AsyncStorage.setItem(KEY_ARTIST_PROFILES_LAST_PULL, maxServerUpdatedAt);
}

return merged;
}

// ---------------- Supabase Sync (Wallet -> public.wallet_movements) ----------------
// -----// ---------------- Supabase Sync (Wallet -> public.wallet_movements) ----------------
// ✅ Ajustado a TU esquema real:
// wallet_movements columnas:
// id(uuid), user_id(uuid), artist_id(uuid), project_id(uuid), amount(numeric), kind(text), note(text),
// created_at(timestamptz), local_id(text), updated_at(timestamptz)
// ❌ No existen: currency, category, date_label, deleted_at, artist(text)

const WALLET_SIN_ARTISTA_LOCAL_ID = "sin_artista";

// 1) Asegura que exista un artista "sin_artista" en public.artists y regresa su UUID
async function ensureSinArtistaArtistUuid(userId: string): Promise<string> {
  // intenta leer
  const { data: existing, error: selErr } = await supabase
    .from("artists")
    .select("id, local_id")
    .eq("user_id", userId)
    .eq("local_id", WALLET_SIN_ARTISTA_LOCAL_ID)
    .maybeSingle();

  if (selErr) console.log("[syncWallet] ensure sin_artista select error:", selErr);

  if (existing?.id) return String((existing as any).id);

  // crea (ajusta columnas si tu tabla artists usa nombres distintos)
  const nowIso = new Date().toISOString();
const { data: ins, error: insErr } = await supabase
  .from("artists")
  .insert({
    user_id: userId,
    local_id: WALLET_SIN_ARTISTA_LOCAL_ID,
    name: "Sin artista",        // ✅ existe
    global_note: null,          // ✅ existe (opcional)
    updated_at: nowIso,         // ✅ existe
   // deleted_at: null,           // ✅ existe (opcional)
  } as any)
  .select("id")
  .single();


  if (insErr) {
    console.log("[syncWallet] ensure sin_artista insert error:", insErr);
    // último recurso: vuelve a consultar por si otro request lo creó
    const { data: again } = await supabase
      .from("artists")
      .select("id")
      .eq("user_id", userId)
      .eq("local_id", WALLET_SIN_ARTISTA_LOCAL_ID)
      .maybeSingle();
    if (again?.id) return String((again as any).id);
    throw insErr;
  }

  return String((ins as any).id);
}

// 2) Asegura que existan en public.artists TODOS los artist local_id (slugs) que vas a sync
async function ensureArtistsForWalletPayload(params: {
  userId: string;
  artistLocalIds: string[];
}) {
  const { userId } = params;

  const artistLocalIds = Array.from(
    new Set(
      (params.artistLocalIds || [])
        .map((x) => normalizeArtistLocalId(String(x)))
        .filter(Boolean)
    )
  );

  // Siempre incluye sin_artista
  if (!artistLocalIds.includes(WALLET_SIN_ARTISTA_LOCAL_ID)) {
    artistLocalIds.push(WALLET_SIN_ARTISTA_LOCAL_ID);
  }

  if (artistLocalIds.length === 0) return;

  const nowIso = new Date().toISOString();

  const payload = artistLocalIds.map((localId) => ({
    user_id: userId,
    local_id: localId,
    name: localId === WALLET_SIN_ARTISTA_LOCAL_ID ? "Sin artista" : localId, // ✅
    updated_at: nowIso,
   // deleted_at: null,
  }));

  const { error } = await supabase
    .from("artists")
    .upsert(payload as any, { onConflict: "user_id,local_id" });

  if (error) console.log("[syncWallet] ensureArtistsForWalletPayload upsert error:", error);
}


// Helpers: mapas local_id(text) -> uuid (projects/artists) y uuid -> local_id
async function buildWalletCloudMaps(params: {
  userId: string;
  localMoves: WalletMovementSyncItem[];
}) {
  const { userId, localMoves } = params;

  // En local, m.projectId = local_id del project (texto)
  const projectLocalIds = Array.from(
    new Set(
      (localMoves || [])
        .map((m) => String(m.projectId || "").trim())
        .filter(Boolean)
    )
  );

  // En local, m.artist = artistKey/slug (texto)
  const artistLocalIds = Array.from(
    new Set(
      (localMoves || [])
        .map((m) => normalizeArtistLocalId(String(m.artist || "").trim()))
        .filter(Boolean)
    )
  );

  // ✅ Asegura artistas antes de mapear (para que NO falle NOT NULL)
  await ensureArtistsForWalletPayload({ userId, artistLocalIds });
  // ✅ Asegura sin_artista y obten su UUID (también sirve como fallback)
  const sinArtistaUuid = await ensureSinArtistaArtistUuid(userId);

  const projectLocalToUuid = new Map<string, string>();
  const projectUuidToLocal = new Map<string, string>();

  if (projectLocalIds.length > 0) {
    const { data, error } = await supabase
      .from("projects")
      .select("id, local_id")
      .eq("user_id", userId)
      .in("local_id", projectLocalIds);

    if (error) console.log("[syncWallet] map projects error:", error);

    for (const r of data || []) {
      const uuid = String((r as any).id);
      const localId = String((r as any).local_id);
      projectLocalToUuid.set(localId, uuid);
      projectUuidToLocal.set(uuid, localId);
    }
  }

  const artistLocalToUuid = new Map<string, string>();
  const artistUuidToLocal = new Map<string, string>();

  // ✅ Incluye sin_artista en el mapeo
  const artistLocalIdsWithSin = Array.from(
    new Set([WALLET_SIN_ARTISTA_LOCAL_ID, ...(artistLocalIds || [])].filter(Boolean))
  );

  if (artistLocalIdsWithSin.length > 0) {
    const { data, error } = await supabase
      .from("artists")
      .select("id, local_id")
      .eq("user_id", userId)
      .in("local_id", artistLocalIdsWithSin);

    if (error) console.log("[syncWallet] map artists error:", error);

    for (const r of data || []) {
      const uuid = String((r as any).id);
      const localId = String((r as any).local_id);
      artistLocalToUuid.set(localId, uuid);
      artistUuidToLocal.set(uuid, localId);
    }
  }

  // si por algo no se mapeara sin_artista, lo forzamos
  if (!artistLocalToUuid.get(WALLET_SIN_ARTISTA_LOCAL_ID)) {
    artistLocalToUuid.set(WALLET_SIN_ARTISTA_LOCAL_ID, sinArtistaUuid);
    artistUuidToLocal.set(sinArtistaUuid, WALLET_SIN_ARTISTA_LOCAL_ID);
  }

  return {
    projectLocalToUuid,
    projectUuidToLocal,
    artistLocalToUuid,
    artistUuidToLocal,
    sinArtistaUuid,
  };
}

function walletToRowWithMaps(
  userId: string,
  m: WalletMovementSyncItem,
  maps: Awaited<ReturnType<typeof buildWalletCloudMaps>>
) {
  const updatedMs = m.localUpdatedAt ?? Date.now();

  const projectLocal = String(m.projectId || "").trim(); // local_id (texto)
  const projectUuid = projectLocal ? maps.projectLocalToUuid.get(projectLocal) : null;

  const artistLocal = normalizeArtistLocalId(String(m.artist || "").trim()); // local_id (texto)
  const artistUuid =
    (artistLocal ? maps.artistLocalToUuid.get(artistLocal) : null) ??
    maps.artistLocalToUuid.get(WALLET_SIN_ARTISTA_LOCAL_ID) ??
    maps.sinArtistaUuid; // ✅ JAMÁS null

  // kind: mantén tu lógica (IN/OUT/ANTICIPO/APLICADO/etc.)
  const kind = String(m.kind ?? "IN").toUpperCase();

  return {
    user_id: userId,
    local_id: String(m.id), // ✅ tu ID local (texto)
    project_id: projectUuid ?? null, // UUID (puede ser null si tu schema lo permite)
    artist_id: artistUuid,           // ✅ NOT NULL garantizado
    amount: Number(m.amount ?? 0) || 0,
    kind,
    note: m.note ?? null,
    updated_at: new Date(updatedMs).toISOString(),
    // created_at: NO lo mandes (default DB)
    // id: NO lo mandes (uuid DB)
  };
}

function rowToWalletWithMaps(
  r: any,
  mapsPull: {
    projectUuidToLocal: Map<string, string>;
    artistUuidToLocal: Map<string, string>;
  }
): WalletMovementSyncItem {
  const projectUuid = r?.project_id ? String(r.project_id) : "";
  const projectLocal = projectUuid ? mapsPull.projectUuidToLocal.get(projectUuid) : undefined;

  const artistUuid = r?.artist_id ? String(r.artist_id) : "";
  const artistLocal = artistUuid ? mapsPull.artistUuidToLocal.get(artistUuid) : undefined;

  const createdAtMs = r?.created_at ? new Date(r.created_at).getTime() : Date.now();
  const dateLabel = (() => {
    const d = new Date(createdAtMs);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  })();

  return normalizeWalletMovement({
    id: String(r?.local_id ?? uid()),            // regresa a tu id local
    createdAt: createdAtMs,
    dateLabel,                                   // local derivado (no existe en cloud)
    kind: String(r?.kind ?? "IN"),
    amount: typeof r?.amount === "number" ? r.amount : Number(r?.amount ?? 0),
    currency: "MXN",                              // local fijo (cloud no tiene)
    projectId: projectLocal ?? undefined,         // local_id del project
    artist: artistLocal ?? WALLET_SIN_ARTISTA_LOCAL_ID, // slug del artist (fallback)
    note: r?.note ?? undefined,
    category: null,                               // cloud no tiene
    pendingSync: false,
    localUpdatedAt: r?.updated_at ? new Date(r.updated_at).getTime() : Date.now(),
    updatedAt: toIsoOrNull(r?.updated_at),
    deletedAt: null,                              // cloud no soporta deleted_at
  });
}

export async function syncWallet(): Promise<WalletMovementSyncItem[]> {
  const { data, error } = await supabase.auth.getSession();
  if (error || !data.session?.user) throw new Error("No hay sesión");
  const userId = data.session.user.id;

  let local = await loadWallet();

  // Solo lo que tenga pendingSync
  const pendingLocal = local.filter((m) => safeBool((m as any).pendingSync));

  // ✅ PUSH
  if (pendingLocal.length > 0) {
    // Si local trae deletedAt, en cloud NO existe deleted_at:
    // -> hacemos DELETE real en cloud por (user_id, local_id)
    const toDelete = pendingLocal
      .filter((m) => !!m.deletedAt)
      .map((m) => String(m.id))
      .filter(Boolean);

    const toUpsert = pendingLocal.filter((m) => !m.deletedAt);

    // 1) DELETE batch
    if (toDelete.length > 0) {
      const { error: delErr } = await supabase
        .from("wallet_movements")
        .delete()
        .eq("user_id", userId)
        .in("local_id", toDelete);

      if (delErr) {
        console.log("[syncWallet] DELETE error:", delErr);
        throw delErr;
      }
    }

    // 2) UPSERT batch (solo columnas reales)
    if (toUpsert.length > 0) {
      const maps = await buildWalletCloudMaps({ userId, localMoves: toUpsert });
      const payload = toUpsert.map((m) => walletToRowWithMaps(userId, m, maps));

      const { error: upErr } = await supabase
        .from("wallet_movements")
        .upsert(payload as any, { onConflict: "user_id,local_id" });

      if (upErr) {
        console.log("[syncWallet] UPSERT error:", upErr);
        throw upErr;
      }
    }

    // 3) Marca pendingSync false en todos los que se procesaron (delete + upsert)
    const nowIso = new Date().toISOString();
    const processedIds = new Set(pendingLocal.map((m) => String(m.id)));

    const nextLocal = local.map((m) => {
      if (!processedIds.has(String(m.id))) return m;
      return normalizeWalletMovement({
        ...m,
        pendingSync: false,
        updatedAt: nowIso,
      });
    });

    await saveWallet(nextLocal);
    local = nextLocal;
  }

  // ✅ PULL
  const lastPullRaw =
    (await AsyncStorage.getItem(KEY_WALLET_LAST_PULL)) || "1970-01-01T00:00:00.000Z";

  const backoffMs = 2000;
  const lastPull = new Date(new Date(lastPullRaw).getTime() - backoffMs).toISOString();

  const { data: rows, error: pullErr } = (await withTimeout(
    supabase
      .from("wallet_movements")
      .select("id, local_id, project_id, artist_id, amount, kind, note, created_at, updated_at")
      .eq("user_id", userId)
      .gte("updated_at", lastPull)
      .order("updated_at", { ascending: true }),
    PULL_TIMEOUT_MS
  )) as any;

  if (pullErr) {
    console.log("[syncWallet] PULL error:", pullErr);
    return local;
  }

  // Reverse maps uuid -> local_id (para project_id/artist_id)
  const projectUuids = Array.from(
    new Set((rows || []).map((r: any) => String(r?.project_id || "")).filter(Boolean))
  );
  const artistUuids = Array.from(
    new Set((rows || []).map((r: any) => String(r?.artist_id || "")).filter(Boolean))
  );

  const projectUuidToLocal = new Map<string, string>();
  const artistUuidToLocal = new Map<string, string>();

  if (projectUuids.length > 0) {
    const { data: pRows, error: pErr } = await supabase
      .from("projects")
      .select("id, local_id")
      .eq("user_id", userId)
      .in("id", projectUuids);

    if (pErr) console.log("[syncWallet] PULL map projects error:", pErr);
    for (const r of pRows || []) {
      projectUuidToLocal.set(String((r as any).id), String((r as any).local_id));
    }
  }

  if (artistUuids.length > 0) {
    const { data: aRows, error: aErr } = await supabase
      .from("artists")
      .select("id, local_id")
      .eq("user_id", userId)
      .in("id", artistUuids);

    if (aErr) console.log("[syncWallet] PULL map artists error:", aErr);
    for (const r of aRows || []) {
      artistUuidToLocal.set(String((r as any).id), String((r as any).local_id));
    }
  }

  const mapsPull = { projectUuidToLocal, artistUuidToLocal };

  const map = new Map<string, WalletMovementSyncItem>();
  for (const m of local) map.set(m.id, m);

  const toMs = (iso?: string | null) => (iso ? new Date(iso).getTime() : 0);
  let maxServerUpdatedAt = lastPullRaw;

  for (const r of rows ?? []) {
    const localId = String(r.local_id ?? "");
    if (!localId) continue;

    const rUpdated = String(r.updated_at ?? "");
    if (rUpdated && toMs(rUpdated) > toMs(maxServerUpdatedAt)) maxServerUpdatedAt = rUpdated;

    const existing = map.get(localId);
    // si local está pendiente, no lo pisamos
    if (existing && safeBool((existing as any).pendingSync)) continue;

    map.set(localId, rowToWalletWithMaps(r, mapsPull));
  }

  const merged = Array.from(map.values());
  await saveWallet(merged);

  if (rows && rows.length > 0) {
    await AsyncStorage.setItem(KEY_WALLET_LAST_PULL, maxServerUpdatedAt);
  }

  return merged;
}

// ---------------- Garbage Collector ----------------

export async function gcSoftDeleted({ days = 14 }: { days?: number } = {}) {
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;

  const tracks = await loadTracks();
  const tracksNext = tracks.filter((t) => {
    if (safeBool((t as any).pendingSync)) return true;
    if (!t.deletedAt) return true;
    return new Date(t.deletedAt).getTime() > cutoff;
  });
  if (tracksNext.length !== tracks.length) await saveTracks(tracksNext);

  const agenda = await loadAgenda();
  const agendaNext = agenda.filter((a) => {
    if (safeBool((a as any).pendingSync)) return true;
    if (!a.deletedAt) return true;
    return new Date(a.deletedAt).getTime() > cutoff;
  });
  if (agendaNext.length !== agenda.length) await saveAgenda(agendaNext);

  const pendings = await loadPendings();
  const pendingsNext = pendings.filter((p) => {
    if (safeBool((p as any).pendingSync)) return true;
    if (!p.deletedAt) return true;
    return new Date(p.deletedAt).getTime() > cutoff;
  });
  if (pendingsNext.length !== pendings.length) await savePendings(pendingsNext);

  const wallet = await loadWallet();
  const walletNext = wallet.filter((m) => {
    if (safeBool((m as any).pendingSync)) return true;
    if (!m.deletedAt) return true;
    return new Date(m.deletedAt).getTime() > cutoff;
  });
  if (walletNext.length !== wallet.length) await saveWallet(walletNext);

  const profiles = await loadArtistProfiles();
  const profilesNext = profiles.filter((p) => {
    if (safeBool((p as any).pendingSync)) return true;
    if (!p.deletedAt) return true;
    return new Date(p.deletedAt).getTime() > cutoff;
  });
  if (profilesNext.length !== profiles.length) await saveArtistProfiles(profilesNext);

  const projects = await loadProjects();
  const projectsNext = projects.filter((p: any) => {
    if (safeBool(p?.pendingSync)) return true;
    if (!p?.deletedAt) return true;
    return new Date(p.deletedAt).getTime() > cutoff;
  });
  if (projectsNext.length !== (projects as any[]).length) await saveProjects(projectsNext as any);

  return {
    tracksCleaned: tracks.length - tracksNext.length,
    agendaCleaned: agenda.length - agendaNext.length,
    pendingsCleaned: pendings.length - pendingsNext.length,
    walletCleaned: wallet.length - walletNext.length,
    artistProfilesCleaned: profiles.length - profilesNext.length,
    projectsCleaned: (projects as any[]).length - (projectsNext as any[]).length,
  };
}

// ---------------- Sync All ----------------

export async function syncAll({ gcDays = 21 }: { gcDays?: number } = {}): Promise<SyncAllResult> {
  const cleaned = await gcSoftDeleted({ days: gcDays }).catch(() => ({
    tracksCleaned: 0,
    agendaCleaned: 0,
    pendingsCleaned: 0,
    walletCleaned: 0,
    artistProfilesCleaned: 0,
    projectsCleaned: 0,
  }));

  const errors: SyncAllResult["errors"] = {};

  let tracks = await loadTracks();
  let agenda = await loadAgenda();
  let pendings = await loadPendings();
  let projects = await loadProjects();
  let wallet = await loadWallet();
  let artistProfiles = await loadArtistProfiles();

  // ✅ 1) primero perfiles (para que exista la llave del FK)
  try {
    artistProfiles = await syncArtistProfiles();
  } catch (e: any) {
    errors.artistProfiles = String(e?.message || e || "Error");
    artistProfiles = await loadArtistProfiles();
  }

  // ✅ 2) luego projects
  try {
    projects = await syncProjects();
  } catch (e: any) {
    errors.projects = String(e?.message || e || "Error");
    projects = await loadProjects();
  }

  // lo demás como lo traías
// try { wallet = await syncWallet(); } 
// catch (e:any){ errors.wallet = String(e?.message||e||"Error"); wallet = await loadWallet(); }

  try { tracks = await syncTracks(); } catch (e:any){ errors.tracks = String(e?.message||e||"Error"); tracks = await loadTracks(); }
  try { agenda = await syncAgenda(); } catch (e:any){ errors.agenda = String(e?.message||e||"Error"); agenda = await loadAgenda(); }
  try { pendings = await syncPendings(); } catch (e:any){ errors.pendings = String(e?.message||e||"Error"); pendings = await loadPendings(); }

  return { tracks, agenda, pendings, projects, wallet, artistProfiles, cleaned, errors };
}