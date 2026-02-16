// src/server/phrases/phraseMap.ts

export type ProductionAction =
  | { type: "MARK_RECORDED"; instruments: string[] }
  | { type: "MARK_EDITED"; instruments: string[] }
  | { type: "MARK_TUNED"; instruments: string[] }
  | { type: "MARK_MIX_DONE" }
  | { type: "MARK_MASTER_DONE" };

type PhraseRule = {
  match: RegExp;
  toAction: (match: RegExpMatchArray) => ProductionAction;
};

export const phraseRules: PhraseRule[] = [
  // 🎙️ GRABACIÓN
  {
    match: /ya se grab[oó] (.+)/i,
    toAction: (m) => ({
      type: "MARK_RECORDED",
      instruments: splitInstruments(m[1]),
    }),
  },

  // ✂️ EDICIÓN
  {
    match: /ya se edit[oó] (.+)/i,
    toAction: (m) => ({
      type: "MARK_EDITED",
      instruments: splitInstruments(m[1]),
    }),
  },

  // 🎚️ AFINACIÓN
  {
    match: /ya se afin[oó] (.+)/i,
    toAction: (m) => ({
      type: "MARK_TUNED",
      instruments: splitInstruments(m[1]),
    }),
  },

  // 🎛️ MIX
  {
    match: /ya qued[oó] el mix/i,
    toAction: () => ({ type: "MARK_MIX_DONE" }),
  },

  // 📀 MASTER
  {
    match: /ya qued[oó] el master/i,
    toAction: () => ({ type: "MARK_MASTER_DONE" }),
  },
];

// helpers
function splitInstruments(raw: string): string[] {
  return raw
    .toUpperCase()
    .split(/,|y/)
    .map((s) => s.trim())
    .filter(Boolean);
}
