/** Fisher–Yates shuffle (in-place). */
export function shuffle<T>(array: T[]): void {
  let i = array.length;
  while (i > 1) {
    const j = Math.floor(Math.random() * i);
    i--;
    const tmp = array[i];
    array[i] = array[j];
    array[j] = tmp;
  }
}
