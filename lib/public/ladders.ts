import {
  handleGetLadder,
  handleGetLadderActivity,
  handleGetLadders,
} from '../ladders/handlers.js';

export async function getLadder(pars: { ladderId?: string }) {
  return handleGetLadder(pars);
}

export async function getLadders(pars: { metaGame?: string; status?: string } = {}) {
  return handleGetLadders(pars);
}

export async function getLadderActivity(pars: { ladderId?: string }) {
  return handleGetLadderActivity(pars);
}
