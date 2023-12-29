"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isoToCountryCode = void 0;
const countryCodeList_1 = require("./countryCodeList");
function isoToCountryCode(isoCode, keyToGet = 'alpha2') {
    if (isoCode !== undefined) {
        const entry = countryCodeList_1.countryCodeList.find((countryObj) => (countryObj.alpha2 === isoCode
            || countryObj.alpha3 === isoCode
            || countryObj.numeric === isoCode));
        if ((entry !== undefined) && (entry[keyToGet] !== undefined)) {
            return entry[keyToGet];
        }
        return undefined;
    }
    return undefined;
}
exports.isoToCountryCode = isoToCountryCode;
