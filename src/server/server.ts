import express from "express";
import { applyProductionAction } from "../domain/applyProductionAction";

const app = express();
app.use(express.json());

app.post("/api/production-action", (req, res) => {
  const { projectData, action } = req.body;

  const updated = applyProductionAction(projectData, action);

  res.json({ ok: true, project: updated });
});

app.listen(3000, () => {
   console.log("🚀 SERVER B (src/server) corriendo en http://localhost:3000");
});


app.get("/test-production-action", (req, res) => {
  const projectData = {
    instruments: ["TUBA", "TROMPETAS"],
    musiciansDone: {},
    editionDone: {},
    tuningDone: {},
    checklist: {
      MUSICOS: false,
      EDICION: false,
      AFINACION: false,
    },
  };

  const action = {
    type: "MARK_RECORDED",
    instruments: ["TUBA"],
  };

  const updated = applyProductionAction(projectData, action);

  res.json(updated);
});
