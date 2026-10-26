const DEFAULT_RATINGS_URL = 'https://records.abstractplay.com/_summary-ratings.json';

export { DEFAULT_RATINGS_URL };

/**
 * @param {string} url
 * @returns {Promise<{ generated: string, glickoByGame: { user: string, game: string, glicko: { ratingLow: number } }[] }>}
 */
export async function fetchSummaryRatings(url = DEFAULT_RATINGS_URL) {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to fetch ratings (${res.status}): ${url}`);
  }
  const body = await res.json();
  const tier = body.ratings ?? body;
  const glickoByGame = tier.glickoByGame ?? body.glickoByGame;
  if (!Array.isArray(glickoByGame)) {
    throw new Error('Ratings JSON missing ratings.glickoByGame array');
  }
  const generated = body.generated ?? tier.generated ?? body.ratings?.generated ?? null;
  const glickoMeta = tier.glickoMeta ?? body.glickoMeta;
  const generatedAt = glickoMeta?.generatedAt ?? generated;
  return { generatedAt, glickoByGame };
}

/** @returns {Map<string, number>} key `${userId}\0${gameLabel}` → ratingLow */
export function buildGlickoRatingLowIndex(glickoByGame) {
  const index = new Map();
  for (const row of glickoByGame) {
    if (!row?.user || !row?.game || !row?.glicko) {
      continue;
    }
    const low = row.glicko.ratingLow;
    if (!Number.isFinite(low)) {
      continue;
    }
    index.set(`${row.user}\0${row.game}`, low);
  }
  return index;
}

export function lookupRatingLow(index, userId, gameLabel) {
  const v = index.get(`${userId}\0${gameLabel}`);
  return v === undefined ? null : v;
}
