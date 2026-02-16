export type ProductionAction =
  | "instrument_recorded"
  | "instrument_unrecorded"
  | "instrument_edited"
  | "instrument_unedited"
  | "instrument_tuned"
  | "instrument_untuned"
  | "section_complete";

export type ProductionSection =
  | "MUSICOS"
  | "EDICION"
  | "AFINACION";

export type ParsedProductionCommand = {
  action: ProductionAction;
  section: ProductionSection;
  instruments: string[];
};
