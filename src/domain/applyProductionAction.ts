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
 * - NO guarda en BD
 * - NO depende del frontend
 * - Funciona para simulación y backend real
 * - Función pura (retorna nuevo estado)
 */
export function applyProductionAction(projectData: any, action: any) {
  /* --------------------------------------------------
   * 0) Clonado defensivo (sin referencias compartidas)
   * -------------------------------------------------- */
  const updated = {
    ...projectData,
    instruments: Array.isArray(projectData?.instruments)
      ? [...projectData.instruments]
      : [],
    musiciansDone: { ...(projectData?.musiciansDone ?? {}) },
    editionDone: { ...(projectData?.editionDone ?? {}) },
    tuningDone: { ...(projectData?.tuningDone ?? {}) },
    checklist: { ...(projectData?.checklist ?? {}) },
  };

  /* --------------------------------------------------
   * 1) Validación defensiva de action
   * -------------------------------------------------- */
  if (!action || typeof action.type !== "string") {
    console.warn("[applyProductionAction] action inválida:", action);
    return finalize(updated);
  }

  const allInstruments = updated.instruments;

  // Si la acción no especifica instrumentos → usar todos
  const instruments =
    Array.isArray(action.instruments) && action.instruments.length > 0
      ? action.instruments
      : allInstruments;

  /* --------------------------------------------------
   * 2) Blindaje de mapas por instrumento
   * -------------------------------------------------- */
  for (const inst of allInstruments) {
    if (updated.musiciansDone[inst] === undefined)
      updated.musiciansDone[inst] = false;
    if (updated.editionDone[inst] === undefined)
      updated.editionDone[inst] = false;
    if (updated.tuningDone[inst] === undefined)
      updated.tuningDone[inst] = false;
  }

  /* --------------------------------------------------
   * 3) Aplicar acción
   * -------------------------------------------------- */
  switch (action.type) {
    // 🎙️ GRABACIÓN
    case "MARK_RECORDED": {
      if (!instruments.length) break;
      return finalize(
        markInstrumentsDone(updated, "MUSICOS", instruments)
      );
    }

    // ✂️ EDICIÓN
    case "MARK_EDITED": {
      if (!instruments.length) break;
      return finalize(
        markInstrumentsDone(updated, "EDICION", instruments)
      );
    }

    // 🎚️ AFINACIÓN
    case "MARK_TUNED": {
      if (!instruments.length) break;
      return finalize(
        markInstrumentsDone(updated, "AFINACION", instruments)
      );
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
      console.warn(
        "[applyProductionAction] Acción desconocida:",
        action
      );
      break;
    }
  }

  /* --------------------------------------------------
   * 4) Auto-checklist por sección
   * -------------------------------------------------- */
  if (allInstrumentsDone(allInstruments, updated.musiciansDone)) {
    updated.checklist.MUSICOS = true;
  }

  if (allInstrumentsDone(allInstruments, updated.editionDone)) {
    updated.checklist.EDICION = true;
  }

  if (allInstrumentsDone(allInstruments, updated.tuningDone)) {
    updated.checklist.AFINACION = true;
  }

  return finalize(updated);
}

/* =====================================================
 * Finalización común (progreso + estado)
 * ===================================================== */
function finalize(data: any) {
  data.progress = computeProgress(data);
  data.status = computeStatus(data);
  return data;
}
