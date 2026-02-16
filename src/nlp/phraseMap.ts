import { ProductionAction, ProductionSection } from "../domain/productionActions";

export type PhraseRule = {
  regex: RegExp;
  action: ProductionAction;
  section: ProductionSection;
};

export const PHRASE_RULES: PhraseRule[] = [
  {
    regex: /(ya|listo|terminado).*(grab|grabo)/i,
    action: "instrument_recorded",
    section: "MUSICOS",
  },
  {
    regex: /(editar|edicion).*(list|termin)/i,
    action: "instrument_edited",
    section: "EDICION",
  },
  {
    regex: /(afinar|afinacion).*(list|termin)/i,
    action: "instrument_tuned",
    section: "AFINACION",
  },
  {
    regex: /(todo|todo el).*(grab|musico)/i,
    action: "section_complete",
    section: "MUSICOS",
  },
];
