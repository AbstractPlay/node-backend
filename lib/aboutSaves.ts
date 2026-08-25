export const ABOUT_SAVES_PER_DAY_LIMIT = 10;

export type AboutSaveState = {
  aboutSaveDay?: string;
  aboutSaveCount?: number;
};

export type AboutSaveCheckResult =
  | { ok: true; skip: true }
  | { ok: true; skip: false; aboutSaveDay: string; aboutSaveCount: number }
  | { ok: false; message: string };

export function utcDateString(date = new Date()): string {
  return date.toISOString().slice(0, 10);
}

export function checkAboutSaveAllowed(
  previousText: string | undefined,
  newText: string,
  state: AboutSaveState,
  now = new Date(),
): AboutSaveCheckResult {
  const previous = previousText ?? '';
  if (newText === previous) {
    return { ok: true, skip: true };
  }

  const today = utcDateString(now);
  const priorDay = state.aboutSaveDay;
  const priorCount = priorDay === today ? (state.aboutSaveCount ?? 0) : 0;

  if (priorCount >= ABOUT_SAVES_PER_DAY_LIMIT) {
    return {
      ok: false,
      message: 'About save rate limit exceeded. Try again tomorrow.',
    };
  }

  return {
    ok: true,
    skip: false,
    aboutSaveDay: today,
    aboutSaveCount: priorCount + 1,
  };
}
