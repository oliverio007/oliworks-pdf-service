require("dotenv").config();
const express = require("express");
const cors = require("cors");
const vision = require("@google-cloud/vision");

const app = express();
const PORT = process.env.PORT || 4000;

// Cliente de Google Vision (usa GOOGLE_APPLICATION_CREDENTIALS del .env)
const visionClient = new vision.ImageAnnotatorClient();

app.use(cors());
app.use(express.json({ limit: "10mb" })); // aceptamos base64 grande

// Utilidad para limpiar y normalizar líneas
function normalizeList(list) {
  const seen = new Set();
  return list
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
    .filter((s) => {
      // quitamos duplicados
      if (seen.has(s.toLowerCase())) return false;
      seen.add(s.toLowerCase());
      return true;
    })
    .filter((s) => s.length >= 2 && s.length <= 80);
}

// Heurística muy simple: nos quedamos con líneas que no sean puro número
function basicFilter(lines) {
  return lines.filter((line) => !/^\d+[\.\)]?$/.test(line));
}

// Lógica principal de OCR usando Google Vision
async function runOcrVision(imageBase64, mode) {
  const [result] = await visionClient.textDetection({
    image: { content: Buffer.from(imageBase64, "base64") },
  });

  const fullText =
    (result.fullTextAnnotation && result.fullTextAnnotation.text) ||
    (result.textAnnotations &&
      result.textAnnotations[0] &&
      result.textAnnotations[0].description) ||
    "";

  const lines = basicFilter(
    fullText
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean)
  );

  let artists = [];
  let titles = [];

  if (mode === "ARTISTS") {
    // 👉 por ahora todas las líneas son candidatas a artistas
    artists = normalizeList(lines);
  } else {
    // mode === "TRACKS"
    titles = normalizeList(lines);
  }

  // Si quieres, aquí podrías intentar inferir si dice "Banda" o "Grupo"
  let group = undefined;
  const lower = fullText.toLowerCase();
  if (lower.includes("banda")) group = "BANDA";
  else if (lower.includes("grupo")) group = "GRUPO";

  return {
    artists,
    titles,
    group,
    rawText: fullText,
  };
}

// Endpoint principal
app.post("/ocr", async (req, res) => {
  try {
    const { imageBase64, mode } = req.body;

    if (!imageBase64 || !mode) {
      return res
        .status(400)
        .json({ error: "Faltan campos: imageBase64 y/o mode." });
    }

    if (mode !== "ARTISTS" && mode !== "TRACKS") {
      return res
        .status(400)
        .json({ error: "mode debe ser 'ARTISTS' o 'TRACKS'." });
    }

    const ocrResult = await runOcrVision(imageBase64, mode);
    return res.json(ocrResult);
  } catch (err) {
    console.error("Error en /ocr:", err);
    return res.status(500).json({
      error: "Error interno procesando OCR",
      details: err.message || String(err),
    });
  }
});

// Chequeo simple
app.get("/", (req, res) => {
  res.send("Oli OCR backend activo 🚀");
});

app.listen(PORT, () => {
  console.log(`OCR server escuchando en http://localhost:${PORT}`);
});
