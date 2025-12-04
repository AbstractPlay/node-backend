// Pure ESM file
import { createSVGWindow } from 'svgdom';

export function makeWindow() {
  const window = createSVGWindow();
  return window;
}
