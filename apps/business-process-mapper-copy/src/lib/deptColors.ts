/**
 * Department colors. Each department gets its own color: one an admin picked,
 * or the next unused one from this list, so two departments never share a
 * color. The order puts the most different colors first.
 */
export const DEPT_PALETTE: { hue: number; name: string }[] = [
  { hue: 217, name: 'Blue' },
  { hue: 145, name: 'Green' },
  { hue: 28, name: 'Orange' },
  { hue: 275, name: 'Purple' },
  { hue: 330, name: 'Pink' },
  { hue: 182, name: 'Teal' },
  { hue: 48, name: 'Amber' },
  { hue: 2, name: 'Red' },
  { hue: 95, name: 'Lime' },
  { hue: 245, name: 'Indigo' },
];

/**
 * A hue for every department name. Picked colors are kept (the first to claim
 * one wins if two picked the same); the rest take unused palette colors in
 * alphabetical order of name. Past ten, hues are spread around the wheel.
 */
export function assignDeptHues(names: string[], picked: Map<string, number>): Map<string, number> {
  const out = new Map<string, number>();
  const used = new Set<number>();
  const sorted = [...new Set(names.map((n) => n.trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  for (const name of sorted) {
    const hue = picked.get(name);
    if (hue !== undefined && !used.has(hue)) {
      out.set(name, hue);
      used.add(hue);
    }
  }
  let extra = 0;
  for (const name of sorted) {
    if (out.has(name)) continue;
    const free = DEPT_PALETTE.find((c) => !used.has(c.hue));
    const hue = free ? free.hue : Math.round((extra++ * 137.5 + 10) % 360);
    out.set(name, hue);
    used.add(hue);
  }
  return out;
}

/** Light background and dark text for a department tag in this hue. */
export const deptTag = (hue: number | undefined) =>
  hue === undefined
    ? { backgroundColor: 'hsl(var(--muted))' }
    : { backgroundColor: `hsl(${hue} 80% 93%)`, color: `hsl(${hue} 45% 30%)` };
