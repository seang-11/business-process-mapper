import ElementIcon from './ElementIcon';
import type { Who } from '@/lib/roleBrief';

// The same colors the Brain uses, so a role looks the same everywhere.
const HUES = [217, 262, 152, 24, 336, 188, 45, 4, 280, 200];
export const hueFor = (name: string) => {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return HUES[h % HUES.length];
};
const initialsOf = (name: string) =>
  name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('') || '?';

/** A role's colored initials, or an app's logo. */
export default function RoleAvatar({ w, size }: { w: Who; size: number }) {
  if (w.kind !== 'person') {
    return <ElementIcon name={w.name} image={w.image} icon={w.icon} typeIcon={w.typeIcon} color={w.color} size={size} />;
  }
  const hue = hueFor(w.name);
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center rounded-full font-semibold leading-none"
      style={{
        width: size + 4,
        height: size + 4,
        fontSize: Math.max(7, Math.round((size + 4) * 0.42)),
        backgroundColor: `hsl(${hue} 85% 92%)`,
        color: `hsl(${hue} 55% 36%)`,
      }}
    >
      {initialsOf(w.name)}
    </span>
  );
}
