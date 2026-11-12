import hubspot from '@/assets/logos/hubspot.svg';
import slack from '@/assets/logos/slack.svg';
import gmail from '@/assets/logos/gmail.svg';
import notion from '@/assets/logos/notion.svg';
import stripe from '@/assets/logos/stripe.svg';
import sheets from '@/assets/logos/googlesheets.svg';
import zapier from '@/assets/logos/zapier.svg';

// Positions in a 360x160 box. The hub sits in the middle; apps orbit it.
const NODES = [
  { id: 'hubspot', x: 40, y: 34, src: hubspot },
  { id: 'gmail', x: 40, y: 126, src: gmail },
  { id: 'slack', x: 110, y: 18, src: slack },
  { id: 'notion', x: 250, y: 142, src: notion },
  { id: 'stripe', x: 320, y: 38, src: stripe },
  { id: 'sheets', x: 320, y: 122, src: sheets },
  { id: 'zapier', x: 250, y: 18, src: zapier },
];
const at = (id: string) => NODES.find((n) => n.id === id)!;
const LINKS: [string, string][] = [
  ['hubspot', 'slack'], ['slack', 'zapier'], ['zapier', 'stripe'], ['stripe', 'sheets'],
  ['sheets', 'notion'], ['notion', 'gmail'], ['gmail', 'hubspot'], ['hubspot', 'zapier'], ['gmail', 'sheets'],
];
const curve = (a: string, b: string) => {
  const p = at(a), q = at(b);
  const mx = (p.x + q.x) / 2;
  return `M${p.x} ${p.y} C${mx} ${p.y} ${mx} ${q.y} ${q.x} ${q.y}`;
};

const DUR = (i: number) => 4.5 + (i % 3) * 1.2;
// When a packet lands on a node, that node flashes. Each node flashes in step with its first incoming link.
const flashFor = (id: string) => {
  const i = LINKS.findIndex(([a, b]) => b === id || a === id);
  return i < 0 ? null : { dur: DUR(i), delay: i * 0.9 };
};

function Network() {
  return (
    <div className="relative h-[160px] w-[360px] shrink-0">
      <svg viewBox="0 0 360 160" className="absolute inset-0 h-full w-full" fill="none">
        <defs>
          <linearGradient id="hb-line" x1="0" x2="1">
            <stop offset="0" stopColor="hsl(var(--primary))" stopOpacity="0.2" />
            <stop offset="1" stopColor="#ffffff" stopOpacity="0.55" />
          </linearGradient>
        </defs>
        {LINKS.map(([a, b], i) => {
          const d = curve(a, b);
          return (
            <g key={i}>
              <path d={d} stroke="url(#hb-line)" strokeWidth="1.5" strokeDasharray="4 5" className="hb-dash" />
              {[0, 0.08, 0.16].map((lag, k) => (
                <circle key={k} r={3 - k * 0.8} fill="#ffffff" opacity={1 - k * 0.3} style={{ filter: 'drop-shadow(0 0 5px hsl(var(--primary)))' }}>
                  <animateMotion dur={`${DUR(i)}s`} begin={`${i * 0.9 + lag * 3}s`} repeatCount="indefinite" path={d} keyPoints="0;1" keyTimes="0;1" calcMode="spline" keySplines="0.6 0 0.3 1" />
                </circle>
              ))}
            </g>
          );
        })}
      </svg>
      {NODES.map((n, i) =>
        n.src ? (
          <div
            key={n.id}
            className="hb-float absolute flex h-9 w-9 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-xl border border-white/15 bg-white shadow-[0_6px_16px_-4px_rgba(0,0,0,0.5)]"
            style={{ left: n.x, top: n.y, animationDelay: `${i * 0.4}s` }}
          >
            <img src={n.src} alt="" className="h-5 w-5" />
            {flashFor(n.id) && (
              <span
                className="hb-flash pointer-events-none absolute -inset-1 rounded-[14px] ring-2 ring-primary"
                style={{ animationDuration: `${flashFor(n.id)!.dur}s`, animationDelay: `${flashFor(n.id)!.delay}s` }}
              />
            )}
          </div>
        ) : (
          <div
            key={n.id}
            className="absolute flex h-12 w-12 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-blue-800 ring-1 ring-white/20 shadow-[0_0_28px_hsl(var(--primary)/0.6)]"
            style={{ left: n.x, top: n.y }}
          >
            <span className="absolute inset-0 animate-ping rounded-2xl bg-primary/30" style={{ animationDuration: '2.8s' }} />
            <svg viewBox="0 0 24 24" className="relative h-6 w-6 text-white" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="3" width="6" height="6" rx="1.5" /><rect x="15" y="15" width="6" height="6" rx="1.5" /><path d="M9 6h4a2 2 0 0 1 2 2v7" />
            </svg>
          </div>
        ),
      )}
    </div>
  );
}

export default function HeroBanner({ processes, departments }: { processes?: number; departments?: number }) {
  return (
    <header className="relative overflow-hidden rounded-2xl border border-white/10 bg-[#0a0f1c] px-6 py-6 text-white shadow-[0_20px_50px_-20px_rgba(11,21,48,0.7)]">
      <style>{`
        @keyframes hbDash{to{stroke-dashoffset:-90}}
        .hb-dash{animation:hbDash 5s linear infinite}
        @keyframes hbFloat{0%,100%{margin-top:0}50%{margin-top:-2px}}
        .hb-float{animation:hbFloat 7s ease-in-out infinite}
        @keyframes hbFlash{0%,88%{opacity:0;transform:scale(.85)}94%{opacity:1;transform:scale(1.08)}100%{opacity:0;transform:scale(1.25)}}
        .hb-flash{opacity:0;animation:hbFlash linear infinite}
      `}</style>
      {/* Grid + glow */}
      <div
        className="pointer-events-none absolute inset-0 opacity-60"
        style={{
          backgroundImage:
            'linear-gradient(rgba(255,255,255,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.06) 1px, transparent 1px)',
          backgroundSize: '22px 22px',
          maskImage: 'radial-gradient(ellipse at 70% 50%, black 30%, transparent 85%)',
        }}
      />
      <div className="pointer-events-none absolute -right-10 -top-16 h-56 w-56 rounded-full bg-primary/40 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-20 left-1/3 h-40 w-40 rounded-full bg-primary/20 blur-3xl" />

      <div className="relative flex items-center justify-between gap-6">
        <div className="min-w-0">
          <p className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-white/70">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary" /> Welcome to the process map
          </p>
          <h1 className="mt-3 text-xl font-semibold tracking-tight sm:text-2xl">
            Every process in the company,{' '}
            <span className="underline decoration-primary decoration-[3px] underline-offset-[6px]">connected.</span>
          </h1>
          <p className="mt-1.5 max-w-sm text-sm text-white/65">
            See how people, departments and apps work together. Pick a process to follow every step.
          </p>
          {processes !== undefined && (
            <div className="mt-4 flex flex-wrap gap-2 text-xs font-medium">
              <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1"><b className="text-white">{processes}</b> processes</span>
              <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1"><b className="text-white">{departments}</b> departments</span>
            </div>
          )}
        </div>
        <div className="hidden md:block">
          <Network />
        </div>
      </div>
    </header>
  );
}
