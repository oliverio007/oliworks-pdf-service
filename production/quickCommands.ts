import { computeProgress, computeStatus } from "../src/storage/db";

/* ======================================================
 * Tipos
 * ====================================================== */

export type ActionSection = "MUSICOS" | "EDICION" | "AFINACION";
export type ActionValue = true | false;

export type QuickCommand = {
  section: ActionSection;
  instruments: string[]; // ["*"] = todos
  value: ActionValue;
};

export type ApplyResult = {
  project: any;
  applied: string[];
};

/* ======================================================
 * Diccionario de lenguaje humano
 * ====================================================== */

const ACTION_MAP: Record<
  string,
  { section: ActionSection; value: ActionValue }
> = {
  // 🎙️ MÚSICOS
  grabaron: { section: "MUSICOS", value: true },
  grabados: { section: "MUSICOS", value: true },
  grabado: { section: "MUSICOS", value: true },
  grabada: { section: "MUSICOS", value: true },
  grabar: { section: "MUSICOS", value: true },
  grabo: { section: "MUSICOS", value: true },
  grabamos: { section: "MUSICOS", value: true },

  // ✂️ EDICIÓN
  editaron: { section: "EDICION", value: true },
  editados: { section: "EDICION", value: true },
  editar: { section: "EDICION", value: true },
  edito: { section: "EDICION", value: true },

  // 🎚️ AFINACIÓN
  afinaron: { section: "AFINACION", value: true },
  afinados: { section: "AFINACION", value: true },
  afinar: { section: "AFINACION", value: true },
  afino: { section: "AFINACION", value: true },

  // ❌ NEGATIVOS (fallback de sección)
  quita: { section: "MUSICOS", value: false },
  quitar: { section: "MUSICOS", value: false },
  desmarca: { section: "MUSICOS", value: false },
  desmarcar: { section: "MUSICOS", value: false },
};

/* ======================================================
 * Helpers
 * ====================================================== */

export function normalizeWord(s: string) {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

/* ======================================================
 * Parser de texto humano
 * ====================================================== */

export function parseQuickCommand(text: string): QuickCommand | null {
  const clean = normalizeWord(text);

  const isNegative = clean.startsWith("no se ");
  const isAll =
    clean.includes(" todo ") ||
    clean.endsWith(" todo") ||
    clean.includes(" todos ");

  const actionKey = Object.keys(ACTION_MAP).find(
    (a) => clean.startsWith(`${a} `) || clean.includes(` ${a} `)
  );

  if (!actionKey) return null;

  const { section, value } = ACTION_MAP[actionKey];

  // ✅ COMANDO GLOBAL (todo grabado / todo afinado / todo editado)
  if (isAll) {
    return {
      section,
      instruments: ["*"],
      value: isNegative ? false : value,
    };
  }

  // 🎯 COMANDO POR INSTRUMENTO
  const after = clean.split(actionKey)[1]?.trim();
  if (!after) return null;

  const instruments = after
    .split(/,| y | e /)
    .map((i) => i.trim())
    .filter(Boolean);

  if (!instruments.length) return null;

  return {
    section,
    instruments,
    value: isNegative ? false : value,
  };
}

/* ======================================================
 * Aplicar comando al proyecto
 * ====================================================== */

export function applyQuickCommandToProject(
  project: any,
  command: QuickCommand
): ApplyResult {
  const mapKey =
    command.section === "MUSICOS"
      ? "musiciansDone"
      : command.section === "EDICION"
      ? "editionDone"
      : "tuningDone";

  const current: Record<string, boolean> = project[mapKey] || {};
  const next: Record<string, boolean> = { ...current };
  const applied: string[] = [];

  const allInstruments: string[] = Array.isArray(project.instruments)
    ? project.instruments
    : [];

  const targets =
    command.instruments.includes("*")
      ? allInstruments
      : command.instruments;

  targets.forEach((raw) => {
    const match =
      command.instruments.includes("*")
        ? raw
        : allInstruments.find((i: string) =>
            normalizeWord(i).includes(normalizeWord(raw))
          );

    if (!match) return;

    if (next[match] !== command.value) {
      next[match] = command.value;
      applied.push(match);
    }
  });

  // 🚫 nada cambió
  if (!applied.length) {
    return { project, applied };
  }

  const updated = {
    ...project,
    [mapKey]: next,
    updatedAt: Date.now(),
  };

  updated.progress = computeProgress(updated);
  updated.status = computeStatus(updated);

  return { project: updated, applied };
}
