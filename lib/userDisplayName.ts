export const MAX_USER_DISPLAY_NAME_LENGTH = 64;

export type UserDisplayNameValidationResult =
  | { ok: true; name: string }
  | { ok: false; message: string };

export function isBlankDisplayName(value: unknown): boolean {
  return typeof value !== 'string' || value.trim() === '';
}

export function placeholderUserDisplayName(userId: string): string {
  return `Player-${userId.slice(0, 8)}`;
}

export function validateUserDisplayName(value: unknown): UserDisplayNameValidationResult {
  if (typeof value !== 'string') {
    return { ok: false, message: 'Name must be a string.' };
  }

  const name = value.trim();
  if (name.length === 0) {
    return { ok: false, message: 'Name is required.' };
  }
  if (name.length > MAX_USER_DISPLAY_NAME_LENGTH) {
    return {
      ok: false,
      message: `Name must be at most ${MAX_USER_DISPLAY_NAME_LENGTH} characters.`,
    };
  }

  return { ok: true, name };
}
