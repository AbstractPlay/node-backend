// node_modules/aws-jwt-verify/dist/esm/error.js
var JwtBaseError = class extends Error {
};
var FailedAssertionError = class extends JwtBaseError {
  constructor(msg, actual, expected) {
    super(msg);
    this.failedAssertion = {
      actual,
      expected
    };
  }
};
var JwtParseError = class extends JwtBaseError {
  constructor(msg, error) {
    const message = error != null ? `${msg}: ${error}` : msg;
    super(message);
  }
};
var ParameterValidationError = class extends JwtBaseError {
};
var JwtInvalidSignatureError = class extends JwtBaseError {
};
var JwtInvalidSignatureAlgorithmError = class extends FailedAssertionError {
};
var JwtInvalidClaimError = class extends FailedAssertionError {
  withRawJwt({ header, payload }) {
    this.rawJwt = {
      header,
      payload
    };
    return this;
  }
};
var JwtInvalidIssuerError = class extends JwtInvalidClaimError {
};
var JwtInvalidAudienceError = class extends JwtInvalidClaimError {
};
var JwtInvalidScopeError = class extends JwtInvalidClaimError {
};
var JwtExpiredError = class extends JwtInvalidClaimError {
};
var JwtNotBeforeError = class extends JwtInvalidClaimError {
};
var CognitoJwtInvalidGroupError = class extends JwtInvalidClaimError {
};
var CognitoJwtInvalidTokenUseError = class extends JwtInvalidClaimError {
};
var CognitoJwtInvalidClientIdError = class extends JwtInvalidClaimError {
};
var JwksValidationError = class extends JwtBaseError {
};
var JwkValidationError = class extends JwtBaseError {
};
var JwtWithoutValidKidError = class extends JwtBaseError {
};
var KidNotFoundInJwksError = class extends JwtBaseError {
};
var WaitPeriodNotYetEndedJwkError = class extends JwtBaseError {
};
var JwksNotAvailableInCacheError = class extends JwtBaseError {
};
var JwkInvalidUseError = class extends FailedAssertionError {
};
var JwkInvalidKtyError = class extends FailedAssertionError {
};
var FetchError = class extends JwtBaseError {
  constructor(uri, msg) {
    super(`Failed to fetch ${uri}: ${msg}`);
  }
};
var NonRetryableFetchError = class extends FetchError {
};

// node_modules/aws-jwt-verify/dist/esm/node-web-compat-node.js
import { createPublicKey, createVerify, verify } from "crypto";

// node_modules/aws-jwt-verify/dist/esm/https-node.js
import { request } from "https";
import { pipeline } from "stream";
async function fetch(uri, requestOptions, data) {
  let responseTimeout;
  return new Promise((resolve, reject) => {
    const req = request(uri, {
      method: "GET",
      ...requestOptions
    }, (response) => {
      if (response.statusCode !== 200) {
        done(new NonRetryableFetchError(uri, `Status code is ${response.statusCode}, expected 200`));
        return;
      }
      pipeline(response, async (responseBody) => {
        const chunks = [];
        for await (const chunk of responseBody) {
          chunks.push(chunk);
        }
        return Buffer.concat(chunks);
      }, done);
    });
    if (requestOptions?.responseTimeout) {
      responseTimeout = setTimeout(() => done(new FetchError(uri, `Response time-out (after ${requestOptions.responseTimeout} ms.)`)), requestOptions.responseTimeout);
      responseTimeout.unref();
    }
    function done(err, data2) {
      if (responseTimeout)
        clearTimeout(responseTimeout);
      if (err == null) {
        resolve(data2);
        return;
      }
      req.socket?.emit("agentRemove");
      if (!(err instanceof FetchError)) {
        err = new FetchError(uri, err.message);
      }
      req.destroy();
      reject(err);
    }
    req.on("error", done);
    req.end(data);
  });
}

// node_modules/aws-jwt-verify/dist/esm/node-web-compat-node.js
var JwtSignatureAlgorithmHashNames;
(function(JwtSignatureAlgorithmHashNames2) {
  JwtSignatureAlgorithmHashNames2["RS256"] = "RSA-SHA256";
  JwtSignatureAlgorithmHashNames2["RS384"] = "RSA-SHA384";
  JwtSignatureAlgorithmHashNames2["RS512"] = "RSA-SHA512";
  JwtSignatureAlgorithmHashNames2["ES256"] = "RSA-SHA256";
  JwtSignatureAlgorithmHashNames2["ES384"] = "RSA-SHA384";
  JwtSignatureAlgorithmHashNames2["ES512"] = "RSA-SHA512";
})(JwtSignatureAlgorithmHashNames || (JwtSignatureAlgorithmHashNames = {}));
var nodeWebCompat = {
  fetch,
  transformJwkToKeyObjectSync: (jwk) => createPublicKey({
    key: jwk,
    format: "jwk"
  }),
  transformJwkToKeyObjectAsync: async (jwk) => createPublicKey({
    key: jwk,
    format: "jwk"
  }),
  parseB64UrlString: (b64) => Buffer.from(b64, "base64").toString("utf8"),
  verifySignatureSync: ({ alg, keyObject, jwsSigningInput, signature }) => alg !== "EdDSA" ? (
    // eslint-disable-next-line security/detect-object-injection
    createVerify(JwtSignatureAlgorithmHashNames[alg]).update(jwsSigningInput).verify({
      key: keyObject,
      dsaEncoding: "ieee-p1363"
      // Signature format r || s (not used for RSA)
    }, signature, "base64")
  ) : verify(null, Buffer.from(jwsSigningInput), keyObject, Buffer.from(signature, "base64")),
  verifySignatureAsync: async (args) => nodeWebCompat.verifySignatureSync(args),
  defaultFetchTimeouts: {
    socketIdle: 1500,
    response: 3e3
  },
  setTimeoutUnref: (...args) => setTimeout(...args).unref(),
  transformPemToJwk: async (pem) => {
    return createPublicKey({
      key: Buffer.from(pem),
      format: "pem"
    }).export({
      format: "jwk"
    });
  }
};

// node_modules/aws-jwt-verify/dist/esm/https.js
var fetch2 = nodeWebCompat.fetch.bind(void 0);
var SimpleFetcher = class {
  constructor(props) {
    this.defaultRequestOptions = {
      timeout: nodeWebCompat.defaultFetchTimeouts.socketIdle,
      responseTimeout: nodeWebCompat.defaultFetchTimeouts.response,
      ...props?.defaultRequestOptions
    };
  }
  /**
   * Execute a HTTPS request (with 1 immediate retry in case of errors)
   * @param uri - The URI
   * @param requestOptions - The RequestOptions to use (depending on the runtime context, either Node.js RequestOptions or Web Fetch init)
   * @param data - Data to send to the URI (e.g. POST data)
   * @returns - The response body as ArrayBuffer
   */
  async fetch(uri, requestOptions, data) {
    requestOptions = { ...this.defaultRequestOptions, ...requestOptions };
    try {
      return await fetch2(uri, requestOptions, data);
    } catch (err) {
      if (err instanceof NonRetryableFetchError) {
        throw err;
      }
      return fetch2(uri, requestOptions, data);
    }
  }
};

// node_modules/aws-jwt-verify/dist/esm/safe-json-parse.js
function isJsonObject(j) {
  return typeof j === "object" && !Array.isArray(j) && j !== null;
}
function safeJsonParse(s) {
  return JSON.parse(s, (_, value) => {
    if (typeof value === "object" && !Array.isArray(value) && value !== null) {
      delete value.__proto__;
      delete value.constructor;
    }
    return value;
  });
}

// node_modules/aws-jwt-verify/dist/esm/assert.js
function assertStringEquals(name, actual, expected, errorConstructor = FailedAssertionError) {
  if (!actual) {
    throw new errorConstructor(`Missing ${name}. Expected: ${expected}`, actual, expected);
  }
  if (typeof actual !== "string") {
    throw new errorConstructor(`${name} is not of type string`, actual, expected);
  }
  if (expected !== actual) {
    throw new errorConstructor(`${name} not allowed: ${actual}. Expected: ${expected}`, actual, expected);
  }
}
function assertStringArrayContainsString(name, actual, expected, errorConstructor = FailedAssertionError) {
  if (!actual) {
    throw new errorConstructor(`Missing ${name}. ${expectationMessage(expected)}`, actual, expected);
  }
  if (typeof actual !== "string") {
    throw new errorConstructor(`${name} is not of type string`, actual, expected);
  }
  return assertStringArraysOverlap(name, actual, expected, errorConstructor);
}
function assertStringArraysOverlap(name, actual, expected, errorConstructor = FailedAssertionError) {
  if (!actual) {
    throw new errorConstructor(`Missing ${name}. ${expectationMessage(expected)}`, actual, expected);
  }
  const expectedAsSet = new Set(Array.isArray(expected) ? expected : [expected]);
  if (typeof actual === "string") {
    actual = [actual];
  }
  if (!Array.isArray(actual)) {
    throw new errorConstructor(`${name} is not an array`, actual, expected);
  }
  const overlaps = actual.some((actualItem) => {
    if (typeof actualItem !== "string") {
      throw new errorConstructor(`${name} includes elements that are not of type string`, actual, expected);
    }
    return expectedAsSet.has(actualItem);
  });
  if (!overlaps) {
    throw new errorConstructor(`${name} not allowed: ${actual.join(", ")}. ${expectationMessage(expected)}`, actual, expected);
  }
}
function expectationMessage(expected) {
  if (Array.isArray(expected)) {
    if (expected.length > 1) {
      return `Expected one of: ${expected.join(", ")}`;
    }
    return `Expected: ${expected[0]}`;
  }
  return `Expected: ${expected}`;
}
function assertIsNotPromise(actual, errorFactory) {
  if (actual && typeof actual.then === "function") {
    throw errorFactory();
  }
}

// node_modules/aws-jwt-verify/dist/esm/jwk.js
var optionalJwkFieldNames = [
  "use",
  // https://datatracker.ietf.org/doc/html/rfc7517#section-4.2
  "alg",
  // https://datatracker.ietf.org/doc/html/rfc7517#section-4.4
  "kid",
  // https://datatracker.ietf.org/doc/html/rfc7517#section-4.5
  "n",
  // https://datatracker.ietf.org/doc/html/rfc7518#section-6.3.1.1
  "e",
  // https://datatracker.ietf.org/doc/html/rfc7518#section-6.3.1.2
  "x",
  // https://datatracker.ietf.org/doc/html/rfc7518#section-6.2.1.2
  "y",
  // https://datatracker.ietf.org/doc/html/rfc7518#section-6.2.1.3
  "crv"
  //https:// datatracker.ietf.org/doc/html/rfc7518#section-6.2.1.1
];
var mandatoryJwkFieldNames = [
  "kty"
  // https://datatracker.ietf.org/doc/html/rfc7517#section-4.1
];
function findJwkInJwks(jwks, kid) {
  return jwks.keys.find((jwk) => jwk.kid != null && jwk.kid === kid);
}
var parseJwks = function(jwksBin) {
  let jwks;
  try {
    const jwksText = new TextDecoder("utf8", {
      fatal: true,
      ignoreBOM: true
    }).decode(jwksBin);
    jwks = safeJsonParse(jwksText);
  } catch (err) {
    throw new JwksValidationError(`JWKS could not be parsed as JSON: ${err}`);
  }
  assertIsJwks(jwks);
  return jwks;
};
function assertIsJwks(jwks) {
  if (!jwks) {
    throw new JwksValidationError("JWKS empty");
  }
  if (!isJsonObject(jwks)) {
    throw new JwksValidationError("JWKS should be an object");
  }
  if (!Object.keys(jwks).includes("keys")) {
    throw new JwksValidationError("JWKS does not include keys");
  }
  if (!Array.isArray(jwks.keys)) {
    throw new JwksValidationError("JWKS keys should be an array");
  }
  for (const jwk of jwks.keys) {
    assertIsJwk(jwk);
  }
}
function assertIsSignatureJwk(jwk) {
  assertStringArrayContainsString("JWK kty", jwk.kty, ["EC", "RSA", "OKP"], JwkInvalidKtyError);
  if (jwk.kty === "EC") {
    assertIsEsSignatureJwk(jwk);
  } else if (jwk.kty === "RSA") {
    assertIsRsaSignatureJwk(jwk);
  } else if (jwk.kty === "OKP") {
    assertIsEdDSASignatureJwk(jwk);
  }
}
function assertIsEdDSASignatureJwk(jwk) {
  if (jwk.use) {
    assertStringEquals("JWK use", jwk.use, "sig", JwkInvalidUseError);
  }
  assertStringEquals("JWK kty", jwk.kty, "OKP", JwkInvalidKtyError);
  if (!jwk.crv)
    throw new JwkValidationError("Missing Curve (crv)");
  if (!jwk.x)
    throw new JwkValidationError("Missing X Coordinate (x)");
}
function assertIsEsSignatureJwk(jwk) {
  if (jwk.use) {
    assertStringEquals("JWK use", jwk.use, "sig", JwkInvalidUseError);
  }
  assertStringEquals("JWK kty", jwk.kty, "EC", JwkInvalidKtyError);
  if (!jwk.crv)
    throw new JwkValidationError("Missing Curve (crv)");
  if (!jwk.x)
    throw new JwkValidationError("Missing X Coordinate (x)");
  if (!jwk.y)
    throw new JwkValidationError("Missing Y Coordinate (y)");
}
function assertIsRsaSignatureJwk(jwk) {
  if (jwk.use) {
    assertStringEquals("JWK use", jwk.use, "sig", JwkInvalidUseError);
  }
  assertStringEquals("JWK kty", jwk.kty, "RSA", JwkInvalidKtyError);
  if (!jwk.n)
    throw new JwkValidationError("Missing modulus (n)");
  if (!jwk.e)
    throw new JwkValidationError("Missing exponent (e)");
}
function assertIsJwk(jwk) {
  if (!jwk) {
    throw new JwkValidationError("JWK empty");
  }
  if (!isJsonObject(jwk)) {
    throw new JwkValidationError("JWK should be an object");
  }
  for (const field of mandatoryJwkFieldNames) {
    if (typeof jwk[field] !== "string") {
      throw new JwkValidationError(`JWK ${field} should be a string`);
    }
  }
  for (const field of optionalJwkFieldNames) {
    if (field in jwk && typeof jwk[field] !== "string") {
      throw new JwkValidationError(`JWK ${field} should be a string`);
    }
  }
}
function isJwks(jwks) {
  try {
    assertIsJwks(jwks);
    return true;
  } catch {
    return false;
  }
}
function isJwk(jwk) {
  try {
    assertIsJwk(jwk);
    return true;
  } catch {
    return false;
  }
}
var SimplePenaltyBox = class {
  constructor(props) {
    this.waitingUris = /* @__PURE__ */ new Map();
    this.waitSeconds = props?.waitSeconds ?? 10;
  }
  async wait(jwksUri) {
    if (this.waitingUris.has(jwksUri)) {
      throw new WaitPeriodNotYetEndedJwkError("Not allowed to fetch JWKS yet, still waiting for back off period to end");
    }
  }
  release(jwksUri) {
    const i = this.waitingUris.get(jwksUri);
    if (i) {
      clearTimeout(i);
      this.waitingUris.delete(jwksUri);
    }
  }
  registerFailedAttempt(jwksUri) {
    const i = nodeWebCompat.setTimeoutUnref(() => {
      this.waitingUris.delete(jwksUri);
    }, this.waitSeconds * 1e3);
    this.waitingUris.set(jwksUri, i);
  }
  registerSuccessfulAttempt(jwksUri) {
    this.release(jwksUri);
  }
};
var SimpleJwksCache = class {
  constructor(props) {
    this.jwksCache = /* @__PURE__ */ new Map();
    this.fetchingJwks = /* @__PURE__ */ new Map();
    this.penaltyBox = props?.penaltyBox ?? new SimplePenaltyBox();
    this.fetcher = props?.fetcher ?? new SimpleFetcher();
    this.jwksParser = props?.jwksParser ?? parseJwks;
  }
  /**
   * Add a JWKS to the cache explicitly. E.g. you may want to do this, if you have already downloaded the JWKS.
   *
   * @param jwksUri - The URI where your IDP exposes the JWKS, e.g. `https://example.com/my-idp/.well-known/jwks.json` (this is used as cache key)
   * @param jwks - The JWKS
   */
  addJwks(jwksUri, jwks) {
    this.jwksCache.set(jwksUri, jwks);
  }
  /**
   * Fetch and cache the JWKS from the jwksUri
   *
   * @param jwksUri - The URI where your IDP exposes the JWKS, e.g. `https://example.com/my-idp/.well-known/jwks.json`
   * @returns - The fetched jwks
   */
  async getJwks(jwksUri) {
    const existingFetch = this.fetchingJwks.get(jwksUri);
    if (existingFetch) {
      return existingFetch;
    }
    const jwksPromise = this.fetcher.fetch(jwksUri).then(this.jwksParser);
    this.fetchingJwks.set(jwksUri, jwksPromise);
    let jwks;
    try {
      jwks = await jwksPromise;
    } finally {
      this.fetchingJwks.delete(jwksUri);
    }
    this.jwksCache.set(jwksUri, jwks);
    return jwks;
  }
  /**
   * Get the JWKS from the cache (synchronously). Raises an error if the JWKS is not yet cached, or does not have the right JWK.
   *
   * @param jwksUri - The URI where your IDP exposes the JWKS, e.g. `https://example.com/my-idp/.well-known/jwks.json` (this is used as cache key)
   * @param decomposedJwt - The decomposed JWT
   * @returns - The previously cached JWKS
   */
  getCachedJwk(jwksUri, decomposedJwt) {
    if (typeof decomposedJwt.header.kid !== "string") {
      throw new JwtWithoutValidKidError("JWT header does not have valid kid claim");
    }
    if (!this.jwksCache.has(jwksUri)) {
      throw new JwksNotAvailableInCacheError(`JWKS for uri ${jwksUri} not yet available in cache`);
    }
    const jwk = findJwkInJwks(this.jwksCache.get(jwksUri), decomposedJwt.header.kid);
    if (!jwk) {
      throw new KidNotFoundInJwksError(`JWK for kid ${decomposedJwt.header.kid} not found in the JWKS`);
    }
    return jwk;
  }
  /**
   * Get the right JWK to verify the JWT with. This will fetch (and cache) the JWKS in case it's not yet been cached,
   * or if the cached JWKS doesn't have the right JWK (to account for key rotations, based on `kid`).
   *
   * @param jwksUri
   * @param decomposedJwt
   * @returns  - The JWK
   */
  async getJwk(jwksUri, decomposedJwt) {
    if (typeof decomposedJwt.header.kid !== "string") {
      throw new JwtWithoutValidKidError("JWT header does not have valid kid claim");
    }
    const cachedJwks = this.jwksCache.get(jwksUri);
    if (cachedJwks) {
      const cachedJwk = findJwkInJwks(cachedJwks, decomposedJwt.header.kid);
      if (cachedJwk) {
        return cachedJwk;
      }
    }
    await this.penaltyBox.wait(jwksUri, decomposedJwt.header.kid);
    const jwks = await this.getJwks(jwksUri);
    const jwk = findJwkInJwks(jwks, decomposedJwt.header.kid);
    if (!jwk) {
      this.penaltyBox.registerFailedAttempt(jwksUri, decomposedJwt.header.kid);
      throw new KidNotFoundInJwksError(`JWK for kid "${decomposedJwt.header.kid}" not found in the JWKS`);
    } else {
      this.penaltyBox.registerSuccessfulAttempt(jwksUri, decomposedJwt.header.kid);
    }
    return jwk;
  }
};

// node_modules/aws-jwt-verify/dist/esm/jwt.js
function assertJwtHeader(header) {
  if (!isJsonObject(header)) {
    throw new JwtParseError("JWT header is not an object");
  }
  if (header.alg !== void 0 && typeof header.alg !== "string") {
    throw new JwtParseError("JWT header alg claim is not a string");
  }
  if (header.kid !== void 0 && typeof header.kid !== "string") {
    throw new JwtParseError("JWT header kid claim is not a string");
  }
}
function assertJwtPayload(payload) {
  if (!isJsonObject(payload)) {
    throw new JwtParseError("JWT payload is not an object");
  }
  if (payload.exp !== void 0 && !Number.isFinite(payload.exp)) {
    throw new JwtParseError("JWT payload exp claim is not a number");
  }
  if (payload.iss !== void 0 && typeof payload.iss !== "string") {
    throw new JwtParseError("JWT payload iss claim is not a string");
  }
  if (payload.sub !== void 0 && typeof payload.sub !== "string") {
    throw new JwtParseError("JWT payload sub claim is not a string");
  }
  if (payload.aud !== void 0 && typeof payload.aud !== "string" && (!Array.isArray(payload.aud) || payload.aud.some((aud) => typeof aud !== "string"))) {
    throw new JwtParseError("JWT payload aud claim is not a string or array of strings");
  }
  if (payload.nbf !== void 0 && !Number.isFinite(payload.nbf)) {
    throw new JwtParseError("JWT payload nbf claim is not a number");
  }
  if (payload.iat !== void 0 && !Number.isFinite(payload.iat)) {
    throw new JwtParseError("JWT payload iat claim is not a number");
  }
  if (payload.scope !== void 0 && typeof payload.scope !== "string") {
    throw new JwtParseError("JWT payload scope claim is not a string");
  }
  if (payload.jti !== void 0 && typeof payload.jti !== "string") {
    throw new JwtParseError("JWT payload jti claim is not a string");
  }
}
var JWT_REGEX = /^[A-Za-z0-9_-]+={0,2}\.[A-Za-z0-9_-]+={0,2}\.[A-Za-z0-9_-]+={0,2}$/;
function decomposeUnverifiedJwt(jwt) {
  if (!jwt) {
    throw new JwtParseError("Empty JWT");
  }
  if (typeof jwt !== "string") {
    throw new JwtParseError("JWT is not a string");
  }
  if (!JWT_REGEX.test(jwt)) {
    throw new JwtParseError("JWT string does not consist of exactly 3 parts (header, payload, signature)");
  }
  const [headerB64, payloadB64, signatureB64] = jwt.split(".");
  const [headerString, payloadString] = [headerB64, payloadB64].map(nodeWebCompat.parseB64UrlString);
  let header;
  try {
    header = safeJsonParse(headerString);
  } catch (err) {
    throw new JwtParseError("Invalid JWT. Header is not a valid JSON object", err);
  }
  assertJwtHeader(header);
  let payload;
  try {
    payload = safeJsonParse(payloadString);
  } catch (err) {
    throw new JwtParseError("Invalid JWT. Payload is not a valid JSON object", err);
  }
  assertJwtPayload(payload);
  return {
    header,
    headerB64,
    payload,
    payloadB64,
    signatureB64
  };
}
function validateJwtFields(payload, options) {
  if (payload.exp !== void 0) {
    if (payload.exp + (options.graceSeconds ?? 0) < Date.now() / 1e3) {
      throw new JwtExpiredError(`Token expired at ${new Date(payload.exp * 1e3).toISOString()}`, payload.exp);
    }
  }
  if (payload.nbf !== void 0) {
    if (payload.nbf - (options.graceSeconds ?? 0) > Date.now() / 1e3) {
      throw new JwtNotBeforeError(`Token can't be used before ${new Date(payload.nbf * 1e3).toISOString()}`, payload.nbf);
    }
  }
  if (options.issuer !== null) {
    if (options.issuer === void 0) {
      throw new ParameterValidationError("issuer must be provided or set to null explicitly");
    }
    assertStringArrayContainsString("Issuer", payload.iss, options.issuer, JwtInvalidIssuerError);
  }
  if (options.audience !== null) {
    if (options.audience === void 0) {
      throw new ParameterValidationError("audience must be provided or set to null explicitly");
    }
    assertStringArraysOverlap("Audience", payload.aud, options.audience, JwtInvalidAudienceError);
  }
  if (options.scope != null) {
    assertStringArraysOverlap("Scope", payload.scope?.split(" "), options.scope, JwtInvalidScopeError);
  }
}

// node_modules/aws-jwt-verify/dist/esm/jwt-verifier.js
var supportedSignatureAlgorithms = [
  "RS256",
  "RS384",
  "RS512",
  "ES256",
  "ES384",
  "ES512",
  "EdDSA"
];
function validateJwtHeaderAndJwk(header, jwk) {
  assertIsSignatureJwk(jwk);
  if (jwk.alg) {
    assertStringEquals("JWT signature algorithm", header.alg, jwk.alg, JwtInvalidSignatureAlgorithmError);
  }
  assertStringArrayContainsString("JWT signature algorithm", header.alg, supportedSignatureAlgorithms, JwtInvalidSignatureAlgorithmError);
}
async function verifyDecomposedJwt(decomposedJwt, jwksUri, options, jwkFetcher, transformJwkToKeyObjectFn) {
  const { header, headerB64, payload, payloadB64, signatureB64 } = decomposedJwt;
  const jwk = await jwkFetcher(jwksUri, decomposedJwt);
  validateJwtHeaderAndJwk(decomposedJwt.header, jwk);
  const keyObject = await transformJwkToKeyObjectFn(jwk, header.alg, payload.iss);
  const valid = await nodeWebCompat.verifySignatureAsync({
    jwsSigningInput: `${headerB64}.${payloadB64}`,
    signature: signatureB64,
    alg: header.alg,
    keyObject
  });
  if (!valid) {
    throw new JwtInvalidSignatureError("Invalid signature");
  }
  try {
    validateJwtFields(payload, options);
    if (options.customJwtCheck) {
      await options.customJwtCheck({ header, payload, jwk });
    }
  } catch (err) {
    if (options.includeRawJwtInErrors && err instanceof JwtInvalidClaimError) {
      throw err.withRawJwt(decomposedJwt);
    }
    throw err;
  }
  return payload;
}
function verifyDecomposedJwtSync(decomposedJwt, jwkOrJwks, options, transformJwkToKeyObjectFn) {
  const { header, headerB64, payload, payloadB64, signatureB64 } = decomposedJwt;
  let jwk;
  if (isJwk(jwkOrJwks)) {
    jwk = jwkOrJwks;
  } else if (isJwks(jwkOrJwks)) {
    const locatedJwk = header.kid ? findJwkInJwks(jwkOrJwks, header.kid) : void 0;
    if (!locatedJwk) {
      throw new KidNotFoundInJwksError(`JWK for kid ${header.kid} not found in the JWKS`);
    }
    jwk = locatedJwk;
  } else {
    throw new ParameterValidationError([
      `Expected a valid JWK or JWKS (parsed as JavaScript object), but received: ${jwkOrJwks}.`,
      "If you're passing a JWKS URI, use the async verify() method instead, it will download and parse the JWKS for you"
    ].join());
  }
  validateJwtHeaderAndJwk(decomposedJwt.header, jwk);
  const keyObject = transformJwkToKeyObjectFn(jwk, header.alg, payload.iss);
  const valid = nodeWebCompat.verifySignatureSync({
    jwsSigningInput: `${headerB64}.${payloadB64}`,
    signature: signatureB64,
    alg: header.alg,
    keyObject
  });
  if (!valid) {
    throw new JwtInvalidSignatureError("Invalid signature");
  }
  try {
    validateJwtFields(payload, options);
    if (options.customJwtCheck) {
      const res = options.customJwtCheck({ header, payload, jwk });
      assertIsNotPromise(res, () => new ParameterValidationError("Custom JWT checks must be synchronous but a promise was returned"));
    }
  } catch (err) {
    if (options.includeRawJwtInErrors && err instanceof JwtInvalidClaimError) {
      throw err.withRawJwt(decomposedJwt);
    }
    throw err;
  }
  return payload;
}
var JwtVerifierBase = class {
  constructor(verifyProperties, jwksCache = new SimpleJwksCache()) {
    this.jwksCache = jwksCache;
    this.issuersConfig = /* @__PURE__ */ new Map();
    this.publicKeyCache = new KeyObjectCache();
    if (Array.isArray(verifyProperties)) {
      if (!verifyProperties.length) {
        throw new ParameterValidationError("Provide at least one issuer configuration");
      }
      verifyProperties.forEach((prop, index) => {
        if (this.issuersConfig.has(prop.issuer)) {
          throw new ParameterValidationError(`issuer ${prop.issuer} supplied multiple times`);
        } else if (prop.issuer === null && verifyProperties.length >= 2) {
          throw new ParameterValidationError(`issuer cannot be null when multiple issuers are supplied (at issuer: ${index})`);
        }
        this.issuersConfig.set(prop.issuer, this.withJwksUri(prop));
      });
    } else {
      this.issuersConfig.set(verifyProperties.issuer, this.withJwksUri(verifyProperties));
    }
  }
  getIssuerConfig(issuer) {
    if (this.issuersConfig.size === 1) {
      issuer = this.issuersConfig.keys().next().value;
    }
    if (issuer === void 0) {
      throw new ParameterValidationError("issuer must be provided");
    }
    const config = this.issuersConfig.get(issuer);
    if (!config) {
      throw new ParameterValidationError(`issuer not configured: ${issuer}`);
    }
    return config;
  }
  /**
   * This method loads a JWKS that you provide, into the JWKS cache, so that it is
   * available for JWT verification. Use this method to speed up the first JWT verification
   * (when the JWKS would otherwise have to be downloaded from the JWKS uri), or to provide the JWKS
   * in case the JwtVerifier does not have internet access to download the JWKS
   *
   * @param jwksThe JWKS
   * @param issuer The issuer for which you want to cache the JWKS
   *  Supply this field, if you instantiated the JwtVerifier with multiple issuers
   * @returns void
   */
  cacheJwks(...[jwks, issuer]) {
    const issuerConfig = this.getIssuerConfig(issuer);
    this.jwksCache.addJwks(issuerConfig.jwksUri, jwks);
    this.publicKeyCache.clearCache(issuerConfig.issuer);
  }
  /**
   * Hydrate the JWKS cache for (all of) the configured issuer(s).
   * This will fetch and cache the latest and greatest JWKS for concerned issuer(s).
   *
   * @returns void
   */
  async hydrate() {
    const jwksFetches = Array.from(this.issuersConfig.values()).map(({ jwksUri }) => this.jwksCache.getJwks(jwksUri));
    await Promise.all(jwksFetches);
  }
  /**
   * Verify (synchronously) a JWT.
   *
   * @param jwt The JWT, as string
   * @param props Verification properties
   * @returns The payload of the JWT––if the JWT is valid, otherwise an error is thrown
   */
  verifySync(...[jwt, properties]) {
    const { decomposedJwt, jwksUri, verifyProperties } = this.getVerifyParameters(jwt, properties);
    return this.verifyDecomposedJwtSync(decomposedJwt, jwksUri, verifyProperties);
  }
  /**
   * Verify (synchronously) an already decomposed JWT.
   *
   * @param decomposedJwt The decomposed Jwt
   * @param jwk The JWK to verify the JWTs signature with
   * @param verifyProperties The properties to use for verification
   * @returns The payload of the JWT––if the JWT is valid, otherwise an error is thrown
   */
  verifyDecomposedJwtSync(decomposedJwt, jwksUri, verifyProperties) {
    const jwk = this.jwksCache.getCachedJwk(jwksUri, decomposedJwt);
    return verifyDecomposedJwtSync(decomposedJwt, jwk, verifyProperties, this.publicKeyCache.transformJwkToKeyObjectSync.bind(this.publicKeyCache));
  }
  /**
   * Verify (asynchronously) a JWT.
   * This call is asynchronous, and the JWKS will be fetched from the JWKS uri,
   * in case it is not yet available in the cache.
   *
   * @param jwt The JWT, as string
   * @param props Verification properties
   * @returns Promise that resolves to the payload of the JWT––if the JWT is valid, otherwise the promise rejects
   */
  async verify(...[jwt, properties]) {
    const { decomposedJwt, jwksUri, verifyProperties } = this.getVerifyParameters(jwt, properties);
    return this.verifyDecomposedJwt(decomposedJwt, jwksUri, verifyProperties);
  }
  /**
   * Verify (asynchronously) an already decomposed JWT.
   *
   * @param decomposedJwt The decomposed Jwt
   * @param jwk The JWK to verify the JWTs signature with
   * @param verifyProperties The properties to use for verification
   * @returns The payload of the JWT––if the JWT is valid, otherwise an error is thrown
   */
  verifyDecomposedJwt(decomposedJwt, jwksUri, verifyProperties) {
    return verifyDecomposedJwt(decomposedJwt, jwksUri, verifyProperties, this.jwksCache.getJwk.bind(this.jwksCache), this.publicKeyCache.transformJwkToKeyObjectAsync.bind(this.publicKeyCache));
  }
  /**
   * Get the verification parameters to use, by merging the issuer configuration,
   * with the overriding properties that are now provided
   *
   * @param jwt: the JWT that is going to be verified
   * @param verifyProperties: the overriding properties, that override the issuer configuration
   * @returns The merged verification parameters
   */
  getVerifyParameters(jwt, verifyProperties) {
    const decomposedJwt = decomposeUnverifiedJwt(jwt);
    const issuerConfig = this.getIssuerConfig(decomposedJwt.payload.iss);
    return {
      decomposedJwt,
      jwksUri: issuerConfig.jwksUri,
      verifyProperties: {
        ...issuerConfig,
        ...verifyProperties
      }
    };
  }
  /**
   * Get issuer config with JWKS URI, by adding a default JWKS URI if needed
   *
   * @param config: the issuer config.
   * @returns The config with JWKS URI
   */
  withJwksUri(config) {
    if (config.jwksUri) {
      return config;
    }
    const issuer = config.issuer;
    if (!issuer) {
      throw new ParameterValidationError("jwksUri must be provided for issuer null");
    }
    const issuerUri = new URL(issuer).pathname.replace(/\/$/, "");
    return {
      jwksUri: new URL(`${issuerUri}/.well-known/jwks.json`, issuer).href,
      ...config
    };
  }
};
var KeyObjectCache = class {
  constructor(transformJwkToKeyObjectSyncFn = nodeWebCompat.transformJwkToKeyObjectSync, transformJwkToKeyObjectAsyncFn = nodeWebCompat.transformJwkToKeyObjectAsync) {
    this.transformJwkToKeyObjectSyncFn = transformJwkToKeyObjectSyncFn;
    this.transformJwkToKeyObjectAsyncFn = transformJwkToKeyObjectAsyncFn;
    this.publicKeys = /* @__PURE__ */ new Map();
  }
  /**
   * Transform the JWK into a public key in native key object format.
   * If the transformed JWK is already in the cache, it is returned from the cache instead.
   *
   * @param jwk: the JWK
   * @param jwtHeaderAlg: the alg from the JWT header (used if absent on JWK)
   * @param issuer: the issuer that uses the JWK for signing JWTs (used for caching the transformation)
   * @returns the public key in native key object format
   */
  transformJwkToKeyObjectSync(jwk, jwtHeaderAlg, issuer) {
    const alg = jwk.alg ?? jwtHeaderAlg;
    if (!issuer || !jwk.kid || !alg) {
      return this.transformJwkToKeyObjectSyncFn(jwk, alg, issuer);
    }
    const fromCache = this.publicKeys.get(issuer)?.get(jwk.kid)?.get(alg);
    if (fromCache)
      return fromCache;
    const publicKey = this.transformJwkToKeyObjectSyncFn(jwk, alg, issuer);
    this.putKeyObjectInCache(issuer, jwk.kid, alg, publicKey);
    return publicKey;
  }
  /**
   * Transform the JWK into a public key in native key object format (async).
   * If the transformed JWK is already in the cache, it is returned from the cache instead.
   *
   * @param jwk: the JWK
   * @param jwtHeaderAlg: the alg from the JWT header (used if absent on JWK)
   * @param issuer: the issuer that uses the JWK for signing JWTs (used for caching the transformation)
   * @returns the public key in native key object format
   */
  async transformJwkToKeyObjectAsync(jwk, jwtHeaderAlg, issuer) {
    const alg = jwk.alg ?? jwtHeaderAlg;
    if (!issuer || !jwk.kid || !alg) {
      return this.transformJwkToKeyObjectAsyncFn(jwk, alg, issuer);
    }
    const fromCache = this.publicKeys.get(issuer)?.get(jwk.kid)?.get(alg);
    if (fromCache)
      return fromCache;
    const publicKey = await this.transformJwkToKeyObjectAsyncFn(jwk, alg, issuer);
    this.putKeyObjectInCache(issuer, jwk.kid, alg, publicKey);
    return publicKey;
  }
  putKeyObjectInCache(issuer, kid, alg, publicKey) {
    const cachedIssuer = this.publicKeys.get(issuer);
    const cachedIssuerKid = cachedIssuer?.get(kid);
    if (cachedIssuerKid) {
      cachedIssuerKid.set(alg, publicKey);
    } else if (cachedIssuer) {
      cachedIssuer.set(kid, /* @__PURE__ */ new Map([[alg, publicKey]]));
    } else {
      this.publicKeys.set(issuer, /* @__PURE__ */ new Map([[kid, /* @__PURE__ */ new Map([[alg, publicKey]])]]));
    }
  }
  clearCache(issuer) {
    this.publicKeys.delete(issuer);
  }
};

// node_modules/aws-jwt-verify/dist/esm/cognito-verifier.js
function validateCognitoJwtFields(payload, options) {
  if (options.groups != null) {
    assertStringArraysOverlap("Cognito group", payload["cognito:groups"], options.groups, CognitoJwtInvalidGroupError);
  }
  assertStringArrayContainsString("Token use", payload.token_use, ["id", "access"], CognitoJwtInvalidTokenUseError);
  if (options.tokenUse !== null) {
    if (options.tokenUse === void 0) {
      throw new ParameterValidationError("tokenUse must be provided or set to null explicitly");
    }
    assertStringEquals("Token use", payload.token_use, options.tokenUse, CognitoJwtInvalidTokenUseError);
  }
  if (options.clientId !== null) {
    if (options.clientId === void 0) {
      throw new ParameterValidationError("clientId must be provided or set to null explicitly");
    }
    if (payload.token_use === "id") {
      assertStringArrayContainsString('Client ID ("audience")', payload.aud, options.clientId, CognitoJwtInvalidClientIdError);
    } else {
      assertStringArrayContainsString("Client ID", payload.client_id, options.clientId, CognitoJwtInvalidClientIdError);
    }
  }
}
var CognitoJwtVerifier = class extends JwtVerifierBase {
  constructor(props, jwksCache) {
    const issuerConfig = Array.isArray(props) ? props.map((p) => ({
      ...p,
      ...CognitoJwtVerifier.parseUserPoolId(p.userPoolId),
      audience: null
      // checked instead by validateCognitoJwtFields
    })) : {
      ...props,
      ...CognitoJwtVerifier.parseUserPoolId(props.userPoolId),
      audience: null
      // checked instead by validateCognitoJwtFields
    };
    super(issuerConfig, jwksCache);
  }
  /**
   * Parse a User Pool ID, to extract the issuer and JWKS URI
   *
   * @param userPoolId The User Pool ID
   * @returns The issuer and JWKS URI for the User Pool
   */
  static parseUserPoolId(userPoolId) {
    const match = userPoolId.match(this.USER_POOL_ID_REGEX);
    if (!match) {
      throw new ParameterValidationError(`Invalid Cognito User Pool ID: ${userPoolId}`);
    }
    const region = match.groups.region;
    const issuer = `https://cognito-idp.${region}.amazonaws.com/${userPoolId}`;
    return {
      issuer,
      jwksUri: `${issuer}/.well-known/jwks.json`
    };
  }
  static create(verifyProperties, additionalProperties) {
    return new this(verifyProperties, additionalProperties?.jwksCache);
  }
  /**
   * Verify (synchronously) a JWT that is signed by Amazon Cognito.
   *
   * @param jwt The JWT, as string
   * @param props Verification properties
   * @returns The payload of the JWT––if the JWT is valid, otherwise an error is thrown
   */
  verifySync(...[jwt, properties]) {
    const { decomposedJwt, jwksUri, verifyProperties } = this.getVerifyParameters(jwt, properties);
    this.verifyDecomposedJwtSync(decomposedJwt, jwksUri, verifyProperties);
    try {
      validateCognitoJwtFields(decomposedJwt.payload, verifyProperties);
    } catch (err) {
      if (verifyProperties.includeRawJwtInErrors && err instanceof JwtInvalidClaimError) {
        throw err.withRawJwt(decomposedJwt);
      }
      throw err;
    }
    return decomposedJwt.payload;
  }
  /**
   * Verify (asynchronously) a JWT that is signed by Amazon Cognito.
   * This call is asynchronous, and the JWKS will be fetched from the JWKS uri,
   * in case it is not yet available in the cache.
   *
   * @param jwt The JWT, as string
   * @param props Verification properties
   * @returns Promise that resolves to the payload of the JWT––if the JWT is valid, otherwise the promise rejects
   */
  async verify(...[jwt, properties]) {
    const { decomposedJwt, jwksUri, verifyProperties } = this.getVerifyParameters(jwt, properties);
    await this.verifyDecomposedJwt(decomposedJwt, jwksUri, verifyProperties);
    try {
      validateCognitoJwtFields(decomposedJwt.payload, verifyProperties);
    } catch (err) {
      if (verifyProperties.includeRawJwtInErrors && err instanceof JwtInvalidClaimError) {
        throw err.withRawJwt(decomposedJwt);
      }
      throw err;
    }
    return decomposedJwt.payload;
  }
  /**
   * This method loads a JWKS that you provide, into the JWKS cache, so that it is
   * available for JWT verification. Use this method to speed up the first JWT verification
   * (when the JWKS would otherwise have to be downloaded from the JWKS uri), or to provide the JWKS
   * in case the JwtVerifier does not have internet access to download the JWKS
   *
   * @param jwks The JWKS
   * @param userPoolId The userPoolId for which you want to cache the JWKS
   *  Supply this field, if you instantiated the CognitoJwtVerifier with multiple userPoolIds
   * @returns void
   */
  cacheJwks(...[jwks, userPoolId]) {
    let issuer;
    if (userPoolId !== void 0) {
      issuer = CognitoJwtVerifier.parseUserPoolId(userPoolId).issuer;
    } else if (Array.from(this.issuersConfig).length > 1) {
      throw new ParameterValidationError("userPoolId must be provided");
    }
    const issuerConfig = this.getIssuerConfig(issuer);
    super.cacheJwks(jwks, issuerConfig.issuer);
  }
};
CognitoJwtVerifier.USER_POOL_ID_REGEX = /^(?<region>[a-z]{2}-(gov-)?[a-z]+-\d)_[a-zA-Z0-9]+$/;

// api/sockets/authHandler.ts
import { DynamoDBClient as DynamoDBClient4 } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient as DynamoDBDocumentClient5, PutCommand } from "@aws-sdk/lib-dynamodb";

// lib/wsConnectionStore.ts
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  DeleteCommand,
  GetCommand,
  QueryCommand
} from "@aws-sdk/lib-dynamodb";
var REGION = "us-east-1";
var clnt = new DynamoDBClient({ region: REGION });
var ddbDocClient = DynamoDBDocumentClient.from(clnt, {
  marshallOptions: { convertEmptyValues: false, removeUndefinedValues: true },
  unmarshallOptions: { wrapNumbers: false }
});
var WS_CONNECTION_TTL_SEC = 86400;
function gameWatchKey(meta, id) {
  return `${meta}#${id}`;
}
function watchingGamesFromRefs(games) {
  const watchingGames = /* @__PURE__ */ new Set();
  if (!Array.isArray(games)) {
    return watchingGames;
  }
  for (const g of games) {
    if (g?.meta && g?.id) {
      watchingGames.add(gameWatchKey(g.meta, g.id));
    }
  }
  return watchingGames;
}
function connectionTtl() {
  return Math.floor(Date.now() / 1e3) + WS_CONNECTION_TTL_SEC;
}
async function deleteConnection(connectionId) {
  await ddbDocClient.send(
    new DeleteCommand({
      TableName: process.env.ABSTRACT_PLAY_TABLE,
      Key: { pk: "wsConnections", sk: connectionId }
    })
  );
}

// lib/wsPresence.ts
import { DynamoDBClient as DynamoDBClient3, UpdateItemCommand } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient as DynamoDBDocumentClient3, GetCommand as GetCommand2 } from "@aws-sdk/lib-dynamodb";
import { SQSClient, SendMessageCommand } from "@aws-sdk/client-sqs";

// lib/getConnections.ts
import { DynamoDBDocumentClient as DynamoDBDocumentClient2, QueryCommand as QueryCommand2 } from "@aws-sdk/lib-dynamodb";
import { DynamoDBClient as DynamoDBClient2 } from "@aws-sdk/client-dynamodb";
var REGION2 = "us-east-1";
var clnt2 = new DynamoDBClient2({ region: REGION2 });
var marshallOptions = {
  // Whether to automatically convert empty strings, blobs, and sets to `null`.
  convertEmptyValues: false,
  // false, by default.
  // Whether to remove undefined values while marshalling.
  removeUndefinedValues: true,
  // false, by default.
  // Whether to convert typeof object to map attribute.
  convertClassInstanceToMap: false
  // false, by default.
};
var unmarshallOptions = {
  // Whether to return numbers as a string instead of converting them to native JavaScript numbers.
  wrapNumbers: false
  // false, by default.
};
var translateConfig = { marshallOptions, unmarshallOptions };
var ddbDocClient2 = DynamoDBDocumentClient2.from(clnt2, translateConfig);
async function getConnections(consistent = false) {
  const allUsers = /* @__PURE__ */ new Set();
  const visibleUsers = /* @__PURE__ */ new Set();
  let lastKey = void 0;
  do {
    const params = {
      TableName: process.env.ABSTRACT_PLAY_TABLE,
      KeyConditionExpression: "pk = :pk",
      ExpressionAttributeValues: {
        ":pk": "wsConnections"
      },
      // Only fetch what we need
      ProjectionExpression: "userId, invisible",
      ExclusiveStartKey: lastKey,
      ConsistentRead: consistent
    };
    const result = await ddbDocClient2.send(new QueryCommand2(params));
    const items = result.Items ?? [];
    for (const item of items) {
      allUsers.add(item.userId);
      if (item.invisible !== true) {
        if (item.userId) {
          visibleUsers.add(item.userId);
        }
      }
    }
    lastKey = result.LastEvaluatedKey;
  } while (lastKey);
  return { totalCount: allUsers.size, visibleUserIds: [...visibleUsers] };
}

// lib/wsPost.ts
import {
  ApiGatewayManagementApiClient,
  PostToConnectionCommand
} from "@aws-sdk/client-apigatewaymanagementapi";
var clientCache = /* @__PURE__ */ new Map();
function getClient(endpoint) {
  let client = clientCache.get(endpoint);
  if (!client) {
    client = new ApiGatewayManagementApiClient({ endpoint });
    clientCache.set(endpoint, client);
  }
  return client;
}
async function postToConnection(endpoint, connectionId, data) {
  try {
    await getClient(endpoint).send(
      new PostToConnectionCommand({
        ConnectionId: connectionId,
        Data: Buffer.from(JSON.stringify(data))
      })
    );
    return true;
  } catch (err) {
    const statusCode = err.statusCode;
    if (statusCode === 410) {
      await deleteConnection(connectionId);
      return false;
    }
    console.error("Error posting to connection", connectionId, err);
    return false;
  }
}

// lib/wsPresence.ts
var REGION3 = "us-east-1";
var ddbLow = new DynamoDBClient3({ region: REGION3 });
var ddbDoc = DynamoDBDocumentClient3.from(ddbLow, {
  marshallOptions: { convertEmptyValues: false, removeUndefinedValues: true }
});
var sqs = new SQSClient({ region: REGION3 });
var PRESENCE_PK = "wsMeta";
var PRESENCE_SK = "presenceSeq";
async function getPresenceSeq() {
  const result = await ddbDoc.send(
    new GetCommand2({
      TableName: process.env.ABSTRACT_PLAY_TABLE,
      Key: { pk: PRESENCE_PK, sk: PRESENCE_SK }
    })
  );
  const seq = result.Item?.seq;
  return typeof seq === "number" ? seq : 0;
}
async function buildPresenceSnapshot() {
  const [conns, seq] = await Promise.all([getConnections(), getPresenceSeq()]);
  return {
    type: "snapshot",
    seq,
    totalCount: conns.totalCount,
    visibleUserIds: conns.visibleUserIds
  };
}
async function sendPresenceSnapshot(endpoint, connectionId) {
  const snapshot = await buildPresenceSnapshot();
  await postToConnection(endpoint, connectionId, {
    verb: "connections",
    payload: snapshot
  });
}
async function enqueuePresenceEvent(event) {
  const queueUrl = process.env.PRESENCE_COALESCE_SQS;
  if (!queueUrl) {
    console.error("PRESENCE_COALESCE_SQS is not configured");
    return;
  }
  await sqs.send(
    new SendMessageCommand({
      QueueUrl: queueUrl,
      MessageBody: JSON.stringify(event)
    })
  );
}

// lib/touchUserLastSeen.ts
import {
  BatchGetCommand,
  UpdateCommand
} from "@aws-sdk/lib-dynamodb";
var TOUCH_USER_LAST_SEEN_INTERVAL_MS = 15 * 60 * 1e3;
function isConditionalFailure(err) {
  return typeof err === "object" && err !== null && "name" in err && err.name === "ConditionalCheckFailedException";
}
async function touchUserLastSeen(client, tableName, userId, now = Date.now()) {
  const touchBefore = now - TOUCH_USER_LAST_SEEN_INTERVAL_MS;
  try {
    await client.send(new UpdateCommand({
      TableName: tableName,
      Key: { pk: "USERS", sk: userId },
      ConditionExpression: "attribute_not_exists(lastSeen) OR lastSeen < :touchBefore",
      UpdateExpression: "SET lastSeen = :now",
      ExpressionAttributeValues: {
        ":now": now,
        ":touchBefore": touchBefore
      }
    }));
    return true;
  } catch (err) {
    if (isConditionalFailure(err)) {
      return false;
    }
    throw err;
  }
}

// api/sockets/authHandler.ts
var REGION4 = "us-east-1";
var clnt3 = new DynamoDBClient4({ region: REGION4 });
var ddbDocClient3 = DynamoDBDocumentClient5.from(clnt3, {
  marshallOptions: { convertEmptyValues: false, removeUndefinedValues: true }
});
var verifier = CognitoJwtVerifier.create({
  userPoolId: process.env.userpoolId,
  tokenUse: "id",
  clientId: process.env.userpoolClient
});
var handler = async (event) => {
  const body = JSON.parse(event.body ?? "{}");
  const token = body.token;
  const invisible = body.invisible ?? false;
  const watchVersion = body.watchVersion;
  const wantsPresence = body.wantsPresence !== false;
  const games = body.games;
  if (!token) {
    console.error("Missing token in auth message");
    return { statusCode: 400, body: "Missing token" };
  }
  const domain = event.requestContext.domainName;
  const stage = event.requestContext.stage;
  try {
    const payload = await verifier.verify(token);
    const { connectionId } = event.requestContext;
    const userId = payload.sub;
    const endpoint = `https://${domain}/${stage}`;
    const item = {
      pk: "wsConnections",
      sk: connectionId,
      connectionId,
      userId,
      invisible,
      endpoint,
      wantsPresence,
      ttl: connectionTtl()
    };
    if (watchVersion === 1) {
      item.watchVersion = 1;
    }
    const watchingGames = watchingGamesFromRefs(games);
    if (watchingGames.size > 0) {
      item.watchingGames = watchingGames;
    }
    await ddbDocClient3.send(
      new PutCommand({
        TableName: process.env.ABSTRACT_PLAY_TABLE,
        Item: item
      })
    );
    await sendPresenceSnapshot(endpoint, connectionId);
    await touchUserLastSeen(
      ddbDocClient3,
      process.env.ABSTRACT_PLAY_TABLE,
      userId
    );
    if (!invisible) {
      await enqueuePresenceEvent({ type: "join", userId, invisible });
    }
    return { statusCode: 200 };
  } catch (ex) {
    console.log("Subscribe error:", ex);
    return { statusCode: 500 };
  }
};
export {
  handler
};
