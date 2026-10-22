import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  X, ArrowLeft, ArrowRight, Pencil, Repeat2, CornerDownRight, CornerDownLeft, Flag, Zap, Circle,
} from 'lucide-react';
import { Button } from '@project/components/ui/button';
import type { ElementRef, ProcessConnection, ProcessStep } from '@/types';
import { appsOf, buildOutline, type OutlineItem } from '@/lib/walkthrough';
import ElementIcon from './ElementIcon';

interface Props {
  processName: string;
  processDescription: string;
  versionName: string;
  steps: ProcessStep[];
  connections: ProcessConnection[];
  onClose: () => void;
  onEditStep: (step: ProcessStep) => void;
  /** The step editor, docked beside the walkthrough while a step is edited. */
  editor: React.ReactNode;
}

const isApp = (e: ElementRef | null | undefined): boolean => e?.actorClass === 'System';
const stepTitle = (s: ProcessStep) => s.walkthroughLine.trim() || s.title;

/**
 * A process explained one step at a time, for someone seeing it for the first
 * time: every step listed on the left so you always know where you are, one
 * step in full on the right. It only moves when you do. At a decision the
 * reader picks which way to follow.
 */
export default function Walkthrough({
  processName, processDescription, versionName, steps, connections, onClose, onEditStep, editor,
}: Props) {
  const outline = useMemo(() => buildOutline(steps, connections), [steps, connections]);
  /** The step on screen; null is the overview. */
  const [cur, setCur] = useState<string | null>(null);
  /** Where you came from, so Back retraces a path you chose. */
  const [history, setHistory] = useState<(string | null)[]>([]);

  const item = cur ? outline.byId.get(cur) ?? null : null;

  // A step deleted from the editor drops you back on the overview.
  useEffect(() => {
    if (cur && !outline.byId.has(cur)) setCur(null);
  }, [cur, outline]);

  const go = useCallback(
    (id: string | null) => {
      setHistory((h) => [...h, cur]);
      setCur(id);
    },
    [cur],
  );

  const back = useCallback(() => {
    if (history.length) {
      setCur(history[history.length - 1]);
      setHistory((h) => h.slice(0, -1));
      return;
    }
    if (!item) return;
    const prev = outline.items[item.number - 2];
    setCur(prev ? prev.step.id : null);
  }, [history, item, outline]);

  const next = useCallback(() => {
    if (!item) {
      if (outline.items[0]) go(outline.items[0].step.id);
      return;
    }
    if (item.nextId) go(item.nextId);
  }, [item, outline, go]);

  const editing = !!editor;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (editing) return;
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowRight') next();
      else if (e.key === 'ArrowLeft') back();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [editing, next, back, onClose]);

  return (
    <div className="fixed inset-0 z-[100] flex flex-col bg-background" role="dialog" aria-label={`${processName} walkthrough`}>
      <header className="flex items-center justify-between gap-4 border-b border-border px-6 py-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{processName}</p>
          <p className="truncate text-xs text-muted-foreground">Walkthrough · {versionName}</p>
        </div>
        <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close walkthrough" title="Close (Esc)">
          <X className="h-5 w-5" />
        </Button>
      </header>

      <div className="flex min-h-0 flex-1">
        <StepList outline={outline} cur={cur} onPick={go} />

        <main className="min-w-0 flex-1 overflow-y-auto">
          <div className="mx-auto max-w-2xl px-8 py-10">
            {item ? (
              <StepDetail item={item} outline={outline} onGo={go} onEdit={() => onEditStep(item.step)} />
            ) : (
              <Overview
                processName={processName}
                description={processDescription}
                versionName={versionName}
                steps={steps}
              />
            )}

            <div className="mt-12 flex items-center justify-between border-t border-border pt-6">
              <Button variant="ghost" onClick={back} disabled={!item}>
                <ArrowLeft className="mr-2 h-4 w-4" /> Back
              </Button>
              <NextButton item={item} outline={outline} hasSteps={outline.items.length > 0} onNext={next} />
            </div>
          </div>
        </main>

        {editor}
      </div>
    </div>
  );
}

// --- Step list ---

function StepList({ outline, cur, onPick }: {
  outline: ReturnType<typeof buildOutline>;
  cur: string | null;
  onPick: (id: string | null) => void;
}) {
  const active = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    active.current?.scrollIntoView({ block: 'nearest' });
  }, [cur]);

  return (
    <nav className="hidden w-72 shrink-0 overflow-y-auto border-r border-border bg-muted/30 px-3 py-4 md:block" aria-label="Steps">
      <ListRow on={cur === null} onClick={() => onPick(null)} buttonRef={cur === null ? active : undefined}>
        <span className="w-6" />
        <span className="font-medium">Overview</span>
      </ListRow>
      <p className="mb-1 mt-4 px-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Steps</p>
      {outline.items.map((it, i) => {
        const prev = outline.items[i - 1];
        const startsBranch = it.branch && it.branch.label !== prev?.branch?.label;
        const on = it.step.id === cur;
        return (
          <div key={it.step.id}>
            {startsBranch && (
              <p className="flex items-center gap-1.5 pb-1 pl-9 pr-3 pt-2 text-[11px] italic text-muted-foreground">
                <CornerDownRight className="h-3 w-3 shrink-0" />
                <span className="truncate">{it.branch!.label}</span>
              </p>
            )}
            <ListRow on={on} onClick={() => onPick(it.step.id)} indent={!!it.branch} buttonRef={on ? active : undefined}>
              <span className={`w-6 shrink-0 text-right text-xs tabular-nums ${on ? '' : 'text-muted-foreground'}`}>
                {it.number}
              </span>
              <span className="min-w-0 flex-1 truncate">{stepTitle(it.step)}</span>
              {isApp(it.step.performedBy) && <Zap className="h-3 w-3 shrink-0 text-emerald-600" aria-label="Automated" />}
            </ListRow>
          </div>
        );
      })}
    </nav>
  );
}

function ListRow({ on, indent, onClick, buttonRef, children }: {
  on: boolean;
  indent?: boolean;
  onClick: () => void;
  buttonRef?: React.Ref<HTMLButtonElement>;
  children: React.ReactNode;
}) {
  return (
    <button
      ref={buttonRef}
      type="button"
      onClick={onClick}
      aria-current={on ? 'step' : undefined}
      className={`flex w-full items-center gap-2.5 rounded-md py-1.5 pr-3 text-left text-sm transition-colors ${
        indent ? 'pl-6' : 'pl-3'
      } ${on ? 'bg-primary/10 font-medium text-primary' : 'text-foreground/80 hover:bg-muted'}`}
    >
      {children}
    </button>
  );
}

// --- Pieces ---

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join('');
}

/** A person as a coloured circle with initials; an app as its logo. */
function Avatar({ who, size = 40 }: { who: ElementRef | null; size?: number }) {
  if (who && who.actorClass === 'System') {
    return (
      <span className="inline-flex shrink-0 items-center justify-center rounded-full border border-border bg-card" style={{ width: size, height: size }}>
        <ElementIcon name={who.name} image={who.image} icon={who.icon} typeIcon={who.typeIcon} color={who.color} size={Math.round(size * 0.5)} />
      </span>
    );
  }
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-white"
      style={{ width: size, height: size, fontSize: size * 0.36, backgroundColor: who?.color || 'hsl(var(--muted-foreground))' }}
    >
      {who ? initials(who.name) : '?'}
    </span>
  );
}

function Chip({ el }: { el: ElementRef }) {
  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-sm">
      <ElementIcon name={el.name} image={el.image} icon={el.icon} typeIcon={el.typeIcon} color={el.color} size={14} />
      {el.name}
    </span>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return <h3 className="mb-2.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">{children}</h3>;
}

// --- Views ---

function Overview({ processName, description, versionName, steps }: {
  processName: string;
  description: string;
  versionName: string;
  steps: ProcessStep[];
}) {
  const { people, apps, automated } = useMemo(() => {
    const people = new Map<string, ElementRef>();
    const apps = new Map<string, ElementRef>();
    let automated = 0;
    for (const s of steps) {
      if (s.performedBy && !isApp(s.performedBy)) people.set(s.performedBy.id, s.performedBy);
      if (isApp(s.performedBy)) automated += 1;
      for (const a of appsOf(s)) apps.set(a.id, a);
    }
    return { people: [...people.values()], apps: [...apps.values()], automated };
  }, [steps]);

  return (
    <div>
      <p className="text-sm font-medium text-primary">Overview · {versionName}</p>
      <h1 className="mt-2 text-4xl font-semibold tracking-tight">{processName}</h1>
      {description && <p className="mt-4 text-lg leading-relaxed text-muted-foreground">{description}</p>}

      <div className="mt-8 grid grid-cols-3 gap-3">
        <Stat value={steps.length} label={steps.length === 1 ? 'step' : 'steps'} />
        <Stat value={people.length} label={people.length === 1 ? 'person' : 'people'} />
        <Stat value={automated} label={automated === 1 ? 'automated step' : 'automated steps'} />
      </div>

      {people.length > 0 && (
        <section className="mt-10">
          <Label>Who's involved</Label>
          <div className="grid gap-3 sm:grid-cols-2">
            {people.map((p) => (
              <div key={p.id} className="flex items-center gap-3">
                <Avatar who={p} size={36} />
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">{p.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {p.typeName}
                    {p.party === 'External' ? ' · external' : ''}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {apps.length > 0 && (
        <section className="mt-10">
          <Label>Apps</Label>
          <div className="flex flex-wrap gap-2">
            {apps.map((a) => (
              <Chip key={a.id} el={a} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <div className="rounded-xl bg-muted/60 px-4 py-3">
      <p className="text-2xl font-semibold tabular-nums">{value}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  );
}

function StepDetail({ item, outline, onGo, onEdit }: {
  item: OutlineItem;
  outline: ReturnType<typeof buildOutline>;
  onGo: (id: string) => void;
  onEdit: () => void;
}) {
  const { step } = item;
  const who = step.performedBy;
  const automated = isApp(who);
  const uses = step.uses.filter((u) => u.id !== who?.id);
  const ref = (id: string) => outline.byId.get(id);

  return (
    <article>
      <div className="flex items-center justify-between gap-3">
        <p className="flex min-w-0 items-center gap-2 text-sm text-muted-foreground">
          <span className="tabular-nums">Step {item.number} of {outline.items.length}</span>
          {item.branch && (
            <span className="truncate rounded-full bg-muted px-2 py-0.5 text-xs">{item.branch.label}</span>
          )}
        </p>
        <Button variant="outline" size="sm" onClick={onEdit}>
          <Pencil className="mr-1.5 h-3.5 w-3.5" /> Edit step
        </Button>
      </div>

      <div className="mt-6 flex items-center gap-3">
        <Avatar who={who} />
        <div>
          <p className="font-semibold leading-tight">{who?.name || 'Unassigned'}</p>
          <p className="text-sm text-muted-foreground">
            {automated ? 'Runs automatically' : who?.typeName}
            {who?.party === 'External' ? ' · external' : ''}
            {step.stepType && step.stepType !== 'Task' ? ` · ${step.stepType}` : ''}
          </p>
        </div>
      </div>

      <h2 className="mt-5 text-3xl font-semibold leading-tight tracking-tight">{stepTitle(step)}</h2>
      {step.description && <p className="mt-3 text-base leading-relaxed text-muted-foreground">{step.description}</p>}

      {uses.length > 0 && (
        <section className="mt-8">
          <Label>Using</Label>
          <div className="flex flex-wrap gap-2">
            {uses.map((u) => (
              <Chip key={u.id} el={u} />
            ))}
          </div>
        </section>
      )}

      {(item.needs.length > 0 || step.produces.length > 0) && (
        <div className="mt-8 grid gap-6 sm:grid-cols-2">
          {item.needs.length > 0 && (
            <section>
              <Label>
                <span className="inline-flex items-center gap-1.5"><CornerDownLeft className="h-3.5 w-3.5" /> Needs</span>
              </Label>
              <div className="flex flex-wrap gap-2">
                {item.needs.map((n) => (
                  <Chip key={n.id} el={n} />
                ))}
              </div>
            </section>
          )}
          {step.produces.length > 0 && (
            <section>
              <Label>
                <span className="inline-flex items-center gap-1.5"><CornerDownRight className="h-3.5 w-3.5" /> Produces</span>
              </Label>
              <div className="flex flex-wrap gap-2">
                {step.produces.map((p) => (
                  <Chip key={p.id} el={p} />
                ))}
              </div>
            </section>
          )}
        </div>
      )}

      {step.checklist.length > 0 && (
        <section className="mt-8">
          <Label>Checklist</Label>
          <ul className="space-y-2">
            {step.checklist.map((c) => (
              <li key={c.id} className="flex items-start gap-3 text-base">
                <Circle className="mt-1 h-4 w-4 shrink-0 text-muted-foreground/60" />
                <span>{c.text}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {item.outcomes.length > 0 && (
        <section className="mt-10">
          <Label>What happens next?</Label>
          <div className="grid gap-3 sm:grid-cols-2">
            {item.outcomes.map((o) => {
              const target = ref(o.targetId);
              return (
                <button
                  key={o.key}
                  type="button"
                  onClick={() => onGo(o.targetId)}
                  className="rounded-xl border border-border bg-card p-4 text-left transition-colors hover:border-primary hover:bg-primary/5"
                >
                  <p className="font-semibold">{o.label || 'Otherwise'}</p>
                  <p className="mt-1 flex items-start gap-1.5 text-sm text-muted-foreground">
                    <ArrowRight className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    <span>
                      {target ? `Step ${target.number} · ${stepTitle(target.step)}` : 'An earlier step'}
                    </span>
                  </p>
                  {o.loopsBack && (
                    <p className="mt-2 inline-flex items-center gap-1 text-xs text-primary">
                      <Repeat2 className="h-3.5 w-3.5" /> Goes back round
                    </p>
                  )}
                </button>
              );
            })}
          </div>
        </section>
      )}

      {item.loopBackId && ref(item.loopBackId) && (
        <p className="mt-8 inline-flex items-center gap-2 rounded-full bg-primary/5 px-3 py-1.5 text-sm text-primary">
          <Repeat2 className="h-4 w-4" />
          Then back to step {ref(item.loopBackId)!.number}, {stepTitle(ref(item.loopBackId)!.step)}
        </p>
      )}
    </article>
  );
}

function NextButton({ item, outline, hasSteps, onNext }: {
  item: OutlineItem | null;
  outline: ReturnType<typeof buildOutline>;
  hasSteps: boolean;
  onNext: () => void;
}) {
  if (!item) {
    return hasSteps ? (
      <Button onClick={onNext}>
        Start <ArrowRight className="ml-2 h-4 w-4" />
      </Button>
    ) : (
      <span className="text-sm text-muted-foreground">No steps in this version yet.</span>
    );
  }
  if (!item.nextId) {
    return (
      <span className="inline-flex items-center gap-2 text-sm text-muted-foreground">
        <Flag className="h-4 w-4" />
        {item.branch ? 'This path ends here' : 'End of the process'}
      </span>
    );
  }
  const main = item.outcomes.find((o) => o.main);
  const target = outline.byId.get(item.nextId);
  const loopingBack = item.loopBackId === item.nextId;
  return (
    <Button onClick={onNext}>
      {main ? `Continue: ${main.label || 'main path'}` : loopingBack ? `Back to step ${target?.number}` : 'Next'}
      <ArrowRight className="ml-2 h-4 w-4" />
    </Button>
  );
}
