import { beforeEach, describe, it, vi } from 'vitest';
import assert from 'node:assert/strict';
import { GetCommand } from '@aws-sdk/lib-dynamodb';

const ddbSend = vi.fn();
const getChallengePosition = vi.fn();

vi.mock('../lib/ddb.js', () => ({
  ddbDocClient: { send: (...args: unknown[]) => ddbSend(...args) },
}));

vi.mock('../lib/challenges/startPosition.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/challenges/startPosition.js')>();
  return {
    ...actual,
    getChallengePosition: (...args: unknown[]) => getChallengePosition(...args),
  };
});

const { getChallengePositionPreviewAuth } = await import(
  '../lib/challenges/startPositionPreview.js'
);

const challengeId = 'chal-preview-1';
const challengeRow = {
  metaGame: 'saltire',
  variants: ['v1'],
  challenger: { id: 'issuer', name: 'Issuer' },
  challengees: [{ id: 'joiner', name: 'Joiner' }],
  hasStartPosition: true,
};

beforeEach(() => {
  vi.clearAllMocks();
  process.env.ABSTRACT_PLAY_TABLE = 'test-table';
  ddbSend.mockImplementation(async (command: GetCommand) => {
    const key = command.input.Key as { pk: string; sk: string };
    if (key.pk === 'CHALLENGE' && key.sk === challengeId) {
      return { Item: challengeRow };
    }
    return {};
  });
  getChallengePosition.mockResolvedValue({
    state: '{"currplayer":0}',
    variants: ['v1'],
  });
});

describe('get_challenge_position_preview auth', () => {
  it('requires challenge id', async () => {
    const res = await getChallengePositionPreviewAuth('issuer', {});
    assert.equal(res.statusCode, 500);
    assert.match(JSON.parse(res.body).message, /id is required/i);
  });

  it('returns 404 when challenge is missing', async () => {
    ddbSend.mockResolvedValue({ Item: undefined });
    const res = await getChallengePositionPreviewAuth('issuer', { id: challengeId });
    assert.equal(res.statusCode, 404);
  });

  it('returns 403 for non-participants', async () => {
    const res = await getChallengePositionPreviewAuth('stranger', { id: challengeId });
    assert.equal(res.statusCode, 403);
    assert.match(JSON.parse(res.body).message, /not allowed/i);
    assert.equal(getChallengePosition.mock.calls.length, 0);
  });

  it('returns 400 when challenge has no start position', async () => {
    ddbSend.mockResolvedValue({
      Item: { ...challengeRow, hasStartPosition: false },
    });
    const res = await getChallengePositionPreviewAuth('issuer', { id: challengeId });
    assert.equal(res.statusCode, 400);
    assert.match(JSON.parse(res.body).message, /does not include/i);
  });

  it('returns preview for challenger and challengee', async () => {
    for (const userId of ['issuer', 'joiner']) {
      const res = await getChallengePositionPreviewAuth(userId, { id: challengeId });
      assert.equal(res.statusCode, 200);
      const body = JSON.parse(res.body);
      assert.equal(body.metaGame, 'saltire');
      assert.deepEqual(body.variants, ['v1']);
      assert.equal(body.state, '{"currplayer":0}');
    }
    assert.equal(getChallengePosition.mock.calls.length, 2);
  });

  it('returns 404 when position row is missing', async () => {
    getChallengePosition.mockResolvedValue(undefined);
    const res = await getChallengePositionPreviewAuth('issuer', { id: challengeId });
    assert.equal(res.statusCode, 404);
    assert.match(JSON.parse(res.body).message, /start position not found/i);
  });
});
