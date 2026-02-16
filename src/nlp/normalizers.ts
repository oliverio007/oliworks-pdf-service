export function normalizeWord(s: string) {
  return String(s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

export function normalizeInstrument(name: string) {
  return normalizeWord(name).toUpperCase();
}

export function normalizeSection(raw: string) {
  const s = normalizeWord(raw);

  if (s.includes("musico") || s.includes("grab")) return "MUSICOS";
  if (s.includes("edicion") || s.includes("editar")) return "EDICION";
  if (s.includes("afin")) return "AFINACION";

  return null;
}
