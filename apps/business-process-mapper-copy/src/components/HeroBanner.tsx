import { useEffect, useState } from 'react';
import granola from '@/assets/logos/granola.svg';
import asana from '@/assets/logos/asana.svg';
import hubspot from '@/assets/logos/hubspot.svg';
import gmail from '@/assets/logos/gmail.svg';
import slack from '@/assets/logos/slack.svg';
import notion from '@/assets/logos/notion.svg';

// A real process from the map: Post-Meeting Follow-up. A meeting lands in Granola,
// the Gumloop agent wakes up, then hands the work to each app in turn.
const NODES: Record<string, { x: number; y: number; src: string; name: string }> = {
  granola: { x: 34, y: 88, src: granola, name: 'Granola' },
  gumloop: { x: 140, y: 88, src: '', name: 'Gumloop' },
  asana: { x: 260, y: 22, src: asana, name: 'Asana' },
  hubspot: { x: 330, y: 62, src: hubspot, name: 'HubSpot' },
  gmail: { x: 340, y: 120, src: gmail, name: 'Gmail' },
  slack: { x: 260, y: 156, src: slack, name: 'Slack' },
  notion: { x: 205, y: 160, src: notion, name: 'Notion' },
};
const STEPS: { from: string; to: string; label: string }[] = [
  { from: 'granola', to: 'gumloop', label: 'Meeting filed in Granola, agent wakes up' },
  { from: 'gumloop', to: 'asana', label: 'Creates the Asana tasks' },
  { from: 'gumloop', to: 'hubspot', label: 'Logs the meeting in HubSpot' },
  { from: 'gumloop', to: 'gmail', label: 'Drafts the follow-up email' },
  { from: 'gumloop', to: 'slack', label: 'Posts the summary in Slack' },
  { from: 'gumloop', to: 'notion', label: 'Saves it to the meeting log' },
];
const STEP_MS = 2600;
const curve = (a: string, b: string) => {
  const p = NODES[a], q = NODES[b];
  const mx = (p.x + q.x) / 2;
  return `M${p.x} ${p.y} C${mx} ${p.y} ${mx} ${q.y} ${q.x} ${q.y}`;
};

// Gumloop-style agent mascots: black shapes with two white eyes. The agent changes
// shape as it works, blinks, and its eyes look toward whichever app it's handing work to.
const SHAPES = [
  // blob
  <path key="blob" d="M14 3c6.5 0 11 4.6 11 10.6C25 20 20.4 25 13.6 25 7.3 25 3 20.6 3 14.6 3 8 7.6 3 14 3z" />,
  // square
  <rect key="sq" x="3.5" y="4" width="21" height="20" rx="4" />,
  // flower
  <g key="fl">{[[14, 6.5], [21.5, 14], [14, 21.5], [6.5, 14], [8.7, 8.7], [19.3, 8.7], [19.3, 19.3], [8.7, 19.3]].map(([x, y], i) => <circle key={i} cx={x} cy={y} r="5.2" />)}<circle cx="14" cy="14" r="7" /></g>,
  // flame
  <path key="fl2" d="M14 2.5c1.2 3.6 4 4.8 6.6 7.8 2.4 2.8 3.4 5.4 3.4 8C24 23 19.7 26 14 26S4 23 4 18.3c0-3.3 1.6-5.6 3.6-7.4.4 1.8 1.4 3 2.6 3.6C10 10 11.6 5.8 14 2.5z" />,
];

function Agent({ shape, look, working }: { shape: number; look: { x: number; y: number }; working: boolean }) {
  const ex = look.x * 1.6, ey = look.y * 1.4;
  return (
    <svg viewBox="0 0 28 28" className={`h-8 w-8 ${working ? 'hb-hop' : ''}`}>
      <g key={shape} className="hb-morph" fill="#111">{SHAPES[shape % SHAPES.length]}</g>
      <g className="hb-blink" style={{ transform: `translate(${ex}px, ${ey}px)`, transition: 'transform .5s ease' }}>
        <ellipse cx="11.2" cy="14.5" rx="1.6" ry="2.6" fill="#fff" />
        <ellipse cx="16.8" cy="14.5" rx="1.6" ry="2.6" fill="#fff" />
      </g>
    </svg>
  );
}

function Network() {
  const [step, setStep] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setStep((s) => (s + 1) % (STEPS.length + 1)), STEP_MS);
    return () => clearInterval(t);
  }, []);
  // The last tick is a short pause where everything glows "done" before the loop restarts.
  const done = step === STEPS.length;
  const cur = STEPS[step];
  const reached = new Set(['granola', ...STEPS.slice(0, done ? STEPS.length : step).map((s) => s.to)]);
  return (
    <div className="relative w-[380px] shrink-0">
      <div className="relative h-[180px]">
        <svg viewBox="0 0 380 180" className="absolute inset-0 h-full w-full" fill="none">
          {STEPS.map((s, i) => {
            const d = curve(s.from, s.to);
            const active = i === step;
            const past = done || i < step;
            return (
              <g key={i}>
                <path d={d} stroke="white" strokeOpacity={active ? 0.9 : past ? 0.35 : 0.1} strokeWidth={active ? 2 : 1.5} strokeDasharray={past || active ? undefined : '3 5'} className="transition-all duration-500" />
                {active && (
                  <circle key={`p${step}`} r="3.5" fill="#fff" style={{ filter: 'drop-shadow(0 0 6px hsl(var(--primary)))' }}>
                    <animateMotion dur="1.6s" fill="freeze" path={d} keyPoints="0;1" keyTimes="0;1" calcMode="spline" keySplines="0.5 0 0.3 1" />
                  </circle>
                )}
              </g>
            );
          })}
        </svg>
        {Object.entries(NODES).map(([id, n]) => {
          const isAgent = id === 'gumloop';
          const on = reached.has(id);
          const target = cur && cur.to === id;
          const working = isAgent && !done && step > 0;
          return (
            <div key={id} className="absolute -translate-x-1/2 -translate-y-1/2" style={{ left: n.x, top: n.y }}>
              <div
                className={`relative flex items-center justify-center rounded-xl bg-white transition-all duration-500 ${isAgent ? 'h-12 w-12' : 'h-9 w-9'} ${
                  on || target ? 'opacity-100' : 'opacity-40'
                } ${isAgent && step > 0 ? 'shadow-[0_0_0_3px_hsl(var(--primary)),0_0_28px_hsl(var(--primary)/0.7)]' : 'shadow-[0_6px_16px_-4px_rgba(0,0,0,0.5)]'}`}
              >
                {isAgent ? (
                  <Agent
                    shape={step}
                    working={working}
                    look={(() => {
                      if (!cur) return { x: 0, y: 0 };
                      const t = NODES[cur.to === 'gumloop' ? cur.from : cur.to];
                      const dx = t.x - n.x, dy = t.y - n.y, m = Math.hypot(dx, dy) || 1;
                      return { x: dx / m, y: dy / m };
                    })()}
                  />
                ) : (
                  <img src={n.src} alt={n.name} className="h-5 w-5" />
                )}
                {working && <span className="absolute -inset-2 animate-ping rounded-2xl border border-primary/60" style={{ animationDuration: '1.8s' }} />}
                {target && <span key={`f${step}`} className="hb-land pointer-events-none absolute -inset-1 rounded-[14px] ring-2 ring-primary" />}
                {on && !isAgent && id !== 'granola' && (
                  <span className="absolute -right-1.5 -top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[9px] font-bold text-white ring-2 ring-[#0a0f1c]">✓</span>
                )}
              </div>
              {isAgent && <span className="absolute left-1/2 top-full mt-1.5 -translate-x-1/2 whitespace-nowrap text-[10px] font-semibold uppercase tracking-wider text-white/60">Gumloop agent</span>}
            </div>
          );
        })}
      </div>
      <div className="mt-1 flex h-7 items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-2.5 text-xs">
        <span className="font-mono text-[10px] text-white/45">{done ? 'DONE' : `STEP ${step + 1}/${STEPS.length}`}</span>
        <span key={step} className="hb-cap truncate text-white/90">{done ? 'Follow-up handled, nobody lifted a finger' : cur.label}</span>
      </div>
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
        @keyframes hbLand{0%,55%{opacity:0;transform:scale(.8)}70%{opacity:1;transform:scale(1.1)}100%{opacity:0;transform:scale(1.3)}}
        .hb-land{animation:hbLand 1.8s ease-out forwards}
        @keyframes hbCap{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:none}}
        .hb-cap{animation:hbCap .4s ease-out}
        @keyframes hbBlink{0%,92%,100%{transform:scaleY(1)}95%{transform:scaleY(.1)}}
        .hb-blink ellipse{transform-box:fill-box;transform-origin:center;animation:hbBlink 3.6s infinite}
        @keyframes hbHop{0%,100%{transform:translateY(0)}40%{transform:translateY(-3px) scale(1.04,.96)}}
        .hb-hop{animation:hbHop 1.3s ease-in-out infinite}
        @keyframes hbMorph{from{transform:scale(.6) rotate(-20deg);opacity:.3}to{transform:none;opacity:1}}
        .hb-morph{transform-box:fill-box;transform-origin:center;animation:hbMorph .45s cubic-bezier(.3,1.6,.5,1)}
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
            See how people, departments and apps work together. Here's one of them running live.
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
