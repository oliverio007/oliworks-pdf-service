export function computeProgress(p: any): number {
  const checklist = p.checklist || {};
  const keys = Object.keys(checklist);

  if (keys.length === 0) return 0;

  const done = keys.filter((k) => checklist[k]).length;
  return Math.round((done / keys.length) * 100);
}
