// types/types.d.ts
declare module 'svgdom-wrapper' {
  import type { Window } from 'svgdom';
  export function makeWindow(): Window;
}

declare module 'nanoid-wrapper' {
  export function generateId(): string;
}