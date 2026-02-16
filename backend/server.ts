import express from "express";
import { parseProductionPhrase } from "./src/domain/parseProductionPhrase";
import { applyProductionAction } from "./src/domain/applyProductionAction";

const app = express();
app.use(express.json());

app.post("/api/production-action", (req, res) => {
  const { phrase, projectData, simulate } = req.body;

  if (!phrase || !projectData) {
    return res.status(400).json({
      ok: false,
      error: "phrase y projectData son requeridos",
    });
  }

  const action = parseProductionPhrase(phrase);

  if (!action) {
    return res.json({
      ok: true,
      simulate: true,
      message: "No se detectó ninguna acción",
      project: projectData,
    });
  }

  const updatedProject = applyProductionAction(projectData, action);

  return res.json({
    ok: true,
    simulate: !!simulate,
    action,
    project: updatedProject,
  });
});

const PORT = Number(process.env.PORT) || 3000;

app.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 Backend corriendo en puerto ${PORT}`);
});
