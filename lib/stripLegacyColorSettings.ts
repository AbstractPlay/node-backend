/**
 * Remove legacy `color` keys from user settings blobs (named palettes / colour-blind toggle).
 * Does not mutate the input object.
 */
export function stripColorFromSettings(
  settings: Record<string, unknown> | null | undefined,
): Record<string, unknown> {
  if (settings == null || typeof settings !== "object" || Array.isArray(settings)) {
    return {};
  }

  const result: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(settings)) {
    if (key === "all") {
      if (value != null && typeof value === "object" && !Array.isArray(value)) {
        const all = { ...(value as Record<string, unknown>) };
        delete all.color;
        result.all = all;
      } else if (value !== undefined) {
        result.all = value;
      }
      continue;
    }

    if (value != null && typeof value === "object" && !Array.isArray(value)) {
      const nested = { ...(value as Record<string, unknown>) };
      delete nested.color;
      result[key] = nested;
    } else if (value !== undefined) {
      result[key] = value;
    }
  }

  return result;
}
