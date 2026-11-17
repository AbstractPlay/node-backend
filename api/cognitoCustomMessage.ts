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
  return applyCustomMessageResponse(event, playBaseUrlFromEnv());
}