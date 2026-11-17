export type CustomMessageTriggerSource =
  | 'CustomMessage_SignUp'
  | 'CustomMessage_ResendCode'
  | 'CustomMessage_ForgotPassword'
  | 'CustomMessage_UpdateUserAttribute'
  | 'CustomMessage_VerifyUserAttribute'
  | string;

export type CustomMessageRequest = {
  userAttributes?: Record<string, string>;
  codeParameter?: string | null;
  linkParameter?: string | null;
  usernameParameter?: string | null;
};

export type CustomMessageResponse = {
  smsMessage?: string | null;
  emailMessage?: string | null;
  emailSubject?: string | null;
};

export type CustomMessageEvent = {
  triggerSource: CustomMessageTriggerSource;
  userName?: string;
  request: CustomMessageRequest;
  response: CustomMessageResponse;
};

const PLACEHOLDER_CODE = '{####}';

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function normalizeCodeParameter(raw: string | null | undefined): string | null {
  if (raw == null || raw.trim() === '') {
    return null;
  }
  const trimmed = raw.trim();
  if (trimmed === PLACEHOLDER_CODE) {
    return null;
  }
  return trimmed;
}

export function buildPlayAccountUrl(
  playBaseUrl: string,
  pathname: string,
  params: Record<string, string>,
): string {
  const base = playBaseUrl.replace(/\/$/, '');
  const path = pathname.startsWith('/') ? pathname : `/${pathname}`;
  const url = new URL(`${base}${path}`);
  for (const [key, value] of Object.entries(params)) {
    if (value !== '') {
      url.searchParams.set(key, value);
    }
  }
  return url.toString();
}

function verificationButtonEmailHtml(opts: {
  intro: string;
  buttonLabel: string;
  href: string;
  username?: string;
  code?: string;
  footer?: string;
}): string {
  const safeIntro = escapeHtml(opts.intro);
  const safeLabel = escapeHtml(opts.buttonLabel);
  const safeHref = escapeHtml(opts.href);
  const codeBlock = opts.code
    ? `<p>Or enter this code manually: <strong>${escapeHtml(opts.code)}</strong></p>`
    : '';
  const userLine = opts.username
    ? `<p>Your login name: <strong>${escapeHtml(opts.username)}</strong></p>`
    : '';
  const footer = opts.footer ? `<p>${escapeHtml(opts.footer)}</p>` : '';
  return `<p>${safeIntro}</p>
<p><a href="${safeHref}" style="display:inline-block;padding:10px 18px;background:#1a5276;color:#fff;text-decoration:none;border-radius:4px;">${safeLabel}</a></p>
${codeBlock}
${userLine}
${footer}
<p>If you did not request this, you can ignore this email.</p>`;
}

export function buildCustomMessageEmail(
  triggerSource: CustomMessageTriggerSource,
  event: CustomMessageEvent,
  playBaseUrl: string,
): { emailSubject: string; emailMessage: string } | null {
  const username = event.userName ?? '';
  const code = normalizeCodeParameter(event.request.codeParameter);

  if (triggerSource === 'CustomMessage_SignUp' || triggerSource === 'CustomMessage_ResendCode') {
    if (!code || username === '') {
      return null;
    }
    const href = buildPlayAccountUrl(playBaseUrl, '/account/verify', {
      username,
      code,
    });
    return {
      emailSubject: '[Abstract Play] Verify your email',
      emailMessage: verificationButtonEmailHtml({
        intro: 'Welcome to Abstract Play! Click below to verify your email and finish creating your account.',
        buttonLabel: 'Verify email',
        href,
        username,
        code,
        footer: 'After verifying, you can sign in at play with the login name you chose when you registered.',
      }),
    };
  }

  if (triggerSource === 'CustomMessage_ForgotPassword') {
    if (!code || username === '') {
      return null;
    }
    const href = buildPlayAccountUrl(playBaseUrl, '/account/reset-password', {
      username,
      code,
    });
    return {
      emailSubject: '[Abstract Play] Password reset',
      emailMessage: verificationButtonEmailHtml({
        intro: 'You requested a password reset for Abstract Play.',
        buttonLabel: 'Reset password',
        href,
        username,
        code,
      }),
    };
  }

  if (
    triggerSource === 'CustomMessage_UpdateUserAttribute'
    || triggerSource === 'CustomMessage_VerifyUserAttribute'
  ) {
    if (!code) {
      return null;
    }
    const href = buildPlayAccountUrl(playBaseUrl, '/account/confirm-email', {
      code,
      returnUrl: '/',
    });
    return {
      emailSubject: '[Abstract Play] Verify your email address',
      emailMessage: verificationButtonEmailHtml({
        intro: 'Confirm your new email address for Abstract Play.',
        buttonLabel: 'Verify new email',
        href,
        code,
      }),
    };
  }

  return null;
}

export function applyCustomMessageResponse(
  event: CustomMessageEvent,
  playBaseUrl: string,
): CustomMessageEvent {
  const built = buildCustomMessageEmail(event.triggerSource, event, playBaseUrl);
  if (!built) {
    return event;
  }
  return {
    ...event,
    response: {
      ...event.response,
      emailSubject: built.emailSubject,
      emailMessage: built.emailMessage,
    },
  };
}