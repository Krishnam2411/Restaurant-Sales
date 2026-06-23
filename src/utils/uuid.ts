let _seq = 0;

/**
 * Generates a datetime-serial ID.
 * Format: YYYYMMDDHHmmssSSS_NNN  (17 date digits + underscore + 3-digit sequence)
 * Example: 20260623113246123_001
 *
 * Properties:
 * - Lexicographically sortable (chronological order)
 * - Human-readable / debuggable (contains the creation timestamp)
 * - Unique: monotonically incrementing counter handles same-millisecond bursts
 */
export function v4(): string {
  const now = new Date();
  const Y = now.getFullYear();
  const M = String(now.getMonth() + 1).padStart(2, '0');
  const D = String(now.getDate()).padStart(2, '0');
  const h = String(now.getHours()).padStart(2, '0');
  const m = String(now.getMinutes()).padStart(2, '0');
  const s = String(now.getSeconds()).padStart(2, '0');
  const ms = String(now.getMilliseconds()).padStart(3, '0');
  _seq = (_seq + 1) % 1000;
  const seq = String(_seq).padStart(3, '0');
  return `${Y}${M}${D}${h}${m}${s}${ms}_${seq}`;
}

/**
 * Returns a short, human-readable display reference for an ID.
 *
 * For datetime-serial IDs (YYYYMMDDHHmmssSSS_NNN, length 21):
 *   → "HH:MM-NNN"  e.g. "11:32-001"
 *
 * For legacy UUIDs or any other format:
 *   → last 5 chars uppercased  (backwards-compatible with old data)
 */
export function shortRef(id: string): string {
  // Datetime-serial: 20260623113246123_001  (length 21, underscore at index 17)
  if (id.length === 21 && id[17] === '_') {
    const hh = id.slice(8, 10);   // hours
    const mm = id.slice(10, 12);  // minutes
    const seq = id.slice(18, 21); // NNN
    return `${hh}:${mm}-${seq}`;
  }
  // Fallback for legacy UUIDs / unknown formats
  return id.slice(-5).toUpperCase();
}
