import { countryCodeList } from './countryCodeList'

function isoToCountryCode(isoCode: string, keyToGet: 'alpha2' | 'alpha3' | 'numeric' | 'countryName' = 'alpha2'): string|undefined {
  if (isoCode !== undefined) {
    const entry = countryCodeList.find((countryObj) => (
      countryObj.alpha2 === isoCode
      || countryObj.alpha3 === isoCode
      || countryObj.numeric === isoCode
    ));
    if ( (entry !== undefined) && (entry[keyToGet] !== undefined) ) {
        return entry[keyToGet];
    }
    return undefined;
  }
  return undefined;
}

export { isoToCountryCode }
