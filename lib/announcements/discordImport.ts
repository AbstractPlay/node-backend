/**
 * Parse DiscordChatExporter JSON for announcement import.
 */

export type DiscordExportMessage = {
  id: string;
  timestamp: string;
  content?: string;
  attachments?: Array<{
    id?: string;
    url?: string;
    fileName?: string;
    fileSizeBytes?: number;
  }>;
  inlineEmojis?: Array<{
    id?: string;
    name?: string;
    code?: string;
    imageUrl?: string;
  }>;
};

const IMAGE_EXT = /\.(png|jpe?g|webp|gif)$/i;

export function shouldImportMessage(msg: DiscordExportMessage): boolean {
  const text = (msg.content ?? '').trim();
  const attachments = msg.attachments ?? [];
  return text.length > 0 || attachments.length > 0;
}

/** Replace Discord custom emoji tokens with Unicode names from inlineEmojis. */
export function normalizeDiscordContent(
  content: string,
  inlineEmojis: DiscordExportMessage['inlineEmojis'],
): string {
  if (!content || !inlineEmojis?.length) {
    return content;
  }
  let out = content;
  for (const emoji of inlineEmojis) {
    if (!emoji.name) {
      continue;
    }
    if (emoji.id) {
      const animated = emoji.code ? '' : '';
      const patterns = [
        new RegExp(`<a?:${escapeRegExp(emoji.code ?? emoji.name)}:${emoji.id}>`, 'g'),
        new RegExp(`<:${escapeRegExp(emoji.name)}:${emoji.id}>`, 'g'),
      ];
      for (const pattern of patterns) {
        out = out.replace(pattern, emoji.name);
      }
    }
  }
  return out;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function isImageAttachment(att: { url?: string; fileName?: string }): boolean {
  const name = att.fileName ?? att.url ?? '';
  return IMAGE_EXT.test(name);
}

export function titleFromBody(body: string): string {
  const firstLine = body
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line.length > 0);
  if (!firstLine) {
    return 'Announcement';
  }
  const plain = firstLine
    .replace(/\*\*/g, '')
    .replace(/__/g, '')
    .replace(/^#+\s*/, '')
    .trim();
  if (plain.length <= 120) {
    return plain || 'Announcement';
  }
  return `${plain.slice(0, 117)}...`;
}

export function publishedAtMsFromIso(timestamp: string): number {
  return new Date(timestamp).getTime();
}

/** Resolve attachment path from export JSON (may use backslashes). */
export function resolveAttachmentFilePath(filesDir: string, url: string): string {
  const normalized = url.replace(/\\/g, '/');
  const base = normalized.split('/').pop() ?? normalized;
  return `${filesDir.replace(/\\/g, '/').replace(/\/$/, '')}/${base}`;
}

export function markdownImageLine(fileName: string, apAttKey: string): string {
  const alt = fileName.replace(/\.[^.]+$/, '') || 'image';
  return `![${alt}](ap-att:${apAttKey})`;
}
