/**
 * Finds elements a new name might duplicate: the same name written another
 * way ("Finance lead", "finance-lead"), an abbreviation ("AE" for Account
 * Executive, "Chief Executive Officer" for CEO), or a name or description that
 * contains what was typed. Used to warn before adding a second copy.
 */
const SMALL = new Set(['of', 'and', 'the', 'for', 'a']);
const norm = (s: string) =>
  s.toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, ' ').trim();
const initials = (s: string) =>
  norm(s)
    .split(' ')
    .filter((w) => w && !SMALL.has(w))
    .map((w) => w[0])
    .join('');
/** "Sales Development Rep (SDR)" -> "sdr"; a short all-caps name like "CEO" -> "ceo". */
const abbrevOf = (name: string) => {
  const inBrackets = name.match(/\(([A-Za-z]{2,6})\)/)?.[1];
  if (inBrackets) return inBrackets.toLowerCase();
  return /^[A-Z]{2,6}$/.test(name.trim()) ? name.trim().toLowerCase() : '';
};

export interface Similar<T> {
  item: T;
  /** Same: the same name or abbreviation. Close: worth a look. */
  how: 'same' | 'close';
}

export function similarNames<T extends { name: string; description?: string }>(typed: string, items: T[]): Similar<T>[] {
  const t = norm(typed);
  if (t.length < 2) return [];
  const tFlat = t.replace(/ /g, '');
  const out: Similar<T>[] = [];
  for (const item of items) {
    const n = norm(item.name);
    if (!n) continue;
    const ab = abbrevOf(item.name);
    const nameWithoutAbbrev = norm(item.name.replace(/\([^)]*\)/g, ''));
    if (t === n || t === nameWithoutAbbrev || (ab && tFlat === ab) || (abbrevOf(typed) && abbrevOf(typed) === ab)) {
      out.push({ item, how: 'same' });
    } else if (
      (tFlat.length >= 2 && tFlat.length <= 5 && !t.includes(' ') && initials(item.name.replace(/\([^)]*\)/g, '')) === tFlat) ||
      (ab && initials(typed) === ab) ||
      (t.length >= 3 && (n.includes(t) || (n.length >= 4 && t.includes(nameWithoutAbbrev)))) ||
      (t.length >= 4 && norm(item.description ?? '').includes(t))
    ) {
      out.push({ item, how: 'close' });
    }
  }
  return out.sort((a, b) => (a.how === b.how ? 0 : a.how === 'same' ? -1 : 1)).slice(0, 5);
}
