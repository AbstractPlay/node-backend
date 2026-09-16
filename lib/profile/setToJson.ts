export function setToJSONReplacer(_key: unknown, value: unknown) {
  if (typeof value === 'object' && value instanceof Set) {
    return [...value];
  }
  return value;
}
