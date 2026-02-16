import { parseProductionPhrase } from "../domain/parseProductionPhrase";
import { applyProductionAction } from "../domain/applyProductionAction";
import { supabase } from "../lib/supabase";

export async function productionActionHandler(req: any, res: any) {
  const { phrase, phrases, projectId, projectData, simulate } = req.body;

  if (!projectData) {
    return res.status(400).json({
      ok: false,
      error: "Falta projectData",
    });
  }

  // 🟡 Normalizamos a modo batch
  const phraseList: string[] = phrases
    ? phrases
    : phrase
    ? [phrase]
    : [];

  if (phraseList.length === 0) {
    return res.status(400).json({
      ok: false,
      error: "No hay frases para procesar",
    });
  }

  let updatedProject = projectData;
  const steps: any[] = [];

  for (const text of phraseList) {
    const action = parseProductionPhrase(text);

    if (!action) {
      steps.push({
        phrase: text,
        applied: false,
        reason: "No se entendió la frase",
      });
      continue;
    }

    updatedProject = applyProductionAction(updatedProject, action);

    steps.push({
      phrase: text,
      action,
      applied: true,
      progress: updatedProject.progress,
      status: updatedProject.status,
    });
  }

  // 🧪 SIMULACIÓN → NO guarda
  if (simulate) {
    return res.json({
      ok: true,
      mode: "batch-simulated",
      steps,
      project: updatedProject,
    });
  }

  // 💾 Persistencia real (opcional)
  if (projectId) {
    const { error } = await supabase
      .from("projects")
      .update({
        data: updatedProject,
        updated_at: new Date().toISOString(),
      })
      .eq("id", projectId);

    if (error) {
      return res.status(500).json({
        ok: false,
        error: "Error guardando proyecto",
      });
    }
  }

  return res.json({
    ok: true,
    mode: "batch",
    steps,
    project: updatedProject,
  });
}
