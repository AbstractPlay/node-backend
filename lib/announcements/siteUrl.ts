export function announcementsSiteUrl(): string {
  const fromEnv = process.env.ANNOUNCEMENTS_SITE_URL?.trim();
  if (fromEnv) {
    return fromEnv.replace(/\/$/, '');
  }
  if (process.env.WEBSOCKET_STAGE === 'prod') {
    return 'https://play.abstractplay.com';
  }
  return 'https://play.dev.abstractplay.com';
}
