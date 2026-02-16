// src/production/quickQueries.ts

import { normalizeWord } from "./quickCommands";

/* ======================================================
 * Tipos
 * ====================================================== */

export type QuickQueryResult = {
  type: "info";
  text: string;
};

/* ======================================================
 * Helpers
 * ====================================================== */

function listByState(
  all: string[],
  map: Record<string, boolean> | undefined,
  wanted: boolean
): string[] {
  if (!Array.isArray(all)) return [];

  return all.filter((i) => {
    const val = map?.[i] === true;
    return wanted ? val : !val;
  });
}

/* ======================================================
 * Queries
 * ====================================================== */

export function runQuickQuery(
  project: any,
  text: string
): QuickQueryResult | null {
  if (!project) return null;

  const clean = normalizeWord(text);

  const instruments: string[] = Array.isArray(project.instruments)
    ? project.instruments
    : [];

  const musiciansDone = project.musiciansDone || {};
  const editionDone = project.editionDone || {};
  const tuningDone = project.tuningDone || {};

  /* =============================
   * 🎙️ GRABACIÓN
   * ============================= */

  if (
    clean.includes("que falta por grabar") ||
    clean.includes("que instrumentos faltan por grabar")
  ) {
    const missing = listByState(instruments, musiciansDone, false);

    return {
      type: "info",
      text: missing.length
        ? `Faltan por grabar: ${missing.join(", ")}`
        : "Todo está grabado 🎉",
    };
  }

  if (
    clean.includes("que se ha grabado") ||
    clean.includes("que instrumentos tiene grabados")
  ) {
    const done = listByState(instruments, musiciansDone, true);

    return {
      type: "info",
      text: done.length
        ? `Grabados: ${done.join(", ")}`
        : "Aún no hay instrumentos grabados",
    };
  }

  /* =============================
   * ✂️ EDICIÓN
   * ============================= */

  if (
    clean.includes("que falta por editar") ||
    clean.includes("que instrumentos faltan por editar")
  ) {
    const missing = listByState(instruments, editionDone, false);

    return {
      type: "info",
      text: missing.length
        ? `Faltan por editar: ${missing.join(", ")}`
        : "Todo está editado ✂️",
    };
  }

  if (
    clean.includes("que se ha editado") ||
    clean.includes("que instrumentos estan editados")
  ) {
    const done = listByState(instruments, editionDone, true);

    return {
      type: "info",
      text: done.length
        ? `Editados: ${done.join(", ")}`
        : "Aún no hay instrumentos editados",
    };
  }

  /* =============================
   * 🎚️ AFINACIÓN
   * ============================= */

  if (
    clean.includes("que falta por afinar") ||
    clean.includes("que instrumentos faltan por afinar")
  ) {
    const missing = listByState(instruments, tuningDone, false);

    return {
      type: "info",
      text: missing.length
        ? `Faltan por afinar: ${missing.join(", ")}`
        : "Todo está afinado 🎚️",
    };
  }

  if (
    clean.includes("que se ha afinado") ||
    clean.includes("que instrumentos estan afinados")
  ) {
    const done = listByState(instruments, tuningDone, true);

    return {
      type: "info",
      text: done.length
        ? `Afinados: ${done.join(", ")}`
        : "Aún no hay instrumentos afinados",
    };
  }

  return null;
}
