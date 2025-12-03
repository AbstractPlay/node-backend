// types.d.ts
declare module '../lib/svgdom-wrapper.mjs' {
  import type { Window } from 'svgdom';
  export function makeWindow(): Window;
}

declare module '../lib/nanoid-wrapper.mjs' {
  export function generateId(): string;
}
