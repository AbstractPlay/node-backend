import { GameBase, GameFactory } from '@abstractplay/gameslib';

export type ExplorationTreeNode = {
  move?: string;
  children?: ExplorationTreeNode[];
  [key: string]: unknown;
};

type ExplorationMoveOptions = {
  partial?: boolean;
  trusted?: boolean;
  emulation?: boolean;
};

type EngineWithSerialize = GameBase & {
  cheapSerialize?: () => string;
  validateMove: (move: string) => { valid: boolean; complete?: number | null; canrender?: boolean };
};

function assertValidMoveHasComplete(v: { valid: boolean; complete?: number | null }, move: string): void {
  if (v.valid && v.complete == null) {
    throw new Error(`validateMove returned valid without complete for move: ${move}`);
  }
}

function createProbeEngine(gameEngine: GameBase, metaGame: string): GameBase {
  const engine = gameEngine as EngineWithSerialize;
  if (metaGame && typeof engine.cheapSerialize === 'function') {
    return GameFactory(metaGame, engine.cheapSerialize())!;
  }
  if (typeof gameEngine.clone === 'function') {
    const probe = gameEngine.clone();
    probe.load(-1);
    return probe;
  }
  throw new Error(`Cannot probe move without metaGame or clone(): ${metaGame}`);
}

function requiresPartialExplorationApply(gameEngine: GameBase, move: string, metaGame: string): boolean {
  const v = (gameEngine as EngineWithSerialize).validateMove(move);
  if (!v.valid) return false;
  assertValidMoveHasComplete(v, move);
  if (v.complete === 1) return false;

  try {
    createProbeEngine(gameEngine, metaGame).move(move, {
      trusted: true,
      partial: false,
      emulation: true,
    } as ExplorationMoveOptions);
    return false;
  } catch {
    return true;
  }
}

function validateExplorationMove(gameEngine: GameBase, move: string, metaGame: string) {
  const v = (gameEngine as EngineWithSerialize).validateMove(move);
  if (!v.valid) return { valid: false, partial: false };
  assertValidMoveHasComplete(v, move);
  return {
    valid: true,
    partial: requiresPartialExplorationApply(gameEngine, move, metaGame),
  };
}

function isPersistableExplorationMove(gameEngine: GameBase, move: string, metaGame: string): boolean {
  const { valid, partial } = validateExplorationMove(gameEngine, move, metaGame);
  return valid && !partial;
}

function applyExplorationMove(
  gameEngine: GameBase,
  move: string,
  { emulation = false, metaGame }: { emulation?: boolean; metaGame: string } = { metaGame: '' }
): void {
  const { valid, partial } = validateExplorationMove(gameEngine, move, metaGame);
  if (!valid) {
    throw new Error(`Invalid exploration move: ${move}`);
  }
  gameEngine.move(move, { trusted: true, partial, emulation } as ExplorationMoveOptions);
}

export function filterPersistableExplorationTree(
  gameEngine: GameBase,
  children: ExplorationTreeNode[],
  metaGame: string
): ExplorationTreeNode[] {
  if (!Array.isArray(children)) return [];
  const result: ExplorationTreeNode[] = [];
  for (const child of children) {
    if (!child?.move) continue;
    if (!isPersistableExplorationMove(gameEngine, child.move, metaGame)) continue;
    try {
      applyExplorationMove(gameEngine, child.move, { metaGame });
      result.push({
        ...child,
        children: filterPersistableExplorationTree(
          gameEngine,
          child.children || [],
          metaGame
        ),
      });
      gameEngine.stack.pop();
      gameEngine.load(-1);
      gameEngine.gameover = false;
      gameEngine.winner = [];
    } catch (err) {
      console.warn(`Skipping unpersistable exploration branch: ${child.move}`, err);
    }
  }
  return result;
}

export function engineAtMove(metaGame: string, gameState: string, move: number): GameBase {
  const engine = GameFactory(metaGame, gameState);
  if (!engine) {
    throw new Error(`Unknown metaGame ${metaGame}`);
  }
  if (move + 1 < engine.stack.length) {
    engine.gameover = false;
    engine.winner = [];
  }
  engine.stack = engine.stack.slice(0, move);
  engine.load(-1);
  return engine;
}

export function filterExplorationTreeForSave(
  metaGame: string,
  gameState: string,
  move: number,
  tree: ExplorationTreeNode | ExplorationTreeNode[],
  isPublic: boolean
): ExplorationTreeNode | ExplorationTreeNode[] {
  const engine = engineAtMove(metaGame, gameState, move);
  if (isPublic && !Array.isArray(tree)) {
    return {
      ...tree,
      children: filterPersistableExplorationTree(engine, tree.children || [], metaGame),
    };
  }
  const children = Array.isArray(tree) ? tree : tree.children || [];
  return filterPersistableExplorationTree(engine, children, metaGame);
}
