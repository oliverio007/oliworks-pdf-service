export function parseProductionPhrase(
  phrase: string,
  projectData: any
) {
  const text = phrase.toLowerCase();

  const instruments = projectData.instruments || [];

  const detectInstruments = () =>
    instruments.filter((i: string) =>
      text.includes(i.toLowerCase())
    );

  if (text.includes("grab")) {
    return {
      type: "MARK_RECORDED",
      instruments: detectInstruments(),
    };
  }

  if (text.includes("edit")) {
    return {
      type: "MARK_EDITED",
      instruments: detectInstruments(),
    };
  }

  if (text.includes("afin")) {
    return {
      type: "MARK_TUNED",
      instruments: detectInstruments(),
    };
  }

  if (text.includes("mix")) {
    return { type: "MARK_MIX_DONE" };
  }

  if (text.includes("master")) {
    return { type: "MARK_MASTER_DONE" };
  }

  return null;
}
