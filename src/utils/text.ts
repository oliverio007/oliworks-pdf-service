// utils/text.ts

/**
 * Normaliza nombres de artistas.
 * Convierte:
 *  - jose_alfredo-jimenez
 *  -   LOS TIGRES__DEL NORTE
 * En:
 *  - Jose Alfredo Jimenez
 *  - Los Tigres Del Norte
 */
export function normalizeArtistName(input: string): string {
  if (!input) return "";

  return input
    // Permite solo letras (incluye acentos y ñ), espacios, _ y -
    .replace(/[^a-zA-ZáéíóúÁÉÍÓÚñÑ\s_-]/g, "")
    // Reemplaza _ y - por espacio
    .replace(/[_-]+/g, " ")
    // Quita espacios múltiples
    .replace(/\s+/g, " ")
    // Quita espacios al inicio y final
    .trim()
    // Todo a minúsculas
    .toLowerCase()
    // Capitaliza cada palabra
    .split(" ")
    .map(word =>
      word.charAt(0).toUpperCase() + word.slice(1)
    )
    .join(" ");
}
