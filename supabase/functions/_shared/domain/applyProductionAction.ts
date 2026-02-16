import { markInstrumentsDone } from "./projectActions";
import { computeProgress } from "./computeProgress";
import { computeStatus } from "./computeStatus";

/**
 * Marca si TODOS los instrumentos de la lista están en true
 */
function allInstrumentsDone(
  instruments: string[] = [],
  doneMap: Record<string, boolean> = {}
) {
  if (!instruments.length) return false;
  return instruments.every((inst) => doneMap[inst] === true);
}

/**
 * Aplica una acción de producción sobre projectData
 * NO guarda en BD
 * NO depende de la app móvil
 * Funciona para simulación y backend real
 */
export function applyProductionAction(projectData: any, action: any) {
  // 🔒 Clonado seguro
  let updated = {
    ...projectData,
    instruments: projectData.instruments ?? [],
    musiciansDone: { ...(projectData.musiciansDone ?? {}) },
    editionDone: { ...(projectData.editionDone ?? {}) },
    tuningDone: { ...(projectData.tuningDone ?? {}) },
    checklist: { ...(projectData.checklist ?? {}) },
  };

  const allInstruments = updated.instruments;

  // Si no vienen instrumentos en la acción → usar todos
  const instruments =
    action?.instruments?.length > 0
      ? action.instruments
      : allInstruments;

  // ==========================
  // 🎛️ APLICAR ACCIÓN
  // ==========================
  switch (action?.type) {
    // 🎙️ GRABACIÓN
    case "MARK_RECORDED": {
      if (!instruments.length) break;
      updated = markInstrumentsDone(updated, "MUSICOS", instruments);
      break;
    }

    // ✂️ EDICIÓN
    case "MARK_EDITED": {
      if (!instruments.length) break;
      updated = markInstrumentsDone(updated, "EDICION", instruments);
      break;
    }

    // 🎚️ AFINACIÓN
    case "MARK_TUNED": {
      if (!instruments.length) break;
      updated = markInstrumentsDone(updated, "AFINACION", instruments);
      break;
    }

    // 🎛️ MIX
    case "MARK_MIX_DONE": {
      updated.checklist.MIX = true;
      break;
    }

    // 📀 MASTER
    case "MARK_MASTER_DONE": {
      updated.checklist.MASTER = true;
      break;
    }

    default: {
      console.warn("[applyProductionAction] Acción desconocida:", action);
      break;
    }
  }

  // ==========================
  // ✅ AUTO-CHECKLIST POR SECCIÓN
  // ==========================
  if (allInstrumentsDone(allInstruments, updated.musiciansDone)) {
    updated.checklist.MUSICOS = true;
  }

  if (allInstrumentsDone(allInstruments, updated.editionDone)) {
    updated.checklist.EDICION = true;
  }

  if (allInstrumentsDone(allInstruments, updated.tuningDone)) {
    updated.checklist.AFINACION = true;
  }

  // ==========================
  // 🔁 RE-CÁLCULO GLOBAL
  // ==========================
  updated.progress = computeProgress(updated);
  updated.status = computeStatus(updated);

  return updated;
}
