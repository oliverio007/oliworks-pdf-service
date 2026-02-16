// production/rules.ts

export type Stage = "musicians" | "edition" | "tuning";

export type Checklist = {
  MIX?: boolean;
  MASTER?: boolean;
};

export interface Project {
  instruments: string[];

  musiciansDone?: Record<string, boolean>;
  editionDone?: Record<string, boolean>;
  tuningDone?: Record<string, boolean>;

  checklist?: Checklist;
}

/* -------------------------------------------------------
 * Helpers internos
 * ----------------------------------------------------- */

function getStageMap(project: Project, stage: Stage): Record<string, boolean> {
  switch (stage) {
    case "musicians":
      return project.musiciansDone ?? {};
    case "edition":
      return project.editionDone ?? {};
    case "tuning":
      return project.tuningDone ?? {};
    default:
      return {};
  }
}

function getChecklist(project: Project): Checklist {
  return project.checklist ?? {};
}

/* -------------------------------------------------------
 * Instrumentos pendientes / completos
 * ----------------------------------------------------- */

export function getPendingInstruments(
  project: Project,
  stage: Stage
): string[] {
  const instruments = Array.isArray(project.instruments)
    ? project.instruments
    : [];

  const doneMap = getStageMap(project, stage);

  return instruments.filter((name) => {
    if (!name) return false;
    return doneMap[name] !== true;
  });
}

export function getDoneInstruments(
  project: Project,
  stage: Stage
): string[] {
  const map = getStageMap(project, stage);
  return (project.instruments || []).filter((i) => map[i] === true);
}

/* -------------------------------------------------------
 * Reglas de cierre (PRODUCCIÓN)
 * ----------------------------------------------------- */

export function canCloseProject(project: Project): boolean {
  if (!project) return false;

  // Debe tener instrumentos
  if (!Array.isArray(project.instruments) || project.instruments.length === 0)
    return false;

  const noPending =
    getPendingInstruments(project, "musicians").length === 0 &&
    getPendingInstruments(project, "edition").length === 0 &&
    getPendingInstruments(project, "tuning").length === 0;

  const checklist = getChecklist(project);

  const mixDone = checklist.MIX === true;
  const masterDone = checklist.MASTER === true;

  return noPending && mixDone && masterDone;
}

export function getClosureBlockingReasons(project: Project): string[] {
  const reasons: string[] = [];

  if (!project) {
    reasons.push("Proyecto inválido.");
    return reasons;
  }

  if (!Array.isArray(project.instruments) || project.instruments.length === 0) {
    reasons.push("No hay instrumentos en el proyecto.");
    return reasons;
  }

  const pendingMusicians = getPendingInstruments(project, "musicians");
  const pendingEdition = getPendingInstruments(project, "edition");
  const pendingTuning = getPendingInstruments(project, "tuning");

  if (pendingMusicians.length) {
    reasons.push(
      `Faltan grabar: ${pendingMusicians.join(", ")}`
    );
  }

  if (pendingEdition.length) {
    reasons.push(
      `Faltan editar: ${pendingEdition.join(", ")}`
    );
  }

  if (pendingTuning.length) {
    reasons.push(
      `Faltan afinar: ${pendingTuning.join(", ")}`
    );
  }

  const checklist = getChecklist(project);

  if (checklist.MIX !== true) {
    reasons.push("Falta completar MIX");
  }

  if (checklist.MASTER !== true) {
    reasons.push("Falta completar MASTER");
  }

  return reasons;
}
