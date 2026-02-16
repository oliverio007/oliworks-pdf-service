/* =========================================
   PROJECT MAPPER
   Convierte entre:
   - Project (camelCase - APP)
   - DBProject (snake_case - Supabase)
========================================= */

import type { Project } from "../types/project";

/* =========================================
   DB MODEL (snake_case)
   Solo usado internamente en services/db
========================================= */

export type DBProject = {
  id: string;
  local_id: string;
  user_id: string;

  title: string;
  status: string;
  progress: number;

  artist_local_id: string | null;

  total_cost: number | null;

  paid_in_full?: boolean | null;
  paid_in_full_at?: string | null;

  updated_at: string;
  deleted_at?: string | null;

  data?: any;
};

/* =========================================
   DB → APP (snake → camel)
========================================= */

export function mapDbToProject(db: DBProject): Project {
  return {
    id: db.local_id,
    project_id: db.id,

    title: db.title,
    status: db.status as any,
    progress: db.progress ?? 0,

    artistLocalId: db.artist_local_id ?? null,

    totalCost:
      typeof db.total_cost === "number"
        ? db.total_cost
        : undefined,

    payment: {
      cost:
        typeof db.total_cost === "number"
          ? db.total_cost
          : undefined,

      paidInFull: db.paid_in_full ?? undefined,
      paidInFullAt: db.paid_in_full_at ?? null,
    },

    serverUpdatedAt: db.updated_at,
    deletedAt: db.deleted_at ?? null,
  };
}

/* =========================================
   APP → DB (camel → snake)
   ⚠ Solo envía campos definidos
========================================= */

export function mapProjectToDb(p: Project, userId: string): Partial<DBProject> {
  const row: Partial<DBProject> = {
    user_id: userId,
    local_id: p.id,

    title: p.title,
    status: p.status,
    progress: p.progress ?? 0,

    artist_local_id: p.artistLocalId ?? null,

    updated_at: new Date().toISOString(),
  };

  // 🔥 SOLO enviar total_cost si existe
  if (typeof p.totalCost === "number") {
    row.total_cost = p.totalCost;
  }

  if (typeof p.payment?.paidInFull === "boolean") {
    row.paid_in_full = p.payment.paidInFull;
    row.paid_in_full_at = p.payment.paidInFull
      ? p.payment.paidInFullAt ?? new Date().toISOString()
      : null;
  }

  return row;
}
