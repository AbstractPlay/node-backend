import {
  applyCustomMessageResponse,
  type CustomMessageEvent,
} from '../lib/cognito/customMessage.js';

function playBaseUrlFromEnv(): string {
  const fromPlay = process.env.PLAY_BASE_URL?.trim();
  if (fromPlay) {
    return fromPlay.replace(/\/$/, '');
  }
  const fromAnnouncements = process.env.ANNOUNCEMENTS_SITE_URL?.trim();
  if (fromAnnouncements) {
    return fromAnnouncements.replace(/\/$/, '');
  }
  return 'https://play.abstractplay.com';
}

export async function handler(event: CustomMessageEvent): Promise<CustomMessageEvent> {
  try {
    const normalized: CustomMessageEvent = {
      ...event,
      response: event.response ?? {},
    };
    return applyCustomMessageResponse(normalized, playBaseUrlFromEnv());
  } catch (err) {
    console.error('cognitoCustomMessage failed', err);
    const fallback = event.request?.linkParameter?.trim();
    if (fallback && !fallback.startsWith('{##')) {
      return {
        ...event,
        response: {
          ...(event.response ?? {}),
          emailSubject: '[Abstract Play]',
          emailMessage: `<p><a href="${fallback.replace(/&/g, '&amp;').replace(/</g, '&lt;')}">Continue</a></p>`,
        },
      };
    }
    throw err;
  }
}