function stripMarkdownForExcerpt(body: string, maxLen: number): string {
  let text = body
    .replace(/!\[[^\]]*]\([^)]+\)/g, '')
    .replace(/\[([^\]]+)]\([^)]+\)/g, '$1')
    .replace(/[*_~`>#]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (text.length > maxLen) {
    return `${text.slice(0, maxLen - 1)}…`;
  }
  return text;
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

  const excerpt = stripMarkdownForExcerpt(body, 200);
  const link = `${siteUrl}/news/${announcementId}`;
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
