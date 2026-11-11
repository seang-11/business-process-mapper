import { ArrowRight, CheckCircle2, Clock, Workflow, X } from 'lucide-react';
import type { GetBrainOutputType } from 'zitejs/api';

type Step = GetBrainOutputType['processes'][number]['steps'][number];
type Link = { from: string; to: string; label: string };

/** Read-only details for one step, opened by clicking it on any view. */
export default function StepPanel({
  step, steps, links, names, onPick, onJump, onClose,
}: {
  step: Step;
  steps: Step[];
  links: Link[];
  names: Map<string, string>;
  onPick: (stepId: string) => void;
  onJump: (processId: string) => void;
  onClose: () => void;
}) {
  const index = steps.findIndex((s) => s.id === step.id);
  const byId = new Map(steps.map((s) => [s.id, s]));
  const next = links.filter((l) => l.from === step.id && byId.has(l.to));
  const prev = links.filter((l) => l.to === step.id && byId.has(l.from));

  return (
    <aside className="flex h-full w-full flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-[0_8px_24px_rgba(16,24,40,0.10)] md:w-80">
      <div className="flex items-start justify-between gap-2 border-b border-border px-5 py-4">
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">Step {index + 1} of {steps.length} · {step.stepType}</p>
          <h3 className="mt-0.5 text-base font-semibold leading-snug">{step.title || 'Untitled step'}</h3>
        </div>
        <button type="button" onClick={onClose} aria-label="Close" className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground">
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4 text-sm">
        <Field label="Who does it">{step.who ? `${step.who.name}${step.automated ? ' (automated)' : ''}` : 'Not assigned'}</Field>
        {step.uses.length > 0 && (
          <Field label="Tools used">
            <div className="flex flex-wrap gap-1.5">
              {step.uses.map((u) => (
                <span key={u.id} className="rounded-md bg-muted px-2 py-0.5 text-xs font-medium">{u.name}</span>
              ))}
            </div>
          </Field>
        )}
        {step.minutes && (
          <Field label="Time">
            <span className="inline-flex items-center gap-1.5"><Clock className="h-3.5 w-3.5 text-muted-foreground" />{step.minutes} min each run</span>
          </Field>
        )}
        {step.description && <Field label="Notes"><p className="whitespace-pre-wrap leading-relaxed">{step.description}</p></Field>}
        {step.checklist.length > 0 && (
          <Field label="Checklist">
            <ul className="space-y-1.5">
              {step.checklist.map((c, i) => (
                <li key={i} className="flex gap-2"><CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />{c.text}</li>
              ))}
            </ul>
          </Field>
        )}
        {step.produces.length > 0 && <Field label="Produces">{step.produces.join(', ')}</Field>}
        {step.subProcessId && (
          <button type="button" onClick={() => onJump(step.subProcessId!)} className="flex w-full items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-left font-medium text-primary hover:bg-primary/10">
            <Workflow className="h-4 w-4" /> Open “{names.get(step.subProcessId) ?? 'sub-process'}”
          </button>
        )}
        <StepLinks label="Comes after" items={prev.map((l) => ({ id: l.from, text: byId.get(l.from)!.title, note: l.label }))} onPick={onPick} />
        <StepLinks label="Next" items={next.map((l) => ({ id: l.to, text: byId.get(l.to)!.title, note: l.label }))} onPick={onPick} />
      </div>
    </aside>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-1 text-xs font-medium text-muted-foreground">{label}</p>
      <div>{children}</div>
    </div>
  );
}

function StepLinks({ label, items, onPick }: { label: string; items: { id: string; text: string; note: string }[]; onPick: (id: string) => void }) {
  if (!items.length) return null;
  return (
    <Field label={label}>
      <div className="space-y-1">
        {items.map((it) => (
          <button key={it.id + it.note} type="button" onClick={() => onPick(it.id)} className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 -mx-2 text-left text-primary hover:bg-muted">
            <ArrowRight className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">{it.text || 'Untitled step'}</span>
            {it.note && <span className="ml-auto shrink-0 text-xs text-muted-foreground">{it.note}</span>}
          </button>
        ))}
      </div>
    </Field>
  );
}
