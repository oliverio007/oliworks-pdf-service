// src/server/productionActionHandler.ts
import { Request, Response } from "express";
import {
  getProject,
  upsertProject,
  computeProgress,
  computeStatus,
} from "../storage/db";

type ActionPayload = {
  projectId: string;
  action:
    | "musico_grabado"
    | "instrumento_editado"
    | "instrumento_afinado";
  instrument: string;
};

export async function productionActionHandler(
  req: Request,
  res: Response
) {
  try {
    const { projectId, action, instrument } =
      req.body as ActionPayload;

    if (!projectId || !action || !instrument) {
      return res.status(400).json({
        error: "Faltan datos: projectId, action, instrument",
      });
    }

    const project = await getProject(projectId);
    if (!project) {
      return res.status(404).json({ error: "Proyecto no encontrado" });
    }

    // Clonar proyecto
    const next = { ...project };

    // 🔁 aplicar acción
    switch (action) {
      case "musico_grabado":
        next.musiciansDone = {
          ...next.musiciansDone,
          [instrument]: true,
        };
        break;

      case "instrumento_editado":
        next.editionDone = {
          ...next.editionDone,
          [instrument]: true,
        };
        break;

      case "instrumento_afinado":
        next.tuningDone = {
          ...next.tuningDone,
          [instrument]: true,
        };
        break;

      default:
        return res.status(400).json({ error: "Acción no soportada" });
    }

    // 🔄 recalcular
    next.progress = computeProgress(next);
    next.status = computeStatus(next);
    next.updatedAt = Date.now();

    await upsertProject(next);

    return res.json({
      ok: true,
      project: next,
    });
  } catch (err) {
    console.error("[production-action]", err);
    return res.status(500).json({ error: "Error interno" });
  }
}
