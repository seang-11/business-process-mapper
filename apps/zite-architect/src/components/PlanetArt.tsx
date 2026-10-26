/** The kinds of planet a department can be. */
export const PLANET_TYPES = ['gas', 'ringed', 'lava', 'ice', 'rocky', 'ocean'] as const;
export type PlanetType = (typeof PLANET_TYPES)[number];

export const PLANET_LABEL: Record<PlanetType, string> = {
  gas: 'Gas giant',
  ringed: 'Ringed planet',
  lava: 'Lava world',
  ice: 'Ice world',
  rocky: 'Cratered world',
  ocean: 'Ocean world',
};

/** Each department keeps the same planet: handed out in name order, so the first six never repeat. */
export function planetTypes(names: string[]): Map<string, PlanetType> {
  const sorted = [...new Set(names)].sort((a, b) => (a === '' ? 1 : b === '' ? -1 : a.localeCompare(b)));
  return new Map(sorted.map((n, i) => [n, PLANET_TYPES[i % PLANET_TYPES.length]]));
}

const CRATERS = [
  [-18, -14, 9],
  [16, -22, 6],
  [22, 12, 11],
  [-10, 22, 7],
  [-30, 6, 5],
  [4, -2, 5],
];

/**
 * One planet, drawn in its department's color: a surface for its type, lit from
 * the top left with a shadowed far side, and rings in front of and behind it for
 * a ringed planet. Fills whatever box it is given; rings spill outside it.
 */
export default function PlanetArt({ type, hue, id, spin = 0 }: { type: PlanetType; hue: number; id: string; spin?: number }) {
  const c = (s: number, l: number, a = 1) => `hsl(${hue} ${s}% ${l}% / ${a})`;
  // Surface features drift sideways as the planet turns, wrapping round.
  const drift = (((spin % 100) + 100) % 100) - 50;
  const ring = (front: boolean) => (
    <path
      d={front ? 'M -88 0 A 88 22 0 0 0 88 0' : 'M -88 0 A 88 22 0 0 1 88 0'}
      transform="rotate(-18)"
      fill="none"
      stroke={c(55, front ? 82 : 70, front ? 0.85 : 0.5)}
      strokeWidth={9}
    />
  );
  return (
    <svg viewBox="-50 -50 100 100" className="pointer-events-none absolute inset-0 h-full w-full overflow-visible" aria-hidden="true">
      <defs>
        <clipPath id={`pc-${id}`}>
          <circle r={49} />
        </clipPath>
        <radialGradient id={`ps-${id}`} cx="32%" cy="28%" r="80%">
          <stop offset="0%" stopColor="white" stopOpacity={0.28} />
          <stop offset="42%" stopColor="white" stopOpacity={0} />
          <stop offset="78%" stopColor="#020617" stopOpacity={0.55} />
          <stop offset="100%" stopColor="#020617" stopOpacity={0.88} />
        </radialGradient>
      </defs>
      {type === 'ringed' && ring(false)}
      <g clipPath={`url(#pc-${id})`}>
        {type === 'gas' && (
          <>
            <rect x={-50} y={-50} width={100} height={100} fill={c(55, 45)} />
            {[-42, -30, -18, -6, 6, 18, 30, 42].map((y, i) => (
              <rect key={y} x={-50} y={y - 5} width={100} height={i % 3 === 0 ? 8 : 5} fill={c(55, i % 2 ? 62 : 32, 0.75)} />
            ))}
            <ellipse cx={drift * 0.6 + 10} cy={14} rx={10} ry={5} fill={c(70, 70, 0.9)} />
          </>
        )}
        {type === 'ringed' && (
          <>
            <rect x={-50} y={-50} width={100} height={100} fill={c(45, 58)} />
            {[-24, 0, 22].map((y) => (
              <rect key={y} x={-50} y={y} width={100} height={7} fill={c(45, 70, 0.5)} />
            ))}
          </>
        )}
        {type === 'lava' && (
          <>
            <rect x={-50} y={-50} width={100} height={100} fill={c(35, 13)} />
            <g transform={`translate(${drift} 0)`} stroke={c(100, 60)} strokeWidth={3} fill="none" strokeLinecap="round">
              {[-100, 0, 100].map((ox) => (
                <g key={ox} transform={`translate(${ox} 0)`}>
                  <path d="M -10 -40 Q 5 -20 -5 -5 T 15 30" />
                  <path d="M 20 -35 Q 30 -10 40 -2" />
                  <path d="M -45 10 Q -25 5 -15 20 T 5 45" />
                  <path d="M 30 20 Q 40 30 60 28" />
                </g>
              ))}
            </g>
          </>
        )}
        {type === 'ice' && (
          <>
            <rect x={-50} y={-50} width={100} height={100} fill={c(45, 80)} />
            <ellipse cx={0} cy={-46} rx={42} ry={16} fill="white" fillOpacity={0.9} />
            <ellipse cx={0} cy={48} rx={34} ry={10} fill="white" fillOpacity={0.7} />
            <g stroke={c(50, 62, 0.7)} strokeWidth={1.4} fill="none">
              <path d="M -40 -10 L -10 5 L 10 -6 L 40 12" />
              <path d="M -30 20 L 0 18 L 25 30" />
            </g>
          </>
        )}
        {type === 'rocky' && (
          <>
            <rect x={-50} y={-50} width={100} height={100} fill={c(30, 42)} />
            {CRATERS.map(([x, y, r]) => (
              <g key={`${x},${y}`}>
                <circle cx={x} cy={y} r={r} fill={c(30, 30)} />
                <circle cx={x - r * 0.25} cy={y - r * 0.25} r={r * 0.6} fill={c(28, 50, 0.6)} />
              </g>
            ))}
          </>
        )}
        {type === 'ocean' && (
          <>
            <rect x={-50} y={-50} width={100} height={100} fill={c(65, 34)} />
            <g transform={`translate(${drift} 0)`}>
              {[-100, 0, 100].map((ox) => (
                <g key={ox} transform={`translate(${ox} 0)`} fill={c(40, 62)}>
                  <path d="M -30 -25 q 15 -12 30 -2 q 8 12 -6 18 q -18 6 -24 -16 z" />
                  <path d="M 15 10 q 20 -4 28 10 q -6 16 -22 12 q -14 -6 -6 -22 z" />
                  <path d="M -40 20 q 10 -6 16 4 q -4 10 -14 6 z" />
                </g>
              ))}
            </g>
            <path d="M -45 -5 Q 0 -15 45 -2" stroke="white" strokeOpacity={0.45} strokeWidth={4} fill="none" />
          </>
        )}
        <rect x={-50} y={-50} width={100} height={100} fill={`url(#ps-${id})`} />
      </g>
      {type === 'ringed' && ring(true)}
    </svg>
  );
}
