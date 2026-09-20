/** HTML comment in markdown; invisible on site, marks Discord excerpt cutoff. */
export const DISCORD_EXCERPT_END_MARKER = '<!--ap:discord-excerpt-end-->';

const MARKER_RE = /<!--\s*ap:discord-excerpt-end\s*-->/i;

export function removeDiscordExcerptMarker(body: string): string {
  return body.replace(MARKER_RE, '');
}

export function splitBodyAtDiscordExcerptMarker(body: string): { before: string; hasMarker: boolean } {
  const match = MARKER_RE.exec(body);
  if (!match || match.index === undefined) {
    return { before: body, hasMarker: false };
  }
  return { before: body.slice(0, match.index), hasMarker: true };
}

export function stripMarkdownToPlain(body: string): string {
  return body
    .replace(/!\[[^\]]*]\([^)]+\)/g, '')
    .replace(/\[([^\]]+)]\([^)]+\)/g, '$1')
    .replace(/[*_~`>#]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Plain-text excerpt for Discord mirror.
 * With marker: text before marker (markdown stripped), always suffixed with ….
 * Without marker: first defaultMaxLen chars, … only when truncated.
 */
export function plainTextDiscordExcerpt(body: string, defaultMaxLen = 200): string {
  const { before, hasMarker } = splitBodyAtDiscordExcerptMarker(body);
  if (hasMarker) {
    const text = stripMarkdownToPlain(before);
    if (!text) {
      return '…';
    }
    return `${text}…`;
  }
  let text = stripMarkdownToPlain(body);
  if (text.length > defaultMaxLen) {
    return `${text.slice(0, defaultMaxLen - 1)}…`;
  }
  return text;
}
