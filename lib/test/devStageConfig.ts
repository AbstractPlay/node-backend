/** Dev stage defaults (match front `src/config/dev.js`). Override via env for other stages. */
export const DEV_AUTH_QUERY_URL =
  process.env.AP_AUTH_QUERY_URL
  ?? 'https://alyhqu85me.execute-api.us-east-1.amazonaws.com/dev/authQuery';

export const DEV_COGNITO_CLIENT_ID =
  process.env.AP_COGNITO_APP_CLIENT_ID ?? '14mpql1tmvntup4p2anm4jt782';

export const DEV_COGNITO_USER_POOL_ID =
  process.env.AP_COGNITO_USER_POOL_ID ?? 'us-east-1_2zrzbEjoU';

export const DEV_COGNITO_DOMAIN =
  process.env.AP_COGNITO_DOMAIN ?? 'auth.dev.abstractplay.com';

export const DEV_COGNITO_REDIRECT_LOGIN =
  process.env.AP_DEV_OAUTH_REDIRECT
  ?? process.env.AP_COGNITO_REDIRECT_LOGIN
  ?? 'http://127.0.0.1:9234/';

export const DEV_COGNITO_REDIRECT_LOGOUT =
  process.env.AP_COGNITO_REDIRECT_LOGOUT ?? DEV_COGNITO_REDIRECT_LOGIN;
