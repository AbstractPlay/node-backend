import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

/** English gameslib i18n bundles (require — Node 24 ESM needs import attributes for JSON imports). */
export const enApgames = require("@abstractplay/gameslib/locales/en/apgames.json");
export const enApresults = require("@abstractplay/gameslib/locales/en/apresults.json");
