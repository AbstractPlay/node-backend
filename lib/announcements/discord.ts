import { plainTextDiscordExcerpt } from './discordExcerpt.js';

const DISCORD_CONTENT_MAX = 2000;

function clampExcerptForDiscord(title: string, excerpt: string, link: string): string {
  const prefix = `**${title}**\n`;
  const suffix = `\n${link}`;
  const maxExcerptLen = DISCORD_CONTENT_MAX - prefix.length - suffix.length;
  if (maxExcerptLen <= 0 || excerpt.length <= maxExcerptLen) {
    return excerpt;
  }
  return `${excerpt.slice(0, Math.max(0, maxExcerptLen - 1))}…`;
}

export type DiscordPostResult =
  | { ok: true; posted: true; messageId: string }
  | { ok: true; posted: false; skipped: true }
  | { ok: false; message: string };

export async function postAnnouncementDiscordMirror(
  title: string,
  body: string,
  announcementId: string,
  siteUrl: string,
): Promise<DiscordPostResult> {
  const webhookUrl = process.env.ANNOUNCEMENTS_DISCORD_WEBHOOK_URL?.trim();
  if (!webhookUrl) {
    return { ok: true, posted: false, skipped: true };
  }

  const link = `${siteUrl}/news/${announcementId}`;
  const excerpt = clampExcerptForDiscord(title, plainTextDiscordExcerpt(body), link);
  const content = `**${title}**\n${excerpt}\n${link}`;

  try {
    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content }),
    });
    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      return { ok: false, message: `Discord webhook failed (${res.status}): ${errText.slice(0, 200)}` };
    }
    let messageId = '';
    try {
      const json = await res.json() as { id?: string };
      if (json?.id) {
        messageId = String(json.id);
      }
    } catch {
      // webhook may return 204 with empty body
    }
    return { ok: true, posted: true, messageId };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Discord webhook request failed';
    return { ok: false, message };
  }
}
