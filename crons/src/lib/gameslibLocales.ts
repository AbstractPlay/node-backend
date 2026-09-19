import { createRequire } from 'module';
import { existsSync, readFileSync } from 'fs';
import path from 'path';
import type { i18n } from 'i18next';

const require = createRequire(import.meta.url);
const gameslibRoot = path.dirname(
  require.resolve('@abstractplay/gameslib/package.json'),
);
const localesPath = path.join(gameslibRoot, 'locales');

const GAMESLIB_NAMESPACES = ['apgames', 'apresults'] as const;

export const GAMESLIB_APGAMES_LANGS = ['en', 'fr', 'de', 'it', 'es-US'] as const;

/** Load gameslib locale JSON from disk (Node 24-safe; no static JSON imports). */
export function loadGameslibLocaleBundles(lang: string): Record<string, object> {
  const bundles: Record<string, object> = {};
  for (const ns of GAMESLIB_NAMESPACES) {
    const filePath = path.join(localesPath, lang, `${ns}.json`);
    if (existsSync(filePath)) {
      bundles[ns] = JSON.parse(readFileSync(filePath, 'utf8'));
    }
  }
  return bundles;
}

/** Register gameslib apgames/apresults bundles on the host i18next instance. */
export function applyGameslibBundlesTo(i18nInstance: i18n): void {
  for (const lng of GAMESLIB_APGAMES_LANGS) {
    const bundles = loadGameslibLocaleBundles(lng);
    for (const [ns, data] of Object.entries(bundles)) {
      i18nInstance.addResourceBundle(lng, ns, data, true, true);
    }
  }
}
