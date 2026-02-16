/* =========================================
   PROJECT — MODELO CANÓNICO APP
   (Solo camelCase en frontend)
========================================= */

export type ProjectStatus =
  | "EN_PROCESO"
  | "LISTO"
  | "ARCHIVO";

export type InstrumentationType =
  | "BANDA"
  | "GRUPO"
  | "OTROS";

/* =========================================
   PAYMENT INFO (UI-Level)
========================================= */

export type ProjectPayment = {
  cost?: number;               // Costo acordado
  paid?: number;               // Total abonado (snapshot)
  remaining?: number;          // Pendiente (snapshot)

  paidInFull?: boolean;        // Liquidado
  paidInFullAt?: string | null;
};

/* =========================================
   PROJECT MODEL (APP)
========================================= */

export type Project = {
  /* ---------- Identidad ---------- */

  id: string;                  // ID local (SQLite)
  project_id?: string | null;  // UUID en Supabase

  userId?: string;             // Opcional para debug local

  /* ---------- Metadata ---------- */

  title: string;
  status: ProjectStatus;
  progress: number;

  instrumentationType?: InstrumentationType;

  /* ---------- Artista ---------- */

  artistLocalId?: string | null;
  artistName?: string | null;

  /* ---------- Finanzas (UI-level) ---------- */

  totalCost?: number;          // SIEMPRE camelCase en app
  payment?: ProjectPayment;

  /* ---------- Sync ---------- */

  pendingSync?: boolean;

  localUpdatedAt?: number;
  serverUpdatedAt?: string | null;

  deletedAt?: string | null;
};
