/** One colour per tool category, so a category looks the same in chips, pills and group headers. */
const STYLES: Record<string, { dot: string; fg: string; bg: string }> = {
  Communication: { dot: 'hsl(217 80% 55%)', fg: 'hsl(217 65% 38%)', bg: 'hsl(217 90% 95%)' },
  'Project management': { dot: 'hsl(262 65% 58%)', fg: 'hsl(262 55% 42%)', bg: 'hsl(262 80% 96%)' },
  'CRM & sales': { dot: 'hsl(24 90% 55%)', fg: 'hsl(24 80% 36%)', bg: 'hsl(24 95% 94%)' },
  'Forms & data': { dot: 'hsl(188 70% 40%)', fg: 'hsl(188 70% 26%)', bg: 'hsl(188 65% 93%)' },
  'Finance & payments': { dot: 'hsl(152 55% 42%)', fg: 'hsl(152 55% 28%)', bg: 'hsl(152 60% 94%)' },
  'Documents & storage': { dot: 'hsl(220 10% 55%)', fg: 'hsl(220 10% 35%)', bg: 'hsl(220 14% 94%)' },
  'Meetings & scheduling': { dot: 'hsl(199 85% 50%)', fg: 'hsl(199 75% 32%)', bg: 'hsl(199 90% 94%)' },
  'Automation & AI': { dot: 'hsl(336 70% 56%)', fg: 'hsl(336 65% 40%)', bg: 'hsl(336 85% 96%)' },
  'Video & creative': { dot: 'hsl(2 75% 56%)', fg: 'hsl(2 70% 40%)', bg: 'hsl(2 90% 96%)' },
  'Social & marketing': { dot: 'hsl(43 90% 50%)', fg: 'hsl(43 85% 30%)', bg: 'hsl(45 95% 92%)' },
  'HR & people': { dot: 'hsl(285 55% 58%)', fg: 'hsl(285 50% 40%)', bg: 'hsl(285 70% 96%)' },
  'Security & access': { dot: 'hsl(215 20% 40%)', fg: 'hsl(215 20% 28%)', bg: 'hsl(215 20% 92%)' },
  'Building & dev': { dot: 'hsl(30 55% 45%)', fg: 'hsl(30 55% 30%)', bg: 'hsl(30 60% 93%)' },
};

export const CATEGORY_NAMES = Object.keys(STYLES);

const FALLBACK = { dot: 'hsl(220 9% 70%)', fg: 'hsl(220 9% 40%)', bg: 'hsl(220 14% 95%)' };

export const categoryStyle = (name: string) => STYLES[name] ?? FALLBACK;
