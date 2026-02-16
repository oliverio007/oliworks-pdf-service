import { Request, Response } from "express";
import {
  ParsedProductionCommand,
} from "../domain/productionActions";

import {
  computeProgress,
  computeStatus,
  applyQuickCommandToProject,
  loadProjects,
  saveProjects,
} from "../storage/db";

export async function productionActionHandler(req: Request, res: Response) {
  const { projectId, command } = req.body as {
    projectId: string;
    command: ParsedProductionCommand;
  };

  if (!projectId || !command) {
    return res.status(400).json({ error: "Datos incompletos" });
  }

  const projects = await loadProjects();
  const project = projects.find((p) => p.id === projectId);

  if (!project) {
    return res.status(404).json({ error: "Proyecto no encontrado" });
  }

  let updated = project;

  switch (command.action) {
    case "instrument_recorded":
    case "instrument_edited":
    case "instrument_tuned":
      updated = applyQuickCommandToProject(project, {
        section: command.section,
        instruments: command.instruments,
      });
      break;

    case "section_complete":
      command.instruments.forEach((i) => {
        updated = applyQuickCommandToProject(updated, {
          section: command.section,
          instruments: [i],
        });
      });
      break;

    default:
      return res.status(400).json({ error: "Acción no soportada" });
  }

  updated.progress = computeProgress(updated);
  updated.status = computeStatus(updated);

  const next = projects.map((p) => (p.id === projectId ? updated : p));
  await saveProjects(next);

  res.json({ ok: true, project: updated });
}
