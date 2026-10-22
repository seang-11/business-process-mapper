/** Soft tints for avatars and process tiles, picked from a name so the same thing keeps its colour everywhere. */
export const TINTS = [
  { fg: 'hsl(217 65% 42%)', bg: 'hsl(217 90% 95%)' },
  { fg: 'hsl(262 55% 48%)', bg: 'hsl(262 80% 96%)' },
  { fg: 'hsl(152 55% 32%)', bg: 'hsl(152 60% 94%)' },
  { fg: 'hsl(24 80% 42%)', bg: 'hsl(24 95% 94%)' },
  { fg: 'hsl(336 65% 46%)', bg: 'hsl(336 85% 96%)' },
  { fg: 'hsl(188 70% 30%)', bg: 'hsl(188 65% 93%)' },
];

export const hashOf = (name: string) => {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return h;
};

export const tintFor = (name: string) => TINTS[hashOf(name) % TINTS.length];

export const initialsOf = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('');
