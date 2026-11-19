import { describe, expect, it } from 'vitest';
import { rpcParsKeyList } from '../../lib/api/rpcAccessLog.js';

describe('rpcParsKeyList', () => {
  it('returns sorted keys excluding _clientIp', () => {
    expect(rpcParsKeyList({ gameid: 'x', z: 1, _clientIp: '1.2.3.4' })).toEqual([
      'gameid',
      'z',
    ]);
  });

  it('returns empty for non-objects', () => {
    expect(rpcParsKeyList(null)).toEqual([]);
    expect(rpcParsKeyList(['a'])).toEqual([]);
  });
});