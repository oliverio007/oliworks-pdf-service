// src/api/projectSync.ts

// src/api/projectSync.ts

import { supabase } from "../lib/supabase";
import type { Project } from "../types/project";

import { loadProjects, saveProjects } from "../storage/db";
import type { ProjectSyncItem } from "../storage/db";

import {
  mapProjectToDb,
  mapDbToProject,
} from "../services/projectMapper";

/**
 * Helper por compatibilidad.
 * Recomendado: usa src/storage/db.ts -> syncProjects()
 */

function stripProjectForJson(p: any) {
  const { pendingSync, localUpdatedAt, serverUpdatedAt, deletedAt, ...rest } = p || {};
  return rest;
}

/** Convierte valores tipo date a ISO; si no puede, regresa null */
function toIsoOrNull(v: any): string | null {
  if (!v) return null;

  // string ISO / date-string
  if (typeof v === "string") {
    const ms = Date.parse(v);
    if (!Number.isFinite(ms)) return null;
    return new Date(ms).toISOString();
  }

  // number epoch ms
  if (typeof v === "number" && Number.isFinite(v)) {
    return new Date(v).toISOString();
  }

  // Date object
  if (v instanceof Date) {
    const ms = v.getTime();
    if (!Number.isFinite(ms)) return null;
    return v.toISOString();
  }

  return null;
}



/* =========================================
   SYNC PROJECT (SERVER-FIRST)
========================================= */

export async function syncProjectToSupabase(
  p: Project | ProjectSyncItem
): Promise<void> {
  const { data, error: sessionError } =
    await supabase.auth.getSession();

  if (sessionError) {
    console.log(
      "[projectSync] getSession error:",
      sessionError.message
    );
    throw new Error(
      "No se pudo leer la sesión de Supabase."
    );
  }

  if (!data.session?.user) {
    throw new Error(
      "No hay sesión activa en Supabase."
    );
  }

  const userId = data.session.user.id;

  /* =========================
     1️⃣ MAP APP → DB
  ========================= */

  const row = mapProjectToDb(
  p as Project,
  userId
) as any; // 👈 fuerza flexible

// 🚨 PROTEGER CAMPOS FINANCIEROS
const {
  total_cost,
  amount_paid,
  paid_in_full,
  paid_in_full_at,
  ...safeRow
} = row;






  /* =========================
     2️⃣ UPSERT
  ========================= */

 const { data: serverRow, error } =
  await supabase
    .from("projects")
.upsert(safeRow, {
      onConflict: "user_id,local_id",
    })
    .select("*")
    .single();

  if (error) {
    console.log(
      "[projectSync] upsert error:",
      error
    );
    throw error;
  }

  if (!serverRow) {
    throw new Error(
      "Supabase no devolvió fila después del upsert."
    );
  }

  /* =========================
     3️⃣ MAP DB → APP
     (SERVER ES LA VERDAD FINAL)
  ========================= */

const canonicalProject = {
  ...mapDbToProject(serverRow),
  pendingSync: false,
} as ProjectSyncItem;



  /* =========================
     4️⃣ ACTUALIZAR LOCAL
  ========================= */

const all = (await loadProjects()) as ProjectSyncItem[];

  const next: ProjectSyncItem[] = all.map((x) =>
  x.id === canonicalProject.id
    ? {
        ...x,
        ...canonicalProject,
      }
    : x
);


await saveProjects(next);


  console.log(
    "[projectSync] sync OK:",
    canonicalProject.id
  );
}

/* =========================================
   SYNC ALL PROJECTS (PUSH PENDING)
========================================= */

export async function syncAllProjects(): Promise<void> {
  const all = await loadProjects();

  const pending = all.filter(
    (p) => p.pendingSync
  );

  if (!pending.length) {
    console.log(
      "[projectSync] no pending projects"
    );
    return;
  }

  console.log(
    `[projectSync] syncing ${pending.length} projects`
  );

  for (const p of pending) {
    try {
      await syncProjectToSupabase(p);
    } catch (err) {
      console.log(
        "[projectSync] failed project:",
        p.id,
        err
      );
    }
  }
}
