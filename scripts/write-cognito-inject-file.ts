#!/usr/bin/env npx tsx
/** Output inject expression for browser CDP (player key default t1). */
import { writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  buildAmplifyCookieInjectionScript,
  cognitoSessionForPlayer,
} from '../lib/test/cognitoBrowserSession.js';

const player = process.argv[2] ?? 't1';
const session = await cognitoSessionForPlayer(player);
const expr = buildAmplifyCookieInjectionScript(session);
const outPath = join(tmpdir(), `ap-cognito-inject-${player}.js`);
writeFileSync(outPath, expr, 'utf8');
console.log(outPath);
console.log(expr.length);
