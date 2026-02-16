// src/production/quickQueries.ts

import { normalizeWord } from "./quickCommands";

/* ======================================================
 * Tipos
 * ====================================================== */

export type QuickQueryResult =
  | { type: "info"; text: string }
  | { type: "error"; text: string };

/* ======================================================
 * Helpers internos
 * ====================================================== */

function listToText(list: string[]) {
  return list.length ? list.join(", ") : "—";
}

function getMapBySection(project: any, section: "MUSICOS" | "EDICION" | "AFINACION") {
  if (section === "MUSICOS") return project.musiciansDone || {};
  if (section === "EDICION") return project.editionDone || {};
  return project.tuningDone || {};
}

/* ======================================================
 * Detección de intención
 * ====================================================== */

function includesAny(text: string, words: string[]) {
  return words.some((w) => text.includes(w));
}

/* ======================================================
 * Query principal
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

  if (!instruments.length) {
    return {
      type: "info",
      text: "Este tema no tiene instrumentos registrados.",
    };
  }

  /* ----------------------------------------------
   * 🎙️ GRABACIÓN (MÚSICOS)
   * ---------------------------------------------- */

  if (includesAny(clean, ["falta por grabar", "faltan por grabar"])) {
    const doneMap = getMapBySection(project, "MUSICOS");
    const missing = instruments.filter((i) => !doneMap[i]);

    return {
      type: "info",
      text: `🎙️ Faltan por grabar: ${listToText(missing)}`,
    };
  }

  if (includesAny(clean, ["que se grabo", "que se ha grabado", "grabados"])) {
    const doneMap = getMapBySection(project, "MUSICOS");
    const done = instruments.filter((i) => doneMap[i]);

    return {
      type: "info",
      text: `🎙️ Grabados: ${listToText(done)}`,
    };
  }

  /* ----------------------------------------------
   * ✂️ EDICIÓN
   * ---------------------------------------------- */

  if (includesAny(clean, ["falta por editar", "faltan por editar"])) {
    const doneMap = getMapBySection(project, "EDICION");
    const missing = instruments.filter((i) => !doneMap[i]);

    return {
      type: "info",
      text: `✂️ Faltan por editar: ${listToText(missing)}`,
    };
  }

  if (includesAny(clean, ["editados", "que se edito", "que se ha editado"])) {
    const doneMap = getMapBySection(project, "EDICION");
    const done = instruments.filter((i) => doneMap[i]);

    return {
      type: "info",
      text: `✂️ Editados: ${listToText(done)}`,
    };
  }

  /* ----------------------------------------------
   * 🎚️ AFINACIÓN
   * ---------------------------------------------- */

  if (includesAny(clean, ["falta por afinar", "faltan por afinar"])) {
    const doneMap = getMapBySection(project, "AFINACION");
    const missing = instruments.filter((i) => !doneMap[i]);

    return {
      type: "info",
      text: `🎚️ Faltan por afinar: ${listToText(missing)}`,
    };
  }

  if (includesAny(clean, ["afinados", "que se afino", "que se ha afinado"])) {
    const doneMap = getMapBySection(project, "AFINACION");
    const done = instruments.filter((i) => doneMap[i]);

    return {
      type: "info",
      text: `🎚️ Afinados: ${listToText(done)}`,
    };
  }

  return null;
}
