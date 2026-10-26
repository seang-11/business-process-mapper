import type { LucideIcon } from 'lucide-react';
import { ICON_LIBRARY } from '@/components/ElementIcon';

/**
 * A process's icon: the one picked for it in Process settings, or else one
 * that fits its name (an invoice gets a receipt, onboarding a handshake), so
 * every card looks like what it's about from day one.
 */
const GUESSES: [RegExp, string][] = [
  [/invoice|billing|\bpaid\b|payment/i, 'ReceiptText'],
  [/expense|receipt|reimburs/i, 'HandCoins'],
  [/employee|hire|hiring|recruit/i, 'UserRoundPlus'],
  [/onboard/i, 'Handshake'],
  [/feedback|testimonial|review/i, 'MessageSquareHeart'],
  [/lead|prospect/i, 'Magnet'],
  [/meeting|follow.?up/i, 'CalendarCheck'],
  [/video|film|record/i, 'Clapperboard'],
  [/content|repurpos|post|social/i, 'Scissors'],
  [/support|ticket|help/i, 'LifeBuoy'],
  [/sale|deal|proposal/i, 'BadgeDollarSign'],
  [/market|campaign/i, 'Megaphone'],
  [/train/i, 'GraduationCap'],
];

/** The icon name that fits a process's name, for when none was picked. */
export const processIconName = (name: string) => GUESSES.find(([re]) => re.test(name))?.[1] ?? 'Workflow';

export function processIcon(p: { name: string; icon?: string }): LucideIcon {
  const own = p.icon?.trim();
  if (own && Object.prototype.hasOwnProperty.call(ICON_LIBRARY, own)) return ICON_LIBRARY[own];
  return ICON_LIBRARY[processIconName(p.name)];
}
