#!/usr/bin/env node
/* eslint-env node */
/**
 * POST to Abstract Play /query or /authQuery using a JSON request file.
 *
 * Request file shape:
 *   { "query": string, "pars": object, "userid"?: string }
 *
 * Without userid → POST /query (no auth).
 * With userid → password prompted on stdin (not stored in JSON); Cognito SRP login → POST /authQuery.
 *
 * Usage:
 *   node bin/ap-post.mjs request.json [--stage dev|prod] [--base-url URL]
 *
 * Environment:
 *   AP_API_BASE_URL_DEV / AP_API_BASE_URL_PROD — override default API root per stage
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @typedef {{ userid?: string; query: string; pars: Record<string, unknown> }} PostParams */

const STAGES = {
  dev: {
    region: 'us-east-1',
    userPoolId: 'us-east-1_2zrzbEjoU',
    clientId: '14mpql1tmvntup4p2anm4jt782',
    defaultBaseUrl:
      process.env.AP_API_BASE_URL_DEV
      ?? 'https://alyhqu85me.execute-api.us-east-1.amazonaws.com/dev',
  },
  prod: {
    region: 'us-east-1',
    userPoolId: 'us-east-1_YCjgSZHJm',
    clientId: '2isan3ctk1aabt2v6r6aptlpg',
    defaultBaseUrl:
      process.env.AP_API_BASE_URL_PROD
      ?? 'https://7n1lziet28.execute-api.us-east-1.amazonaws.com/prod',
  },
};

function usage() {
  console.error(`Usage: node bin/ap-post.mjs <request.json> [--stage dev|prod] [--base-url URL]

Request JSON:
  {
    "query": "submit_comment",
    "pars": { ... },
    "userid": "optional@cognito.username"
  }

When "userid" is set, the password is prompted interactively (not echoed).

Options:
  --stage dev|prod   Cognito pool + API base URL (default: dev)
  --base-url URL     Override API root (…/dev or …/prod), no trailing slash

Environment:
  AP_API_BASE_URL_DEV / AP_API_BASE_URL_PROD   Per-stage API root override
`);
  process.exit(1);
}

function parseArgs(argv) {
  let jsonPath;
  let stage = 'dev';
  let baseUrlOverride;

  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--stage' && argv[i + 1]) {
      stage = argv[++i];
    } else if (arg === '--base-url' && argv[i + 1]) {
      baseUrlOverride = argv[++i];
    } else if (arg === '--help' || arg === '-h') {
      usage();
    } else if (!arg.startsWith('-')) {
      jsonPath = arg;
    } else {
      console.error(`Unknown option: ${arg}`);
      usage();
    }
  }

  if (!jsonPath) {
    usage();
  }

  const stageConfig = STAGES[stage];
  if (!stageConfig) {
    console.error(`Unknown stage "${stage}". Use dev or prod.`);
    process.exit(1);
  }

  if (!baseUrlOverride) {
    baseUrlOverride = stageConfig.defaultBaseUrl;
  }
  if (!baseUrlOverride) {
    console.error(
      `No API base URL for stage "${stage}". Set --base-url or AP_API_BASE_URL_${stage.toUpperCase()}.`,
    );
    process.exit(1);
  }

  return {
    jsonPath: path.resolve(jsonPath),
    stage,
    baseUrl: baseUrlOverride.replace(/\/$/, ''),
    stageConfig,
  };
}

/** @param {unknown} raw */
function parsePostParams(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('Request file must be a JSON object.');
  }
  const o = /** @type {Record<string, unknown>} */ (raw);
  if (typeof o.query !== 'string' || o.query.length === 0) {
    throw new Error('Request file must include a non-empty "query" string.');
  }
  if (o.pars !== undefined && (typeof o.pars !== 'object' || o.pars === null || Array.isArray(o.pars))) {
    throw new Error('"pars" must be an object when provided.');
  }
  if (o.password !== undefined) {
    throw new Error(
      'Do not put "password" in the request file. '
      + 'It is prompted on the command line when "userid" is set.',
    );
  }
  const userid = o.userid === undefined ? undefined : String(o.userid);
  return {
    query: o.query,
    pars: /** @type {Record<string, unknown>} */ (o.pars ?? {}),
    userid,
  };
}

/**
 * @param {string} prompt
 * @returns {Promise<string>}
 */
function promptPassword(prompt) {
  if (!process.stdin.isTTY) {
    throw new Error(
      'Password must be entered interactively (stdin is not a terminal).',
    );
  }

  return new Promise((resolve, reject) => {
    const stdin = process.stdin;
    const stdout = process.stdout;

    stdout.write(prompt);

    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding('utf8');

    let password = '';

    /** @param {string} ch */
    const onData = (ch) => {
      switch (ch) {
        case '\n':
        case '\r':
        case '\u0004':
          stdin.setRawMode(false);
          stdin.pause();
          stdin.removeListener('data', onData);
          stdout.write('\n');
          if (password.length === 0) {
            reject(new Error('Password cannot be empty.'));
          } else {
            resolve(password);
          }
          break;
        case '\u0003':
          stdin.setRawMode(false);
          stdout.write('\n');
          process.exit(130);
          break;
        case '\u007F':
        case '\b':
          password = password.slice(0, -1);
          break;
        default:
          if (ch >= ' ' || ch === '\t') {
            password += ch;
          }
          break;
      }
    };

    stdin.on('data', onData);
  });
}

/**
 * Browser-style Cognito login (USER_SRP_AUTH via amazon-cognito-identity-js).
 *
 * @param {{ region: string; userPoolId: string; clientId: string }} pool
 * @param {string} username
 * @param {string} password
 */
async function fetchIdToken(pool, username, password) {
  const {
    AuthenticationDetails,
    CognitoUser,
    CognitoUserPool,
  } = await import('amazon-cognito-identity-js');

  const userPool = new CognitoUserPool({
    UserPoolId: pool.userPoolId,
    ClientId: pool.clientId,
    endpoint: `https://cognito-idp.${pool.region}.amazonaws.com/`,
  });
  const cognitoUser = new CognitoUser({
    Username: username,
    Pool: userPool,
  });
  const authDetails = new AuthenticationDetails({
    Username: username,
    Password: password,
  });

  return new Promise((resolve, reject) => {
    cognitoUser.authenticateUser(authDetails, {
      onSuccess: (session) => {
        const token = session.getIdToken().getJwtToken();
        if (!token) {
          reject(new Error('Cognito session did not include an IdToken.'));
          return;
        }
        resolve(token);
      },
      onFailure: (err) => {
        reject(err instanceof Error ? err : new Error(String(err)));
      },
      newPasswordRequired: () => {
        reject(new Error(
          'Cognito requires a new password (first login or reset). '
          + 'Set a permanent password in the web UI, then retry.',
        ));
      },
      mfaRequired: () => {
        reject(new Error('MFA is enabled on this account; this script does not handle MFA yet.'));
      },
      totpRequired: () => {
        reject(new Error('TOTP MFA is enabled on this account; this script does not handle MFA yet.'));
      },
      selectMFAType: () => {
        reject(new Error('MFA selection is required; this script does not handle MFA yet.'));
      },
    });
  });
}

/**
 * @param {string} url
 * @param {Record<string, unknown>} body
 * @param {string} [bearerToken]
 */
async function postJson(url, body, bearerToken) {
  const headers = {
    Accept: 'application/json',
    'Content-Type': 'application/json',
  };
  if (bearerToken) {
    headers.Authorization = `Bearer ${bearerToken}`;
  }
  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
  const text = await response.text();
  return { response, text };
}

function dumpResult(label, url, { response, text }) {
  console.log(`=== ${label} ===`);
  console.log(`POST ${url}`);
  console.log(`HTTP ${response.status} ${response.statusText}`);
  console.log('--- headers ---');
  response.headers.forEach((value, key) => {
    console.log(`${key}: ${value}`);
  });
  console.log('--- body ---');
  if (text.length === 0) {
    console.log('(empty)');
    return;
  }
  try {
    console.log(JSON.stringify(JSON.parse(text), null, 2));
  } catch {
    console.log(text);
  }
}

async function main() {
  const { jsonPath, baseUrl, stage, stageConfig } = parseArgs(process.argv);
  const raw = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
  const params = parsePostParams(raw);
  const apiBody = { query: params.query, pars: params.pars };

  console.error(`Stage: ${stage}`);
  console.error(`API: ${baseUrl}`);
  if (params.userid) {
    console.error(
      `Cognito: pool ${stageConfig.userPoolId}, client ${stageConfig.clientId}, `
      + `endpoint cognito-idp.${stageConfig.region}.amazonaws.com`,
    );
  }

  if (params.userid) {
    const password = await promptPassword(`Password for ${params.userid}: `);
    console.error(`Authenticating as ${params.userid}…`);
    const idToken = await fetchIdToken(
      stageConfig,
      params.userid,
      password,
    );
    const url = `${baseUrl}/authQuery`;
    const result = await postJson(url, apiBody, idToken);
    dumpResult('authQuery', url, result);
    process.exit(result.response.ok ? 0 : 1);
  }

  const url = `${baseUrl}/query`;
  const result = await postJson(url, apiBody);
  dumpResult('query', url, result);
  process.exit(result.response.ok ? 0 : 1);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
