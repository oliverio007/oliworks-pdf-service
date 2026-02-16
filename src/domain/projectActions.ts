// src/domain/projectActions.ts

export type ChecklistKey =
  | "MUSICOS"
  | "EDICION"
  | "AFINACION"
  | "MIX"
  | "MASTER";

export type ProjectData = {
  instruments?: string[];

  musiciansDone?: Record<string, boolean>;
  editionDone?: Record<string, boolean>;
  tuningDone?: Record<string, boolean>;

  checklist?: Partial<Record<ChecklistKey, boolean>>;

  progress?: number;
  status?: string;
};

/**
 * 🔒 Normaliza un proyecto para que NUNCA falten campos críticos
 */
function normalizeProject(project: ProjectData): Required<ProjectData> {
  return {
    instruments: project.instruments ?? [],

    musiciansDone: project.musiciansDone ?? {},
    editionDone: project.editionDone ?? {},
    tuningDone: project.tuningDone ?? {},

    checklist: {
      MUSICOS: project.checklist?.MUSICOS ?? false,
      EDICION: project.checklist?.EDICION ?? false,
      AFINACION: project.checklist?.AFINACION ?? false,
      MIX: project.checklist?.MIX ?? false,
      MASTER: project.checklist?.MASTER ?? false,
    },

    progress: project.progress ?? 0,
    status: project.status ?? "EN_PROCESO",
  };
}

/**
 * 🎯 Marca instrumentos como completados en una sección
 */
export function markInstrumentsDone(
  project: ProjectData,
  section: "MUSICOS" | "EDICION" | "AFINACION",
  instruments: string[]
): Required<ProjectData> {
  const normalized = normalizeProject(project);

  const mapKey =
    section === "MUSICOS"
      ? "musiciansDone"
      : section === "EDICION"
      ? "editionDone"
      : "tuningDone";

  const current = normalized[mapKey];
  const next = { ...current };

  for (const inst of instruments) {
    if (inst) {
      next[inst] = true;
    }
  }

  return {
    ...normalized,
    [mapKey]: next,
  };
}

/**
 * ✅ Verifica si TODOS los instrumentos están completados
 */
export function allInstrumentsDone(
  instruments: string[],
  doneMap: Record<string, boolean>
): boolean {
  if (!instruments.length) return false;
  return instruments.every((inst) => doneMap[inst] === true);
}
