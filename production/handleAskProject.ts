// production/handleAskProject.ts
import { v4 as uuid } from "uuid";
import {
  upsertProject,
  resolveArtistKeyFromInput,
} from "../src/storage/db";

import { BANDA_DEFAULT_ON, GRUPO_DEFAULT_ON } from "../src/data/instruments";
import { Project } from "../src/types";

function buildStageMaps(instruments: string[]) {
  const base: Record<string, boolean> = {};
  instruments.forEach((i) => (base[i] = false));

  return {
    musiciansDone: { ...base },
    editionDone: { ...base },
    tuningDone: { ...base },
  };
}

function todayLabel() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

type AskInput = {
  text: string;
};

export async function handleAskProject({ text }: AskInput) {
  const lower = text.toLowerCase();

  // 🧠 detectar tipo
  let group: "BANDA" | "GRUPO" | "OTROS" = "OTROS";
  if (lower.includes("banda")) group = "BANDA";
  if (lower.includes("grupo")) group = "GRUPO";

  // 🎵 detectar título
  const titleMatch =
    text.match(/llamado\s+"([^"]+)"/i) ||
    text.match(/llamado\s+([^\n]+)/i);

  if (!titleMatch) {
    return {
      ok: false,
      message: "No pude detectar el nombre del tema.",
    };
  }

  const title = titleMatch[1].trim();

  // 🎤 detectar artista
  const artistMatch =
    text.match(/para\s+(.+)$/i) ||
    text.match(/de\s+(.+)$/i);

  if (!artistMatch) {
    return {
      ok: false,
      message: "No pude detectar el artista.",
    };
  }

  const artistName = artistMatch[1].trim();

  // 🔑 resolver artista
  const artistKey = await resolveArtistKeyFromInput(artistName);

  // 🎺 preset
  const instruments =
    group === "BANDA"
      ? BANDA_DEFAULT_ON
      : group === "GRUPO"
      ? GRUPO_DEFAULT_ON
      : [];

  const stageMaps = buildStageMaps(instruments);

  const now = Date.now();

  const project: Project = {
    id: uuid(),
    artist: artistName,
    title,
    group,
    instruments,

    musiciansDone: stageMaps.musiciansDone,
    editionDone: stageMaps.editionDone,
    tuningDone: stageMaps.tuningDone,

    checklist: {},
    payment: { total: 0, advances: [], paidInFull: false },

    status: "EN_PROCESO",
    progress: 0,

    dateLabel: todayLabel(),
    createdAt: now,
    updatedAt: now,

    ...(artistKey ? ({ artistLocalId: artistKey } as any) : {}),
  } as any;

  await upsertProject(project);

  return {
    ok: true,
    message: `🎶 Se creó el tema "${title}" para ${artistName} como ${group}.`,
    project: {
      artist: artistName,
      title,
      group,
      instruments: instruments.length,
    },
  };
}
