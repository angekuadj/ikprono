/**
 * Generate a UUID v4 compatible with all environments (browser, Node.js, etc.)
 * Falls back to a simple random ID generation if crypto.randomUUID is not available
 */
export function generateUUID(): string {
  // Try modern crypto API first
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }

  // Fallback for environments without crypto.randomUUID
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}
