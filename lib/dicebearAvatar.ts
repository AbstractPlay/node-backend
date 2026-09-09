export const AVATAR_STYLES = [
  'blobs',
  'glass',
  'rings',
  'identicon',
  'initial-face',
  'patchwork',
  'shape-grid',
  'shapes',
  'waves',
  'cameo',
  'clay',
  'cutouts',
  'constellation',
  'landscape',
  'planets',
] as const;

export type AvatarStyle = typeof AVATAR_STYLES[number];

const STYLE_SET = new Set<string>(AVATAR_STYLES);

export const AVATAR_SEED_MAX_LENGTH = 64;

const SEED_PATTERN = /^[A-Za-z0-9_-]+$/;

export type ValidatedAvatar = {
  style: AvatarStyle;
  seed: string;
};

export function isAllowedAvatarStyle(style: unknown): style is AvatarStyle {
  return typeof style === 'string' && STYLE_SET.has(style);
}

export function validateAvatarSeed(seed: unknown): { ok: true; seed: string } | { ok: false; error: string } {
  if (typeof seed !== 'string') {
    return { ok: false, error: 'Avatar seed must be a string.' };
  }
  const trimmed = seed.trim();
  if (!trimmed) {
    return { ok: false, error: 'Avatar seed cannot be empty.' };
  }
  if (trimmed.length > AVATAR_SEED_MAX_LENGTH) {
    return {
      ok: false,
      error: `Avatar seed must be at most ${AVATAR_SEED_MAX_LENGTH} characters.`,
    };
  }
  if (!SEED_PATTERN.test(trimmed)) {
    return {
      ok: false,
      error: 'Avatar seed may only contain letters, numbers, hyphens, and underscores.',
    };
  }
  return { ok: true, seed: trimmed };
}

export function validateAvatar(
  avatar: unknown,
): { ok: true; avatar: ValidatedAvatar } | { ok: false; error: string } {
  if (avatar === null || avatar === undefined) {
    return { ok: false, error: 'Avatar must be an object with style and seed.' };
  }
  if (typeof avatar !== 'object') {
    return { ok: false, error: 'Avatar must be an object with style and seed.' };
  }
  const record = avatar as Record<string, unknown>;
  if (!isAllowedAvatarStyle(record.style)) {
    return { ok: false, error: 'Avatar style is not allowed.' };
  }
  const seedResult = validateAvatarSeed(record.seed);
  if (!seedResult.ok) {
    return { ok: false, error: seedResult.error };
  }
  return {
    ok: true,
    avatar: {
      style: record.style,
      seed: seedResult.seed,
    },
  };
}

export function normalizeAvatarInSettings(
  settings: Record<string, unknown>,
): { ok: true; hasAvatar: boolean } | { ok: false; error: string } {
  const all = settings.all;
  if (all === undefined || all === null || typeof all !== 'object') {
    return { ok: true, hasAvatar: false };
  }
  const profile = (all as Record<string, unknown>).profile;
  if (profile === undefined || profile === null || typeof profile !== 'object') {
    return { ok: true, hasAvatar: false };
  }
  const profileRecord = profile as Record<string, unknown>;
  if (!Object.prototype.hasOwnProperty.call(profileRecord, 'avatar')) {
    return { ok: true, hasAvatar: false };
  }
  const rawAvatar = profileRecord.avatar;
  if (rawAvatar === null) {
    delete profileRecord.avatar;
    if (Object.keys(profileRecord).length === 0) {
      delete (all as Record<string, unknown>).profile;
    }
    return { ok: true, hasAvatar: false };
  }
  const validated = validateAvatar(rawAvatar);
  if (!validated.ok) {
    return { ok: false, error: validated.error };
  }
  profileRecord.avatar = validated.avatar;
  return { ok: true, hasAvatar: true };
}
