/**
 * Turns every form of the Turkish I into one letter, one character for one character, so that
 * match positions in the folded text are also positions in the original.
 */
export function foldTurkish(text: string): string {
  return text.replace(/[Iıİ]/g, 'i')
}
