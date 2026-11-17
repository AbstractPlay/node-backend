import { test } from 'vitest';
import assert from 'node:assert/strict';
import {
  applyCustomMessageResponse,
  buildPlayAccountUrl,
  escapeHtml,
  resolveVerificationCode,
  type CustomMessageEvent,
} from '../lib/cognito/customMessage.js';

const PLAY = 'https://play.dev.abstractplay.com';

test('escapeHtml escapes special characters', () => {
  assert.equal(escapeHtml(`a<b>&"'`), 'a&lt;b&gt;&amp;&quot;&#39;');
});

test('buildPlayAccountUrl encodes query params', () => {
  const url = buildPlayAccountUrl(PLAY, '/account/verify', {
    username: 'user name',
    code: '123456',
  });
  assert.equal(
    url,
    'https://play.dev.abstractplay.com/account/verify?username=user+name&code=123456',
  );
});

test('resolveVerificationCode reads confirmation_code from Cognito confirm link', () => {
  const code = resolveVerificationCode({
    codeParameter: '{####}',
    linkParameter:
      'https://auth.dev.abstractplay.com/confirmUser?client_id=x&user_name=ada&confirmation_code=123456',
  });
  assert.equal(code, '123456');
});

test('ResendCode with CONFIRM_WITH_CODE placeholder builds custom email for Cognito substitution', () => {
  const event: CustomMessageEvent = {
    triggerSource: 'CustomMessage_ResendCode',
    userName: 'throwaway',
    request: { codeParameter: '{####}', linkParameter: null },
    response: {},
  };
  const out = applyCustomMessageResponse(event, PLAY);
  assert.equal(out.response.emailSubject, '[Abstract Play] Verify your email');
  assert.match(out.response.emailMessage ?? '', /account\/verify\?/);
  assert.match(out.response.emailMessage ?? '', /code=\{####\}/);
  assert.match(out.response.emailMessage ?? '', /\{####\}/);
});

test('SignUp falls back to Hosted UI link when code only in linkParameter placeholders', () => {
  const cognitoLink =
    'https://auth.dev.abstractplay.com/confirmUser?client_id=x&user_name=ada&confirmation_code=123456';
  const event: CustomMessageEvent = {
    triggerSource: 'CustomMessage_SignUp',
    userName: 'ada',
    request: { codeParameter: '{####}', linkParameter: cognitoLink },
    response: {},
  };
  const out = applyCustomMessageResponse(event, PLAY);
  assert.match(out.response.emailMessage ?? '', /account\/verify/);
});

test('SignUp email includes play verify link', () => {
  const event: CustomMessageEvent = {
    triggerSource: 'CustomMessage_SignUp',
    userName: 'ada',
    request: { codeParameter: '654321' },
    response: {},
  };
  const out = applyCustomMessageResponse(event, PLAY);
  assert.match(out.response.emailMessage ?? '', /account\/verify\?/);
  assert.match(out.response.emailMessage ?? '', /username=ada/);
  assert.match(out.response.emailMessage ?? '', /654321/);
  assert.match(out.response.emailMessage ?? '', /Verify email/);
  assert.doesNotMatch(out.response.emailMessage ?? '', /<script/i);
});

test('ForgotPassword email includes reset link with code', () => {
  const event: CustomMessageEvent = {
    triggerSource: 'CustomMessage_ForgotPassword',
    userName: 'ada',
    request: { codeParameter: '999888' },
    response: {},
  };
  const out = applyCustomMessageResponse(event, PLAY);
  assert.match(out.response.emailMessage ?? '', /account\/reset-password\?/);
  assert.match(out.response.emailMessage ?? '', /999888/);
});

test('UpdateUserAttribute email links to confirm-email', () => {
  const event: CustomMessageEvent = {
    triggerSource: 'CustomMessage_UpdateUserAttribute',
    userName: 'ada',
    request: { codeParameter: '111222' },
    response: {},
  };
  const out = applyCustomMessageResponse(event, PLAY);
  assert.match(out.response.emailMessage ?? '', /account\/confirm-email\?/);
  assert.match(out.response.emailMessage ?? '', /111222/);
});

test('unknown trigger leaves event unchanged', () => {
  const event: CustomMessageEvent = {
    triggerSource: 'CustomMessage_AdminCreateUser',
    userName: 'ada',
    request: { codeParameter: '1' },
    response: { emailMessage: 'original' },
  };
  const out = applyCustomMessageResponse(event, PLAY);
  assert.equal(out.response.emailMessage, 'original');
});