// src/export.ts
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import * as Print from "expo-print";
import { ArchiveVersion } from "./types";

// CSV: Archivo (fechas, artista, tema, versión, progreso y cobro)
export async function exportArchiveCSV(items: ArchiveVersion[]) {
  const header = [
    "Fecha",
    "Artista",
    "Tema",
    "Version",
    "Progreso",
    "Costo",
    "Anticipos",
    "Liquidado",
  ].join(",");

  const rows = items.map((a) => {
    const p = a.projectSnapshot;
    const payment = p.payment;

    const paymentAny = payment as any;
const cost = paymentAny?.total ?? "";


    // Solo exportamos los montos de los anticipos, separados por |
    const advAmounts = (payment?.advances || []).map((adv) => adv.amount);
    const adv = advAmounts.length ? advAmounts.join("|") : "";

    const paid = payment?.paidInFull ? "SI" : "NO";

    return [
      p.dateLabel,
      safe(p.artist),
      safe(p.title),
      String(a.version),
      String(p.progress),
      String(cost),
      safe(adv),
      paid,
    ].join(",");
  });

  const csv = [header, ...rows].join("\n");

  // 🔹 cacheDirectory puede ser null, así que damos fallback seguro
  const baseDir =
    FileSystem.cacheDirectory ??
    FileSystem.documentDirectory ??
    "";

  const uri = `${baseDir}oliworks_archivo_${Date.now()}.csv`;

  await FileSystem.writeAsStringAsync(uri, csv, {
    encoding: FileSystem.EncodingType.UTF8,
  });

  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(uri, { mimeType: "text/csv" });
  }

  return uri;
}

// PDF: Tabla bonita con la info de archivo
export async function exportArchivePDF(
  items: ArchiveVersion[],
  title: string
) {
  const rows = items
    .map((a) => {
      const p = a.projectSnapshot;
      const payment = p.payment;

    const paymentAny = payment as any;
const cost = paymentAny?.total ?? "";


      // En PDF podemos ser un poco más descriptivos: "1000 (anticipo estudio)"
      const adv = (payment?.advances || [])
        .map((adv) =>
          adv.note
            ? `${adv.amount} (${adv.note})`
            : String(adv.amount)
        )
        .join(", ");

      const paid = payment?.paidInFull ? "Sí" : "No";

      return `<tr>
        <td>${escapeHtml(p.dateLabel)}</td>
        <td>${escapeHtml(p.artist)}</td>
        <td>${escapeHtml(p.title)}</td>
        <td style="text-align:right">${a.version}</td>
        <td style="text-align:right">${p.progress}%</td>
        <td style="text-align:right">${escapeHtml(String(cost))}</td>
        <td>${escapeHtml(adv)}</td>
        <td>${escapeHtml(paid)}</td>
      </tr>`;
    })
    .join("");

  const html = `<!doctype html>
<html>
<head>
  <meta charset="utf-8"/>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial; padding: 16px; }
    h1 { font-size: 18px; margin: 0 0 10px; }
    table { width: 100%; border-collapse: collapse; }
    th, td { border: 1px solid #ddd; padding: 8px; font-size: 11px; }
    th { background: #f5f5f5; text-align: left; }
  </style>
</head>
<body>
  <h1>${escapeHtml(title)}</h1>
  <table>
    <thead>
      <tr>
        <th>Fecha</th>
        <th>Artista</th>
        <th>Tema</th>
        <th>Ver</th>
        <th>%</th>
        <th>Costo</th>
        <th>Anticipos</th>
        <th>Liquidado</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>
</body>
</html>`;

  const { uri } = await Print.printToFileAsync({ html });

  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(uri, { mimeType: "application/pdf" });
  }

  return uri;
}

// Utilidades

function safe(s: string) {
  const t = (s ?? "").replaceAll('"', '""');
  return t.includes(",") ? `"${t}"` : t;
}

function escapeHtml(s: string) {
  return (s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
