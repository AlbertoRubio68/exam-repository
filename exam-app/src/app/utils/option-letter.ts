/** Letras usadas para etiquetar las opciones de respuesta (A, B, C, D...). */
const OPTION_LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'];

/** Devuelve la letra visible de una opción a partir de su índice (0-based). */
export function optionLetter(optionIndex: number): string {
  return OPTION_LETTERS[optionIndex] ?? String(optionIndex + 1);
}
