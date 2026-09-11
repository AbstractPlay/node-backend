#!/usr/bin/env node
/* eslint-env node */
/**
 * Phase 1 feedback smoke tests against dev API.
 * Auth calls require AP_SMOKE_USER and AP_SMOKE_PASSWORD env vars.
 */
import { Amplify } from 'aws-amplify';
import { signIn, fetchAuthSession } from 'aws-amplify/auth';

const BASE_URL = (process.env.AP_API_BASE_URL_DEV ?? 'https://alyhqu85me.execute-api.us-east-1.amazonaws.com/dev').replace(/\/$/, '');

const DEV = {
  userPoolId: 'us-east-1_2zrzbEjoU',
  clientId: '14mpql1tmvntup4p2anm4jt782',
};

function fail(message, detail) {
  console.error(`FAIL: ${message}`);
  if (detail !== undefined) {
    console.error(typeof detail === 'string' ? detail : JSON.stringify(detail, null, 2));
  }
  process.exit(1);
}

function pass(message) {
  console.log(`OK: ${message}`);
}

/** authQuery uses API Gateway lambda integration — body is { statusCode, body, headers }. */
function unwrapApiResponse(httpStatus, parsed) {
  if (
    parsed
    && typeof parsed === 'object'
    && typeof parsed.statusCode === 'number'
    && 'body' in parsed
  ) {
    let inner = parsed.body;
    if (typeof inner === 'string') {
      try {
        inner = JSON.parse(inner);
      } catch {
        inner = { raw: inner };
      }
    }
    return { status: parsed.statusCode, body: inner };
  }
  return { status: httpStatus, body: parsed };
}

async function postJson(url, token, query, pars) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({ query, pars }),
  });
  const text = await res.text();
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = { raw: text };
  }
  return unwrapApiResponse(res.status, parsed);
}

async function postOpen(query, pars) {
  return postJson(`${BASE_URL}/query`, undefined, query, pars);
}

async function postAuth(token, query, pars) {
  return postJson(`${BASE_URL}/authQuery`, token, query, pars);
}

async function getAuthToken() {
  const user = process.env.AP_SMOKE_USER;
  const password = process.env.AP_SMOKE_PASSWORD;
  if (!user || !password) {
    return null;
  }
  Amplify.configure({
    Auth: {
      Cognito: {
        userPoolId: DEV.userPoolId,
        userPoolClientId: DEV.clientId,
      },
    },
  });
  await signIn({ username: user, password });
  const session = await fetchAuthSession();
  const token = session.tokens?.idToken?.toString();
  if (!token) {
    fail('Cognito sign-in succeeded but no id token');
  }
  return token;
}

async function main() {
  console.log(`Smoke feedback Phase 1 — ${BASE_URL}`);

  const list = await postOpen('feedback_list', { kind: 'feature', sort: 'recent', limit: 5 });
  if (list.status !== 200 || !Array.isArray(list.body.items)) {
    fail('feedback_list', list);
  }
  pass(`feedback_list → ${list.body.items.length} item(s)`);

  const token = await getAuthToken();
  if (!token) {
    console.log('SKIP: auth tests (set AP_SMOKE_USER + AP_SMOKE_PASSWORD for full smoke)');
    return;
  }

  const stamp = new Date().toISOString();
  const create = await postAuth(token, 'feedback_create', {
    kind: 'feature',
    title: `Smoke test ${stamp}`,
    body: 'Automated Phase 1 smoke test — safe to delete.',
  });
  if (create.status !== 200 || !create.body.id) {
    fail('feedback_create', create);
  }
  const id = create.body.id;
  pass(`feedback_create → id ${id}`);

  const bugNoScreenshot = await postAuth(token, 'feedback_create', {
    kind: 'bug',
    title: `Smoke bug no screenshot ${stamp}`,
    body: 'No attachments (allowed)',
  });
  if (bugNoScreenshot.status !== 200 || !bugNoScreenshot.body.id) {
    fail('bug create without attachments', bugNoScreenshot);
  }
  pass(`bug create without screenshot → id ${bugNoScreenshot.body.id}`);

  const get = await postOpen('feedback_get', { id });
  if (get.status !== 200 || get.body.post?.id !== id) {
    fail('feedback_get', get);
  }
  pass(`feedback_get → title "${get.body.post.title}"`);

  const vote = await postAuth(token, 'feedback_vote', { id, vote: true });
  if (vote.status !== 200 || vote.body.voteCount !== 1 || vote.body.voted !== true) {
    fail('feedback_vote on', vote);
  }
  pass('feedback_vote → count 1');

  const voteOff = await postAuth(token, 'feedback_vote', { id, vote: false });
  if (voteOff.status !== 200 || voteOff.body.voteCount !== 0) {
    fail('feedback_vote off', voteOff);
  }
  pass('feedback_vote off → count 0');

  const comment = await postAuth(token, 'feedback_comment', {
    id,
    body: 'Smoke test comment.',
    subscribe: true,
  });
  if (comment.status !== 200 || !comment.body.commentId) {
    fail('feedback_comment', comment);
  }
  pass(`feedback_comment → ${comment.body.commentId}`);

  const getAfter = await postOpen('feedback_get', { id });
  if (!Array.isArray(getAfter.body.comments) || getAfter.body.comments.length < 1) {
    fail('feedback_get after comment', getAfter);
  }
  pass('feedback_get includes comment');

  const wishlist = await postAuth(token, 'feedback_create', {
    kind: 'wishlist',
    title: `Smoke wishlist ${stamp}`,
    gameUrl: 'https://boardgamegeek.com/boardgame/2655/hive',
    body: 'Optional note',
  });
  if (wishlist.status !== 200 || !wishlist.body.id) {
    fail('wishlist feedback_create', wishlist);
  }
  pass(`wishlist create → id ${wishlist.body.id}`);

  const listWish = await postOpen('feedback_list', { kind: 'wishlist', sort: 'recent', limit: 10 });
  if (listWish.status !== 200 || !listWish.body.items.some((item) => item.id === wishlist.body.id)) {
    fail('wishlist feedback_list', listWish);
  }
  pass('wishlist appears on board');

  console.log('\nAll Phase 1 feedback smoke tests passed.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
