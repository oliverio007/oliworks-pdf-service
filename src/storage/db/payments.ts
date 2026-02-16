// src/storage/db/payments.ts

import { supabase } from "../../lib/supabase";

/**
 * Inserta un pago a un proyecto.
 * Esta función sigue siendo válida y es parte de la fuente real de datos
 * usada por `projectsCosts`.
 */
export async function createProjectPayment(params: {
  project_id: string;
  amount: number;
}) {
  const { error } = await supabase
    .from("project_payments")
    .insert({
      project_id: params.project_id,
      amount: params.amount,
    });

  if (error) {
    throw error;
  }

  return { ok: true };
}
