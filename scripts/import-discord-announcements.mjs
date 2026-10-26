#!/usr/bin/env node
/**
 * Import DiscordChatExporter announcements JSON into DynamoDB + S3 attachments.
 *
 * Usage:
 *   npm run import-discord-announcements -- --stage dev
 *   npm run import-discord-announcements -- --stage prod --live --file path/to/announcements.json
 *
 * Dry-run is the default; pass --live to write.
 */
import { readFileSync, existsSync } from 'node:fs';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { S3Client } from '@aws-sdk/client-s3';
import {
  isImageAttachment,
  markdownImageLine,
  normalizeDiscordContent,
  publishedAtMsFromIso,
  putAnnouncementImportFile,
  putAnnouncementRecord,
  resolveAttachmentFilePath,
  shouldImportMessage,
  titleFromBody,
} from '../lib/announcements/index.js';

const DEFAULT_FILE = 'C:/Users/aaron/OneDrive/Desktop/announcements.json';

function parseArgs(argv) {
  const args = {
    dryRun: true,
    stage: '',
    file: DEFAULT_FILE,
    filesDir: '',
  };
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--dry-run') {
      args.dryRun = true;
    } else if (arg === '--live') {
      args.dryRun = false;
    } else if (arg === '--stage' && argv[i + 1]) {
      args.stage = argv[++i];
    } else if (arg === '--file' && argv[i + 1]) {
      args.file = argv[++i];
    } else if (arg === '--files-dir' && argv[i + 1]) {
      args.filesDir = argv[++i];
    }
  }
  if (!args.filesDir) {
    // DiscordChatExporter: announcements.json → announcements.json_Files
    args.filesDir = args.file.replace(/\.json$/i, '.json_Files');
  }
  return args;
}

function tableNameForStage(stage) {
  if (stage === 'prod') {
    return process.env.ABSTRACT_PLAY_TABLE_PROD ?? 'abstract-play-prod';
  }
  return process.env.ABSTRACT_PLAY_TABLE ?? 'abstract-play-dev';
}

async function main() {
  const args = parseArgs(process.argv);
  if (!args.stage) {
    console.error('Usage: npm run import-discord-announcements -- --stage dev|prod [--dry-run|--live] [--file path] [--files-dir path]');
    process.exit(1);
  }

  process.env.ANNOUNCEMENTS_ATTACHMENTS_BUCKET = process.env.ANNOUNCEMENTS_ATTACHMENTS_BUCKET
    ?? `ap-announcements-attachments-${args.stage}`;

  const raw = JSON.parse(readFileSync(args.file, 'utf8'));
  const messages = raw.messages ?? [];
  const toImport = messages.filter(shouldImportMessage);
  console.log(`Messages: ${messages.length}, importable: ${toImport.length}, dryRun: ${args.dryRun}, stage: ${args.stage}`);

  const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
  const s3 = new S3Client({});
  const tableName = tableNameForStage(args.stage);

  let written = 0;
  let uploads = 0;

  for (const msg of toImport) {
    const id = String(msg.id);
    let body = normalizeDiscordContent(msg.content ?? '', msg.inlineEmojis);
    const attachmentKeys = [];

    for (const att of msg.attachments ?? []) {
      if (!isImageAttachment(att)) {
        continue;
      }
      const localPath = resolveAttachmentFilePath(args.filesDir, att.url ?? att.fileName ?? '');
      if (!existsSync(localPath)) {
        console.warn(`Missing file for ${id}: ${localPath}`);
        continue;
      }
      if (args.dryRun) {
        uploads += 1;
        attachmentKeys.push(`import/${id}/${att.fileName ?? 'image.png'}`);
      } else {
        const key = await putAnnouncementImportFile(
          s3,
          id,
          localPath,
          att.fileName ?? 'image.png',
        );
        attachmentKeys.push(key);
        uploads += 1;
      }
      body = `${body.trim()}\n\n${markdownImageLine(att.fileName ?? 'image', attachmentKeys[attachmentKeys.length - 1])}`.trim();
    }

    const publishedAt = publishedAtMsFromIso(msg.timestamp);
    const title = titleFromBody(body);
    const record = {
      id,
      status: 'published',
      title,
      body,
      publishedAt,
      createdAt: publishedAt,
      updatedAt: publishedAt,
      source: 'import-discord',
      attachmentKeys: attachmentKeys.length > 0 ? attachmentKeys : undefined,
      reactionCounts: {},
    };

    if (args.dryRun) {
      written += 1;
      continue;
    }

    await putAnnouncementRecord(ddb, tableName, record);
    written += 1;
    if (written % 50 === 0) {
      console.log(`Imported ${written}...`);
    }
  }

  console.log(`Done. Records: ${written}, attachment uploads: ${uploads}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
