// src/types.ts
// Tipos base OliWorks (alineados a Supabase)

// ================================
// Checklist
// ================================

export const CHECKLIST_KEYS = [
  "GUIAS_QUANTIZ",
  "ARREGLOS",
  "MUSICOS",
  "EDICION",
  "AFINACION",
  "MIX",
  "MASTER",
] as const;

export type ChecklistKey = (typeof CHECKLIST_KEYS)[number];
export type Checklist = Record<ChecklistKey, boolean>;

// ================================
// Instruments / Instrumentation
// ================================

export type InstrumentGroupType = "BANDA" | "GRUPO" | "OTROS";
export type InstrumentName = string;

// ================================
// Artist Profiles
// ================================

export type ArtistProfile = {
  id: string; // UUID (Supabase) o local
  userId?: string;

  localId: string; // artist_local_id
  displayName: string;

  createdAt?: number;
  updatedAt?: number;

  // offline-first
  pendingSync?: boolean;
  localUpdatedAt?: number;
  serverUpdatedAt?: string | null;
  deletedAt?: string | null;
};

// ================================
// Payments
// ================================

export type PaymentAdvance = {
  id: string;
  amount: number;
  createdAt: number; // Date.now()
  note?: string;
};

export type Payment = {
  cost: number;
  advances: PaymentAdvance[];
  paidInFull: boolean;
  comment?: string;
};

// Compat legacy (si aún existe código viejo)
export type PaymentInfo = {
  cost?: number | null;
  advances?: PaymentAdvance[] | null;
  paidInFull?: boolean | null;
  comment?: string | null;
};

// ================================
// Projects
// ================================

// ================================
// Draft (Paso previo a Project)
// ================================

export type Draft = {
  id: string;
  createdAt: number;
  updatedAt: number;

  artist?: string;
  title?: string;

  instrumentationType?: InstrumentGroupType;

  instruments?: InstrumentName[];

  musiciansDone?: Record<InstrumentName, boolean>;
  editionDone?: Record<InstrumentName, boolean>;
  tuningDone?: Record<InstrumentName, boolean>;

  artistLocalId?: string | null;
};


export type ProjectStatus = "EN_PROCESO" | "STANDBY" | "ARCHIVO";

export type Project = {
  id: string;

  // Identidad
  dateLabel: string; // YYYY-MM-DD
  artist: string; // nombre visible
  title: string; // tema

  // 🔥 FUENTE ÚNICA DE VERDAD
  instrumentationType: InstrumentGroupType;

  // Producción
  instruments: InstrumentName[];

  musiciansDone: Record<InstrumentName, boolean>;
  editionDone: Record<InstrumentName, boolean>;
  tuningDone: Record<InstrumentName, boolean>;

  checklist: Checklist;

  // Estado
  status: ProjectStatus;
  progress: number;

  // Pagos
  payment: Payment;
  totalCost?: number | null; // mapea a projects.total_cost

  // Metadata
  createdAt: number;
  updatedAt: number;

  note?: string;
  notes?: string;

  // Relaciones / Supabase
  artistLocalId?: string | null;

  // Offline-first
  pendingSync?: boolean;
  localUpdatedAt?: number;
  serverUpdatedAt?: string | null;
  deletedAt?: string | null;
};

// ================================
// Wallet
// ================================

export type WalletMovementType = "CREDIT" | "DEBIT" | "APPLY";

export type WalletMovement = {
  id: string;
  userId?: string;

  projectId?: string | null;
  artistLocalId?: string | null;

  type: WalletMovementType;
  amount: number;
  note?: string;
  createdAt: number;

  // offline-first
  pendingSync?: boolean;
  localUpdatedAt?: number;
  serverUpdatedAt?: string | null;
  deletedAt?: string | null;
};

// ================================
// Agenda
// ================================

export type AgendaItem = {
  id: string;
  dateLabel: string; // YYYY-MM-DD
  artist: string;
  note?: string;
};

// ================================
// Pendings
// ================================

export type PendingItem = {
  id: string;
  createdAt: number;
  text: string;
  done: boolean;
};

// ================================
// Tracks (si los usas)
// ================================

export type TrackStatus = "active" | "archived";

export type Track = {
  id: string;
  projectId: string;
  title: string;
  status: TrackStatus;
  progress: number;

  general?: any[];
  musicians?: any[];
  tuning?: any[];
  editing?: any[];

  // offline-first
  pendingSync?: boolean;
  localUpdatedAt?: number;
  updatedAt?: string | null;
  deletedAt?: string | null;
};

// ================================
// Archive
// ================================

export type ArchiveVersion = {
  id: string;
  archivedAt: number;
  version: number;
  archiveGroupId: string;
  projectSnapshot: Project;
};
