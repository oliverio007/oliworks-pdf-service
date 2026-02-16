// src/api/dailyBriefing.ts
import { supabase } from "../lib/supabase";

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.warn(
    "[DailyBriefing] Faltan variables de entorno EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY"
  );
}

export async function getDailyBriefing() {
  // ⬇️ Obtenemos sesión y usuario SOLO para sacar id y email
  const { data: sessionData, error: sessionError } =
    await supabase.auth.getSession();

  if (sessionError || !sessionData.session) {
    console.log("NO SESSION", sessionError);
    throw new Error("No hay sesión");
  }

  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError) {
    console.log("GET USER ERROR", userError);
  }

  const userId = userData.user?.id ?? null;
  const email = userData.user?.email ?? null;

  // ⬇️ YA NO usamos el access_token como Authorization
  // usamos el ANON, que SIEMPRE es un JWT válido para el proyecto
  const url = `${SUPABASE_URL}/functions/v1/daily-briefing`;
  console.log("CALLING DAILY BRIEFING:", url);

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`, // 👈 ANON como JWT
      apikey: SUPABASE_ANON_KEY,                    // 👈 igual aquí
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      source: "oliworks-app",
      userId,
      email,
    }),
  });

  const text = await res.text();
  console.log("DAILY BRIEFING HTTP STATUS:", res.status);
  console.log("DAILY BRIEFING RAW BODY:", text);

  if (!res.ok) {
    throw new Error(`Daily briefing error ${res.status}: ${text}`);
  }

  return JSON.parse(text);
}

