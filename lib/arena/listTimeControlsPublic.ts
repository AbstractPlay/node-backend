import { headers } from '../api/http.js';
import { listEnabledArenaTimeControls } from './timeControls.js';

export async function listArenaTimeControlsPublic() {
  const controls = listEnabledArenaTimeControls().map((tc) => ({
    id: tc.id,
    label: tc.label,
    tier: tc.tier,
    startSec: tc.startSec,
    incSec: tc.incSec,
    maxSec: tc.maxSec,
  }));
  return {
    statusCode: 200,
    body: JSON.stringify({ controls }),
    headers,
  };
}
