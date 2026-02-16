export function computeStatus(p: any): string {
  const checklist = p.checklist || {};
  const allDone =
    Object.keys(checklist).length > 0 &&
    Object.values(checklist).every(Boolean);

  return allDone ? "LISTO" : "EN_PROCESO";
}
