#!/usr/bin/env npx tsx
import {
  buildAmplifyCookieInjectionScript,
  cognitoSessionForPlayer,
} from '../lib/test/cognitoBrowserSession.js';

const player = process.argv[2] ?? 't1';
const session = await cognitoSessionForPlayer(player);
process.stdout.write(buildAmplifyCookieInjectionScript(session));
