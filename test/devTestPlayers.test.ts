import { describe, expect, it } from 'vitest';
import {
  loadDevTestPlayersManifest,
  manifestDefaults,
} from '../lib/test/devTestPlayers.js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const examplePath = path.join(
  fileURLToPath(new URL('./fixtures/dev-test-players.example.json', import.meta.url)),
);

describe('devTestPlayers manifest', () => {
  it('loads example fixture shape', async () => {
    const m = await loadDevTestPlayersManifest(examplePath);
    expect(m.players.owner?.refreshToken).toBe('PASTE_REFRESH_TOKEN');
    expect(manifestDefaults(m).ladderId).toBeTruthy();
  });
});
