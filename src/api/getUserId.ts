// src/api/TracksScreen.tsx
import { supabase } from "../lib/supabase";

/**
 * Devuelve el user.id actual (si hay sesión).
 * Útil para debug y para validar RLS en Supabase.
 */
export async function getUserId(): Promise<string> {
  const { data, error } = await supabase.auth.getSession();

  if (error) {
    console.log("[getUserId] session error:", error);
    throw error;
  }
  if (!data.session?.user?.id) {
    throw new Error("No hay sesión (user_id vacío).");
  }

  return data.session.user.id;
}
