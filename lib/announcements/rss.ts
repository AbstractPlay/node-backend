import type { AnnouncementPublicItem } from './types.js';

function escapeXml(unsafe: string): string {
  return unsafe.replace(/[<>&'"]/g, (c) => {
    switch (c) {
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '&': return '&amp;';
      case '\'': return '&apos;';
      case '"': return '&quot;';
      default: return c;
    }
  });
}

export function buildAnnouncementsRss(
  items: AnnouncementPublicItem[],
  options?: { siteUrl?: string },
): string {
  const siteUrl = options?.siteUrl ?? 'https://play.abstractplay.com';
  const sorted = [...items].sort((a, b) => b.publishedAt - a.publishedAt);
  let rss = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <atom:link href="${siteUrl}/news.rss" rel="self" type="application/rss+xml" />
    <title>Abstract Play News</title>
    <link>${siteUrl}/news</link>
    <description>Abstract Play is a site that allows you to play abstract strategy board games against other players on the internet. These games are not real-time, meaning your opponent does not need to be online at the same time as you are. You can submit your move and come back later to see if your opponent has moved. We specialize in offbeat, perfect information games without any element of luck.</description>
`;
  for (const item of sorted) {
    const pubDate = new Date(item.publishedAt).toUTCString();
    const title = item.title || 'Announcement';
    const description = escapeXml(item.body);
    rss += `
    <item>
      <title>${escapeXml(title)}</title>
      <description>${description}</description>
      <link>${siteUrl}/news/${escapeXml(item.id)}</link>
      <pubDate>${pubDate}</pubDate>
      <guid isPermaLink="false">${escapeXml(item.id)}</guid>
    </item>
    `;
  }
  rss += `
  </channel>
</rss>
`;
  return rss;
}
