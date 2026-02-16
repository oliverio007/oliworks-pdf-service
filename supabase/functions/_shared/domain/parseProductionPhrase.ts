const INSTRUMENTS = [
  "TUBA",
  "TROMPETAS",
  "TROMBON",
  "TAROLAS",
  "TAMBORA",
  "VOZ",
  "ARMONIAS",
];

function detectInstruments(text: string): string[] {
  const upper = text.toUpperCase();
  return INSTRUMENTS.filter(i => upper.includes(i));
}

export function parseProductionPhrase(phrase: string) {
  const text = phrase.toLowerCase();

  // 🎙️ Grabación
  if (text.includes("grab")) {
    return {
      type: "MARK_RECORDED",
      instruments: detectInstruments(text),
    };
  }

  // ✂️ Edición
  if (text.includes("edit")) {
    return {
      type: "MARK_EDITED",
      instruments: detectInstruments(text),
    };
  }

  // 🎚️ Afinación
  if (text.includes("afin")) {
    return {
      type: "MARK_TUNED",
      instruments: detectInstruments(text),
    };
  }

  // 🎛️ Mix
  if (text.includes("mix")) {
    return { type: "MARK_MIX_DONE" };
  }

  // 📀 Master
  if (text.includes("master")) {
    return { type: "MARK_MASTER_DONE" };
  }

  return null;
}
