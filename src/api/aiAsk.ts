// src/api/aiAsk.ts
import { supabase } from "../lib/supabase";

export async function aiAsk(question: string) {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;

  const token = data.session?.access_token;
  if (!token) throw new Error("Sin sesión");

  const anon = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || "";
  const base =
    process.env.EXPO_PUBLIC_SUPABASE_URL ??
    "https://aegvmikadhlhhknzwidu.supabase.co";

  const res = await fetch(`${base}/functions/v1/ai-ask`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      apikey: anon,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ question }),
  });

  const text = await res.text();
  let payload: any = text;
  try { payload = JSON.parse(text); } catch {}

  if (!res.ok) {
    throw new Error(payload?.error ?? payload?.detail?.message ?? text);
  }
  return payload; // { ok, answer, user_id }
}
