// src/api/wallet.ts
/**
 * Fuente de verdad financiera de un proyecto
 * (esto es lo que debe consumir la app)
 */
// src/api/wallet.ts
import { supabase } from "../lib/supabase";

export async function projectFinancials(projectId: string) {
  if (!projectId) {
    throw new Error("projectId requerido");
  }

  const { data, error } = await supabase
    .from("project_billing_summary")
    .select("project_id,total_cost,applied,remaining")
    .eq("project_id", projectId)
    .maybeSingle(); // 👈 importante para que no truene si aún no hay fila

  if (error) {
    throw error;
  }

  // 🔁 Fallback cuando la vista aún no tiene fila
  if (!data) {
    return {
      project_id: projectId,
      total_cost: 0,
      applied: 0,
      remaining: 0,
    };
  }

  return {
    project_id: data.project_id,
    total_cost: Number(data.total_cost) || 0,
    applied: Number(data.applied) || 0,
    remaining: Number(data.remaining) || 0,
  };
}

