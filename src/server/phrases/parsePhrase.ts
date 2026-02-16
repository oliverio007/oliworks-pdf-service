// src/server/phrases/parsePhrase.ts
import { phraseRules, ProductionAction } from "./phraseMap";

export function parsePhraseToAction(
  phrase: string
): ProductionAction | null {
  const clean = phrase.trim();

  for (const rule of phraseRules) {
    const match = clean.match(rule.match);
    if (match) {
      return rule.toAction(match);
    }
  }

  return null;
}
