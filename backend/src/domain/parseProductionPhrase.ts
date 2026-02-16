export interface ProductionAction {
  type: string;
  instrument?: string;
}

export function parseProductionPhrase(phrase: string): ProductionAction | null {
  const lower = phrase.toLowerCase();

  if (lower.includes("guitarra")) {
    return { type: "MARK_RECORDED", instrument: "guitarra" };
  }

  if (lower.includes("mezcla")) {
    return { type: "MARK_MIX_DONE" };
  }

  return null;
}
