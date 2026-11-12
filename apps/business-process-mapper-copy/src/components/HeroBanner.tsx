import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import granola from '@/assets/logos/granola.svg';
import asana from '@/assets/logos/asana.svg';
import hubspot from '@/assets/logos/hubspot.svg';
import gmail from '@/assets/logos/gmail.svg';
import slack from '@/assets/logos/slack.svg';
import notion from '@/assets/logos/notion.svg';
import salesforce from '@/assets/logos/salesforce.svg';
import airtable from '@/assets/logos/airtable.svg';
import calendar from '@/assets/logos/googlecalendar.svg';
import sheets from '@/assets/logos/googlesheets.svg';
import stripe from '@/assets/logos/stripe.svg';
import typeform from '@/assets/logos/typeform.svg';

type App = { src: string; name: string };
type Scenario = {
  processId: string;
  minutes: number;
  trigger: App & { event: string };
  decide: string;
  // The other path: on some runs the agent decides differently and skips one action.
  fork: { decide: string; skip: number; why: string };
  actions: (App & { label: string })[];
};

// Each loop plays a different workflow, so visitors see that any event can kick one off.
const SCENARIOS: Scenario[] = [
  {
    processId: '6e7556bc-a999-45d9-86af-c07e934d3904',
    minutes: 25,
    fork: { decide: 'Internal meeting, no client to log', skip: 1, why: 'not a client meeting' },
    trigger: { src: granola, name: 'Granola', event: 'New meeting recorded' },
    decide: 'Client meeting with 4 action items',
    actions: [
      { src: asana, name: 'Asana', label: 'Creates a task for each action item' },
      { src: hubspot, name: 'HubSpot', label: 'Logs the meeting on the deal' },
      { src: gmail, name: 'Gmail', label: 'Drafts the follow-up email' },
      { src: slack, name: 'Slack', label: 'Posts the summary to the team' },
    ],
  },
  {
    processId: 'f6a59784-5fd6-4adc-a705-f617bed0d864',
    minutes: 15,
    fork: { decide: 'Existing customer, not a new lead', skip: 0, why: 'already a customer' },
    trigger: { src: gmail, name: 'Gmail', event: 'New email received' },
    decide: 'It is a pricing question from a lead',
    actions: [
      { src: salesforce, name: 'Salesforce', label: 'Finds the lead and their history' },
      { src: notion, name: 'Notion', label: 'Pulls the current pricing page' },
      { src: gmail, name: 'Gmail', label: 'Writes a reply for review' },
      { src: slack, name: 'Slack', label: 'Pings the account owner' },
    ],
  },
  {
    processId: 'f6a59784-5fd6-4adc-a705-f617bed0d864',
    minutes: 20,
    fork: { decide: 'Not a fit yet, nurture instead', skip: 2, why: 'not ready for a meeting' },
    trigger: { src: salesforce, name: 'Salesforce', event: 'New person added to CRM' },
    decide: 'Good fit, book them in',
    actions: [
      { src: airtable, name: 'Airtable', label: 'Enriches the record' },
      { src: gmail, name: 'Gmail', label: 'Sends a personal intro' },
      { src: calendar, name: 'Google Calendar', label: 'Offers meeting times' },
      { src: slack, name: 'Slack', label: 'Tells sales a new lead arrived' },
    ],
  },
  {
    processId: 'a75c02b3-e0e9-4f1d-bc8b-5dbe9dae5a08',
    minutes: 30,
    fork: { decide: 'Already paid by card', skip: 1, why: 'no invoice needed' },
    trigger: { src: typeform, name: 'Typeform', event: 'New order form submitted' },
    decide: 'Paid plan, needs an invoice',
    actions: [
      { src: sheets, name: 'Google Sheets', label: 'Adds the row to the order log' },
      { src: stripe, name: 'Stripe', label: 'Creates and sends the invoice' },
      { src: asana, name: 'Asana', label: 'Opens the onboarding project' },
      { src: slack, name: 'Slack', label: 'Celebrates the win in #sales' },
    ],
  },
];

const W = 400, H = 190;
const TRIGGER = { x: 38, y: 100 };
const AGENT = { x: 160, y: 100 };
const SLOTS = [{ x: 300, y: 26 }, { x: 362, y: 78 }, { x: 362, y: 134 }, { x: 300, y: 172 }];
// Steps: 0 trigger fires, 1 agent decides, 2..5 actions, 6 done.
const STEP_MS = 2400;
const LAST = 6;
const curve = (p: { x: number; y: number }, q: { x: number; y: number }) => {
  const mx = (p.x + q.x) / 2;
  return `M${p.x} ${p.y} C${mx} ${p.y} ${mx} ${q.y} ${q.x} ${q.y}`;
};

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

function Tile({ src, name, on, landing, check, skipped }: { src: string; name: string; on: boolean; landing: boolean; check: boolean; skipped?: boolean }) {
  return (
    <div className={`relative flex h-10 w-10 items-center justify-center rounded-xl bg-white transition-all duration-500 shadow-[0_6px_16px_-4px_rgba(0,0,0,0.5)] ${skipped ? 'opacity-25 scale-90 grayscale' : on ? 'opacity-100' : 'opacity-35 scale-95'}`}>
      <img key={src} src={src} alt={name} className="hb-pop h-5 w-5" />
      {landing && <span className="hb-land pointer-events-none absolute -inset-1 rounded-[14px] ring-2 ring-primary" />}
      {skipped && <span className="hb-pop absolute -right-1.5 -top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-white/80 text-[10px] font-bold text-[#0a0f1c] ring-2 ring-[#0a0f1c]">–</span>}
      {check && !skipped && <span className="hb-pop absolute -right-1.5 -top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[9px] font-bold text-white ring-2 ring-[#0a0f1c]">✓</span>}
    </div>
  );
}

function Network() {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTick((s) => s + 1), STEP_MS);
    return () => clearInterval(t);
  }, []);
  const navigate = useNavigate();
  const cycle = Math.floor(tick / (LAST + 1));
  const sc = SCENARIOS[cycle % SCENARIOS.length];
  // Every second time round, each workflow takes its other path.
  const forked = Math.floor(cycle / SCENARIOS.length) % 2 === 1;
  const skip = forked ? sc.fork.skip : -1;
  const minutes = forked ? Math.round(sc.minutes * 0.7) : sc.minutes;
  const step = tick % (LAST + 1);
  const done = step === LAST;
  const actionIdx = step - 2; // which action is running
  const target = step === 0 ? AGENT : actionIdx >= 0 && actionIdx < 4 ? SLOTS[actionIdx] : null;
  const look = (() => {
    const t = step === 0 ? TRIGGER : target;
    if (!t || t === AGENT) return { x: 0, y: 0 };
    const dx = t.x - AGENT.x, dy = t.y - AGENT.y, m = Math.hypot(dx, dy) || 1;
    return { x: dx / m, y: dy / m };
  })();
  const caption =
    step === 0 ? `Trigger: ${sc.trigger.event.toLowerCase()} in ${sc.trigger.name}`
    : step === 1 ? `Agent decides: ${forked ? sc.fork.decide : sc.decide}`
    : done ? 'Done. Nobody lifted a finger.'
    : actionIdx === skip ? `Skips ${sc.actions[actionIdx].name}: ${sc.fork.why}`
    : sc.actions[actionIdx].label;

  return (
    <button
      type="button"
      onClick={() => navigate(`/view/${sc.processId}`)}
      title="Open this process"
      className="group relative block w-[400px] shrink-0 text-left"
    >
      <div className="relative" style={{ height: H }}>
        <svg viewBox={`0 0 ${W} ${H}`} className="absolute inset-0 h-full w-full" fill="none">
          {[{ from: TRIGGER, to: AGENT, i: 0 }, ...SLOTS.map((sl, k) => ({ from: AGENT, to: sl, i: k + 2 }))].map(({ from, to, i }) => {
            const d = curve(from, to);
            const skipped = i - 2 === skip;
            const active = step === i && !skipped;
            const past = (done || step > i) && !skipped;
            return (
              <g key={i}>
                <path d={d} stroke="white" strokeOpacity={active ? 0.9 : past ? 0.35 : 0.1} strokeWidth={active ? 2 : 1.5} strokeDasharray={past || active ? undefined : '3 5'} className="transition-all duration-500" />
                {active && (
                  <circle key={`p${tick}`} r="3.5" fill="#fff" style={{ filter: 'drop-shadow(0 0 6px hsl(var(--primary)))' }}>
                    <animateMotion dur="1.4s" fill="freeze" path={d} keyPoints="0;1" keyTimes="0;1" calcMode="spline" keySplines="0.5 0 0.3 1" />
                  </circle>
                )}
              </g>
            );
          })}
        </svg>

        {/* Trigger: the event that starts it all, spelled out */}
        <div className="absolute -translate-x-1/2 -translate-y-1/2" style={{ left: TRIGGER.x, top: TRIGGER.y }}>
          <Tile src={sc.trigger.src} name={sc.trigger.name} on landing={step === 0} check={false} />
          <span className="absolute bottom-full left-0 mb-2 whitespace-nowrap text-[9px] font-semibold uppercase tracking-wider text-white/45">When</span>
          <span key={sc.trigger.event} className={`hb-pop absolute left-0 top-full mt-2 w-[104px] rounded-md border px-1.5 py-1 text-[10px] font-medium leading-tight transition-colors ${step === 0 ? 'border-primary bg-primary/25 text-white' : 'border-white/10 bg-white/5 text-white/70'}`}>
            ⚡ {sc.trigger.event}
          </span>
        </div>

        {/* Agent */}
        <div className="absolute -translate-x-1/2 -translate-y-1/2" style={{ left: AGENT.x, top: AGENT.y }}>
          <div className={`relative flex h-14 w-14 items-center justify-center rounded-2xl bg-white transition-shadow duration-500 ${step >= 1 && !done ? 'shadow-[0_0_0_3px_hsl(var(--primary)),0_0_28px_hsl(var(--primary)/0.7)]' : 'shadow-[0_6px_16px_-4px_rgba(0,0,0,0.5)]'}`}>
            <Agent shape={Math.floor(tick / (LAST + 1))} look={look} working={step >= 1 && !done} />
            {step === 1 && (
              <span className="hb-pop absolute -top-4 left-1/2 flex -translate-x-1/2 gap-0.5 rounded-full bg-white px-1.5 py-1 shadow">
                {[0, 1, 2].map((k) => <span key={k} className="hb-dot h-1 w-1 rounded-full bg-[#111]" style={{ animationDelay: `${k * 0.15}s` }} />)}
              </span>
            )}
          </div>
          <span className="absolute left-1/2 top-full mt-1.5 -translate-x-1/2 whitespace-nowrap text-[10px] font-semibold uppercase tracking-wider text-white/60">Agent</span>
        </div>

        {/* Actions */}
        {SLOTS.map((sl, k) => (
          <div key={k} className="absolute -translate-x-1/2 -translate-y-1/2" style={{ left: sl.x, top: sl.y }}>
            <Tile src={sc.actions[k].src} name={sc.actions[k].name} on={done || actionIdx >= k} landing={actionIdx === k && k !== skip} check={done || actionIdx > k} skipped={k === skip && (done || actionIdx >= k)} />
          </div>
        ))}
      </div>
      <div className="mt-2 flex h-7 items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-2.5 text-xs">
        <span className="font-mono text-[10px] text-white/45">{step === 0 ? 'TRIGGER' : step === 1 ? 'THINKING' : done ? 'DONE' : `STEP ${actionIdx + 1}/4`}</span>
        <span key={tick} className="hb-cap min-w-0 flex-1 truncate text-white/90">{caption}</span>
        {done ? (
          <TimeSaved key={cycle} minutes={minutes} />
        ) : (
          <span className="shrink-0 text-[10px] font-medium text-white/40 transition-colors group-hover:text-white">Open →</span>
        )}
      </div>
    </button>
  );
}

/** Counts up to the minutes this run saved, once it finishes. */
function TimeSaved({ minutes }: { minutes: number }) {
  const [n, setN] = useState(0);
  useEffect(() => {
    const start = performance.now();
    let raf = 0;
    const tickFn = (t: number) => {
      const k = Math.min(1, (t - start) / 900);
      setN(Math.round(minutes * (1 - Math.pow(1 - k, 3))));
      if (k < 1) raf = requestAnimationFrame(tickFn);
    };
    raf = requestAnimationFrame(tickFn);
    return () => cancelAnimationFrame(raf);
  }, [minutes]);
  return <span className="hb-pop shrink-0 rounded bg-primary px-1.5 py-0.5 font-mono text-[10px] font-semibold text-white">+{n} min saved</span>;
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
        @keyframes hbPop{from{transform:scale(.6);opacity:0}to{transform:none;opacity:1}}
        .hb-pop{animation:hbPop .4s cubic-bezier(.3,1.6,.5,1)}
        @keyframes hbDot{0%,100%{transform:translateY(0);opacity:.4}50%{transform:translateY(-2px);opacity:1}}
        .hb-dot{animation:hbDot .9s ease-in-out infinite}
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
          <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">
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
