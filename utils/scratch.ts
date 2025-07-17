'use strict';

import { Handler } from "aws-lambda";
import i18n from 'i18next';
import enGames from "../node_modules/@abstractplay/gameslib/locales/en/apgames.json";
import enBack from "../locales/en/apback.json";

export const handler: Handler = async (event: any, context?: any) => {
  await (i18n
  .init({
    ns: ["apback", "apgames"],
    defaultNS: "apback",
    lng: "en",
    fallbackLng: "en",
    debug: true,
    resources: {
        en: {
            apgames: enGames,
            apback: enBack,
        }
    }
  })
  .then((t) => {
    if (!i18n.isInitialized) {
        throw new Error(`i18n is not initialized where it should be!`);
    }
    console.log(t(`apback:EmailOut`));
    console.log(t(`apgames:variants.loa.#board.name`));
    console.log("ALL DONE");
  })
  .catch(err => {
    throw new Error(`An error occurred while initializing i18next:\n${err}`);
  }));
};
