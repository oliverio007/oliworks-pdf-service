import { getPendingInstruments } from "@/production/rules";

export function computeProgress(project: any): number {
  if (!project) return 0;

  const instruments = Array.isArray(project.instruments)
    ? project.instruments
    : [];

  if (instruments.length === 0) return 0;

  let totalTasks = 0;
  let completedTasks = 0;

  // 🎵 Por instrumento: musicians, edition, tuning
  const stages: ("musicians" | "edition" | "tuning")[] = [
    "musicians",
    "edition",
    "tuning",
  ];

  for (const stage of stages) {
    const pending = getPendingInstruments(project, stage);
    totalTasks += instruments.length;
    completedTasks += instruments.length - pending.length;
  }

  // 🎚 MIX y MASTER
  totalTasks += 2;

  if (project.checklist?.MIX === true) completedTasks += 1;
  if (project.checklist?.MASTER === true) completedTasks += 1;

  if (totalTasks === 0) return 0;

  return Math.round((completedTasks / totalTasks) * 100);
}
