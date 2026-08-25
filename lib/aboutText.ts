export const ABOUT_MAX_BYTES = 100 * 1024;
export const ABOUT_MAX_URLS = 20;

const HTML_TAG_RE = /<[a-z]/i;
const IMAGE_MARKDOWN_RE = /!\[[^\]]*\]\([^)]*\)/;
const MARKDOWN_LINK_URL_RE = /\[[^\]]*\]\(([^)]+)\)/g;

/** Disallowed control chars except tab, LF, CR. */
const DISALLOWED_CONTROL_RE = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/;

export type AboutTextValidationResult =
  | { ok: true; text: string }
  | { ok: false; message: string };

function countUrls(text: string): number {
  const urls = new Set<string>();
  const httpMatches = text.match(/https?:\/\/[^\s)]+/gi) ?? [];
  for (const match of httpMatches) {
    urls.add(match);
  }
  for (const match of text.matchAll(MARKDOWN_LINK_URL_RE)) {
    const target = match[1]?.trim();
    if (target && /^https?:\/\//i.test(target)) {
      urls.add(target);
    }
  }
  return urls.size;
}

export function aboutTextByteLength(text: string): number {
  return Buffer.byteLength(text, 'utf8');
}

export function validateAboutText(value: unknown): AboutTextValidationResult {
  if (typeof value !== 'string') {
    return { ok: false, message: 'About text must be a string.' };
  }

  if (DISALLOWED_CONTROL_RE.test(value)) {
    return { ok: false, message: 'About text contains disallowed control characters.' };
  }

  if (HTML_TAG_RE.test(value)) {
    return { ok: false, message: 'HTML is not allowed in about text. Use Markdown instead.' };
  }

  if (IMAGE_MARKDOWN_RE.test(value)) {
    return { ok: false, message: 'Images are not allowed in about text.' };
  }

  if (aboutTextByteLength(value) > ABOUT_MAX_BYTES) {
    return { ok: false, message: `About text exceeds the ${ABOUT_MAX_BYTES} byte limit.` };
  }

  if (countUrls(value) > ABOUT_MAX_URLS) {
    return { ok: false, message: `About text may contain at most ${ABOUT_MAX_URLS} links.` };
  }

  return { ok: true, text: value };
}

/** Plain-text snippet for og:description and previews. */
export function aboutTextPlainSnippet(text: string, maxChars = 200): string {
  const plain = text
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[#>*_`~\-]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (plain.length <= maxChars) {
    return plain;
  }
  return `${plain.slice(0, maxChars - 1).trimEnd()}…`;
}
