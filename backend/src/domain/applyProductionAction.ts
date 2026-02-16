import { ProductionAction } from "./parseProductionPhrase";

export function applyProductionAction(project: any, action: ProductionAction) {
  const updated = { ...project };

  switch (action.type) {
    case "MARK_RECORDED":
      updated.lastRecordedInstrument = action.instrument;
      break;

    case "MARK_MIX_DONE":
      updated.mixDone = true;
      break;

    default:
      break;
  }

  return updated;
}
