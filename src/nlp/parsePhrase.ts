import { PHRASE_RULES } from "./phraseMap";
import { ParsedProductionCommand } from "../domain/productionActions";
import { normalizeInstrument } from "./normalizers";

export function parsePhraseToAction(
  phrase: string,
  instrumentsInProject: string[]
): ParsedProductionCommand | null {
  for (const rule of PHRASE_RULES) {
    if (rule.regex.test(phrase)) {
      const found: string[] = [];

      for (const inst of instrumentsInProject) {
        if (phrase.toLowerCase().includes(inst.toLowerCase())) {
          found.push(normalizeInstrument(inst));
        }
      }

      return {
        action: rule.action,
        section: rule.section,
        instruments: found,
      };
    }
  }

  return null;
}
