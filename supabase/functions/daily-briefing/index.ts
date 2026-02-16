// supabase/functions/daily-briefing/index.ts
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers":
        "authorization, x-client-info, apikey, content-type",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
    },
  });
}

function todayISODateUTC() {
  // YYYY-MM-DD en UTC
  return new Date().toISOString().slice(0, 10);
}

function makeDummyBriefing(day: string) {
  return [
    `🗓️ Daily Briefing — ${day}`,
    ``,
    `1) ✅ Revisa cobros pendientes y envía 2 recordatorios.`,
    `2) 🎛️ Avanza 1 proyecto (15–30 min) en Instrumentación o Cobro.`,
    `3) 📦 Haz backup si hiciste cambios importantes hoy.`,
    ``,
    `Nota: Este briefing es DUMMY (sin IA).`,
  ].join("\n");
}

serve(async (req) => {
  // CORS preflight
  if (req.method === "OPTIONS") return json({ ok: true });
  if (req.method !== "POST") return json({ error: "Use POST" }, 405);

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");

    if (!supabaseUrl || !anonKey) {
      return json(
        { error: "Missing SUPABASE_URL / SUPABASE_ANON_KEY" },
        500
      );
    }

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return json({ error: "Missing Authorization header" }, 401);
    }

    // Cliente con JWT del usuario → RLS activo
    const supabase = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    // Validar sesión
    const { data: userData, error: userErr } =
      await supabase.auth.getUser();

    if (userErr || !userData?.user) {
      return json({ error: "No session / invalid token" }, 401);
    }

    const user = userData.user;
    const day = todayISODateUTC();

    let body: any = {};
    try {
      body = await req.json();
    } catch {
      body = {};
    }

    const force = Boolean(body?.force);

    // 1️⃣ Buscar briefing de hoy
    const { data: existing, error: selErr } = await supabase
      .from("daily_briefings")
      .select("id, day, content, updated_at")
      .eq("user_id", user.id)
      .eq("day", day)
      .maybeSingle();

    if (selErr) return json({ error: selErr.message }, 500);

    // 2️⃣ Si existe y no es force → devolver cached
    if (existing && !force) {
      return json({
        ok: true,
        cached: true,
        day: existing.day,
        content: existing.content,
        updated_at: existing.updated_at,
      });
    }

    // 3️⃣ Crear / actualizar briefing dummy
    const content = makeDummyBriefing(day);

    const { data: upserted, error: upErr } = await supabase
      .from("daily_briefings")
      .upsert(
        {
          user_id: user.id,
          day,
          content,
        },
        { onConflict: "user_id,day" }
      )
      .select("id, day, content, updated_at")
      .single();

    if (upErr) return json({ error: upErr.message }, 500);

    return json({
      ok: true,
      cached: false,
      day: upserted.day,
      content: upserted.content,
      updated_at: upserted.updated_at,
    });
  } catch (e: any) {
    return json({ error: e?.message ?? String(e) }, 500);
  }
});
