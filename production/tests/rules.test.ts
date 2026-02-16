import { canCloseProject } from "../rules";

test("no permite cerrar si faltan etapas", () => {
  const project: any = {
    instruments: ["VOZ"],
    musiciansDone: { VOZ: true },
    editionDone: { VOZ: true },
    tuningDone: { VOZ: true },
    checklist: { MIX: false, MASTER: true },
  };

  expect(canCloseProject(project)).toBe(false);
});
