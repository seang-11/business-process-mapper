/** One colour per tool category, so a category looks the same in chips, pills and group headers. Keep in sync with the Category field options on Elements. */
const STYLES: Record<string, { dot: string; fg: string; bg: string }> = {
  Communication: { dot: 'hsl(217 80% 55%)', fg: 'hsl(217 65% 38%)', bg: 'hsl(217 90% 95%)' },
  'Customer support': { dot: 'hsl(205 80% 55%)', fg: 'hsl(205 70% 34%)', bg: 'hsl(205 90% 95%)' },
  CRM: { dot: 'hsl(24 90% 55%)', fg: 'hsl(24 80% 36%)', bg: 'hsl(24 95% 94%)' },
  'Sales outreach': { dot: 'hsl(14 85% 55%)', fg: 'hsl(14 75% 38%)', bg: 'hsl(14 90% 95%)' },
  Database: { dot: 'hsl(188 70% 40%)', fg: 'hsl(188 70% 26%)', bg: 'hsl(188 65% 93%)' },
  Forms: { dot: 'hsl(165 60% 40%)', fg: 'hsl(165 60% 26%)', bg: 'hsl(165 55% 93%)' },
  'Documents & storage': { dot: 'hsl(220 10% 55%)', fg: 'hsl(220 10% 35%)', bg: 'hsl(220 14% 94%)' },
  'Contracts & e-signature': { dot: 'hsl(235 55% 58%)', fg: 'hsl(235 50% 40%)', bg: 'hsl(235 70% 96%)' },
  'Finance & payments': { dot: 'hsl(152 55% 42%)', fg: 'hsl(152 55% 28%)', bg: 'hsl(152 60% 94%)' },
  'HR & people': { dot: 'hsl(285 55% 58%)', fg: 'hsl(285 50% 40%)', bg: 'hsl(285 70% 96%)' },
  'Meetings & scheduling': { dot: 'hsl(192 85% 48%)', fg: 'hsl(192 75% 30%)', bg: 'hsl(192 90% 94%)' },
  'Project management': { dot: 'hsl(262 65% 58%)', fg: 'hsl(262 55% 42%)', bg: 'hsl(262 80% 96%)' },
  'Security & access': { dot: 'hsl(215 20% 40%)', fg: 'hsl(215 20% 28%)', bg: 'hsl(215 20% 92%)' },
  'Social media': { dot: 'hsl(43 90% 50%)', fg: 'hsl(43 85% 30%)', bg: 'hsl(45 95% 92%)' },
  Marketing: { dot: 'hsl(80 60% 42%)', fg: 'hsl(80 60% 26%)', bg: 'hsl(80 60% 92%)' },
  'Websites & e-commerce': { dot: 'hsl(305 55% 52%)', fg: 'hsl(305 50% 36%)', bg: 'hsl(305 70% 96%)' },
  'Video & audio': { dot: 'hsl(2 75% 56%)', fg: 'hsl(2 70% 40%)', bg: 'hsl(2 90% 96%)' },
  Design: { dot: 'hsl(325 70% 58%)', fg: 'hsl(325 60% 40%)', bg: 'hsl(325 85% 96%)' },
  AI: { dot: 'hsl(250 70% 60%)', fg: 'hsl(250 55% 42%)', bg: 'hsl(250 85% 96%)' },
  Automation: { dot: 'hsl(340 70% 55%)', fg: 'hsl(340 65% 40%)', bg: 'hsl(340 85% 96%)' },
  'Web data & scraping': { dot: 'hsl(140 45% 42%)', fg: 'hsl(140 45% 28%)', bg: 'hsl(140 45% 93%)' },
  'Building & dev': { dot: 'hsl(30 55% 45%)', fg: 'hsl(30 55% 30%)', bg: 'hsl(30 60% 93%)' },
};

export const CATEGORY_NAMES = Object.keys(STYLES);

const FALLBACK = { dot: 'hsl(220 9% 70%)', fg: 'hsl(220 9% 40%)', bg: 'hsl(220 14% 95%)' };

export const categoryStyle = (name: string) => STYLES[name] ?? FALLBACK;
