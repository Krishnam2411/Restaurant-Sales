import Sanscript from 'sanscript';

export function suggestHindiName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return '';
  try {
    const result = Sanscript.t(trimmed, 'itrans', 'devanagari');
    return result.replace(/\s+/g, ' ').trim();
  } catch (err) {
    return '';
  }
}
