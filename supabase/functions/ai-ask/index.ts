import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";


function json(res: any, status = 200) {
  return new Response(JSON.stringify(res), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers":
        "authorization, x-client-info, apikey, content-type",
      "Access-Control-Allow-Methods": "POST,OPTIONS",
    },
  });
}

function detectTemplateIntent(text: string) {
  const q = text.toLowerCase();

  const wantsTemplate =
    /template|instrumentos|músicos|aplica|ponle|reinicia/.test(q);

  const isGrupo = /grupo/.test(q);
  const isBanda = /banda/.test(q);

  let instrumentation_type: "GRUPO" | "BANDA" | null = null;
  if (isGrupo) instrumentation_type = "GRUPO";
  if (isBanda) instrumentation_type = "BANDA";

  return { wantsTemplate, instrumentation_type };
}

function extractProjectName(text: string) {
  // Ej: "ponle el template de grupo a La Rusa"
  const m = text.match(/a\s+["']?(.+?)["']?$/i);
  return m ? m[1].trim() : null;
}

serve(async (req) => {
  try {
    if (req.method === "OPTIONS") return json({ ok: true });
    if (req.method !== "POST")
      return json({ ok: false, error: "Use POST" }, 405);

    const auth = req.headers.get("authorization");
    if (!auth) return json({ ok: false, error: "Unauthorized" }, 401);

    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: auth } } }
    );

    const { data: userData } = await sb.auth.getUser();
    if (!userData?.user)
      return json({ ok: false, error: "Unauthorized" }, 401);

    const body = await req.json();
    const question = String(body?.question ?? "").trim();
    if (!question)
      return json({ ok: false, error: "Missing question" }, 400);

    const intent = detectTemplateIntent(question);

    // =============================
    // 🎯 COMANDO: aplicar template
    // =============================
    if (intent.wantsTemplate && intent.instrumentation_type) {
      const projectName = extractProjectName(question);

      if (!projectName) {
        return json({
          ok: false,
          error: "No pude identificar el nombre del tema",
        });
      }

      // 1️⃣ Buscar proyecto
      const { data: projects } = await sb
        .from("projects")
        .select("id")
        .ilike("title", `%${projectName}%`)
        .eq("user_id", userData.user.id)
        .limit(1);

      const project = projects?.[0];
      if (!project) {
        return json({
          ok: false,
          error: `No encontré el tema "${projectName}"`,
        });
      }

      const project_id = project.id;

      // 2️⃣ Guardar tipo
      await sb
        .from("projects")
        .update({ instrumentation_type: intent.instrumentation_type })
        .eq("id", project_id);

      // 3️⃣ Inicializar producción (TEMPLATE REAL)
      await fetch(
        `${Deno.env.get("SUPABASE_URL")}/functions/v1/production-action`,
        {
          method: "POST",
          headers: {
            Authorization: auth,
            apikey: Deno.env.get("SUPABASE_ANON_KEY")!,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            projectId: project_id,
            actionObj: {
              type: "set_instruments",
              instruments: intent.instrumentation_type,
            },
          }),
        }
      );

      return json({
        ok: true,
        answer: `Listo. Apliqué el template de ${intent.instrumentation_type} al tema "${projectName}".`,
        project_id,
      });
    }

    // =============================
    // 🤖 Fallback simple
    // =============================
    return json({
      ok: true,
      answer:
        "Si quieres aplicar un template, di: 'ponle el template de Grupo a La Rusa'.",
    });
  } catch (e) {
    return json(
      { ok: false, error: String((e as any)?.message ?? e) },
      500
    );
  }
});
