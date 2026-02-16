// supabase/functions/production-action/index.ts
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

// Dominio (tu carpeta domain copiada a _shared)
import { parseProductionPhrase } from "../_shared/domain/parseProductionPhrase.ts";
import { applyProductionAction } from "../_shared/domain/applyProductionAction.ts";

// =====================================================
// CORS + JSON helper
// =====================================================
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-oliworks-action-key, x-oliworks-user-id",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", ...corsHeaders },
  });
}

// =====================================================
// Action Key
// =====================================================
const ACTION_KEY_HEADER = "x-oliworks-action-key";

function requireActionKey(req: Request) {
  const provided = req.headers.get(ACTION_KEY_HEADER) || "";
  const expected = Deno.env.get("OLIWORKS_ACTION_KEY") || "";
  if (!expected) return { ok: false, error: "Missing env OLIWORKS_ACTION_KEY" };
  if (!provided || provided !== expected) return { ok: false, error: "Invalid Action Key" };
  return { ok: true };
}

// =====================================================
// Checklist fijo (incluye GUIAS_QUANTIZ + ARREGLOS)
// =====================================================
const CHECKLIST_ORDER = [
  "GUIAS_QUANTIZ",
  "ARREGLOS",
  "MUSICOS",
  "EDICION",
  "AFINACION",
  "MIX",
  "MASTER",
] as const;

type ChecklistKey = (typeof CHECKLIST_ORDER)[number];

function ensureChecklist(finalChecklist: Record<string, any>) {
  // Garantiza llaves y booleanos
  const out: Record<ChecklistKey, boolean> = {} as any;
  for (const k of CHECKLIST_ORDER) {
    out[k] = finalChecklist?.[k] === true;
  }
  return out;
}

function computeProgressWithOrder(data: any): number {
  const checklist = data?.checklist || {};
  const total = CHECKLIST_ORDER.length;
  if (total === 0) return 0;

  let done = 0;
  for (const k of CHECKLIST_ORDER) {
    if (checklist[k] === true) done++;
  }
  return Math.round((done / total) * 100);
}

function computeStatusWithOrder(data: any): string {
  const checklist = data?.checklist || {};
  const allDone = CHECKLIST_ORDER.every((k) => checklist[k] === true);
  return allDone ? "LISTO" : "EN_PROCESO";
}

// =====================================================
// Types
// =====================================================
type ProductionActionRequest = {
  projectId: string;
  phrase?: string;     // "tuba grabada", "falta afinación..."
  action?: any;        // opcional: acción ya estructurada
  simulate?: boolean;  // true = no guarda
};

// =====================================================
// Server
// =====================================================
serve(async (req) => {
  // CORS preflight
  if (req.method === "OPTIONS") return json({ ok: true }, 200);
  if (req.method !== "POST") return json({ ok: false, error: "Use POST" }, 405);

  // 🔐 Action Key (NO dependemos de Authorization)
  const keyCheck = requireActionKey(req);
  if (!keyCheck.ok) return json({ ok: false, error: keyCheck.error }, 401);

  try {
    // Env vars
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !serviceRoleKey) {
      return json(
        { ok: false, error: "Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY" },
        500,
      );
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    });

    const body: ProductionActionRequest = await req.json().catch(() => ({} as any));

    const projectId = String(body?.projectId || "").trim();
    const phrase = body?.phrase ? String(body.phrase).trim() : "";
    const simulate = Boolean(body?.simulate);
    const providedAction = body?.action;

    if (!projectId) return json({ ok: false, error: "projectId es requerido" }, 400);
    if (!phrase && !providedAction) {
      return json({ ok: false, error: "Se requiere phrase o action" }, 400);
    }

    // 1) Cargar proyecto
    const { data: row, error: loadErr } = await supabase
      .from("projects")
      .select("id, data, progress, status")
      .eq("id", projectId)
      .maybeSingle();

    if (loadErr) return json({ ok: false, error: loadErr.message }, 500);
    if (!row) return json({ ok: false, error: "Proyecto no encontrado" }, 404);

    const beforeData = row.data ?? {};
    const beforeChecklist = (beforeData.checklist ?? {}) as Record<string, any>;

    // 2) Parsear action si viene phrase
    const action = providedAction ?? parseProductionPhrase(phrase);
    if (!action) {
      return json({ ok: false, error: "No pude interpretar la frase" }, 400);
    }

    // 3) Aplicar dominio
    const afterDataRaw = applyProductionAction(beforeData, action) ?? {};
    const afterChecklistRaw = (afterDataRaw.checklist ?? {}) as Record<string, any>;

    // 4) 🔥 Mantener GUIAS_QUANTIZ + ARREGLOS SIEMPRE:
    //    - Merge (antes + después) y luego forzamos el orden fijo
    const mergedChecklistAny = {
      ...beforeChecklist,   // conserva GUIAS_QUANTIZ/ARREGLOS aunque el domain no los tenga tipados
      ...afterChecklistRaw, // aplica cambios del dominio
    };

    const finalChecklist = ensureChecklist(mergedChecklistAny);

    const afterData = {
      ...afterDataRaw,
      checklist: finalChecklist,
    };

    // 5) Recalcular con ORDEN FIJO (incluye GUIAS_QUANTIZ/ARREGLOS)
    afterData.progress = computeProgressWithOrder(afterData);
    afterData.status = computeStatusWithOrder(afterData);

    const nextProgress = Number(afterData.progress ?? row.progress ?? 0);
    const nextStatus = String(afterData.status ?? row.status ?? "EN_PROCESO");

    // 6) Simulación (no guarda)
    if (simulate) {
      return json({
        ok: true,
        simulate: true,
        projectId,
        phrase: phrase || null,
        action,
        progress: nextProgress,
        status: nextStatus,
        checklist: finalChecklist,
        data: afterData,
      });
    }

    // 7) Guardar
    const { error: saveErr } = await supabase
      .from("projects")
      .update({
        data: afterData,
        progress: nextProgress,
        status: nextStatus,
        updated_at: new Date().toISOString(),
      })
      .eq("id", projectId);

    if (saveErr) {
      return json({ ok: false, error: "Error al guardar proyecto", detail: saveErr.message }, 500);
    }

    // 8) Respuesta
    return json({
      ok: true,
      simulate: false,
      projectId,
      phrase: phrase || null,
      action,
      progress: nextProgress,
      status: nextStatus,
      checklist: finalChecklist,
      message_es: `Listo. Progreso: ${row.progress ?? 0}% → ${nextProgress}%. Estado: ${nextStatus}.`,
    });
  } catch (e: any) {
    return json({ ok: false, error: e?.message ?? String(e) }, 500);
  }
});
