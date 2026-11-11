import { useState } from 'react';
import { ArrowRight, GitCompare, Layers, MousePointerClick, Network, UsersRound } from 'lucide-react';
import { Button } from '@project/components/ui/button';

interface Props {
  onDone: () => void;
}

const STEPS = 3;

/** Three quick screens for a visitor's first time here. Skippable, and shown once. */
export default function Welcome({ onDone }: Props) {
  const [step, setStep] = useState(0);
  const last = step === STEPS - 1;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/30 p-4 backdrop-blur-[2px]" role="dialog" aria-label="How it works">
      <div className="w-full max-w-lg overflow-hidden rounded-2xl border border-border bg-background shadow-2xl">
        <div className="px-6 pb-6 pt-9 text-center sm:px-8">
          {step === 0 && (
            <>
              <Badge><Network className="h-7 w-7" /></Badge>
              <h2 className="mt-5 text-2xl font-semibold tracking-tight">Every process, mapped and clickable</h2>
              <p className="mx-auto mt-3 max-w-sm text-sm leading-relaxed text-muted-foreground">
                This replaces messy whiteboards. Each process shows who does every step, in which tool and in what order,
                both how it runs today and how it will run next.
              </p>
            </>
          )}
          {step === 1 && (
            <>
              <Badge><MousePointerClick className="h-7 w-7" /></Badge>
              <h2 className="mt-5 text-2xl font-semibold tracking-tight">Open a process, then click a step</h2>
              <p className="mx-auto mt-3 max-w-sm text-sm leading-relaxed text-muted-foreground">
                Pick any process from the list. Click a step on the map to see who does it, the tools they use, how long it
                takes and what comes next. You can't break anything, so click around.
              </p>
              <ul className="mx-auto mt-5 max-w-xs space-y-2.5 text-left text-sm">
                <Item icon={<UsersRound className="h-5 w-5" />} title="By person" text="Who does what, in order." />
                <Item icon={<Layers className="h-5 w-5" />} title="By app" text="Which tools are used where." />
              </ul>
            </>
          )}
          {step === 2 && (
            <>
              <Badge><GitCompare className="h-7 w-7" /></Badge>
              <h2 className="mt-5 text-2xl font-semibold tracking-tight">Today vs. tomorrow</h2>
              <p className="mx-auto mt-3 max-w-sm text-sm leading-relaxed text-muted-foreground">
                Processes marked <b className="font-semibold text-foreground">Current</b> show how work runs now.
                <b className="font-semibold text-foreground"> Future</b> shows the improved, more automated version. Use the
                Current / Future switch on a process to compare them.
              </p>
            </>
          )}

          <div className="mt-7 flex justify-center gap-1.5" aria-hidden="true">
            {Array.from({ length: STEPS }, (_, i) => (
              <span key={i} className={`h-1.5 rounded-full transition-all ${i === step ? 'w-6 bg-primary' : 'w-1.5 bg-border'}`} />
            ))}
          </div>
        </div>

        <div className="flex items-center justify-between border-t border-border bg-muted/30 px-6 py-3">
          <button type="button" onClick={onDone} className="text-sm text-muted-foreground hover:text-foreground">
            Skip
          </button>
          <Button onClick={() => (last ? onDone() : setStep((s) => s + 1))}>
            {last ? 'Start exploring' : 'Next'} <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}

function Badge({ children }: { children: React.ReactNode }) {
  return <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">{children}</span>;
}

function Item({ icon, title, text }: { icon: React.ReactNode; title: string; text: string }) {
  return (
    <li className="flex items-start gap-3">
      <span className="mt-0.5 shrink-0 text-primary">{icon}</span>
      <span>
        <b className="font-semibold">{title}</b>
        <span className="block text-xs text-muted-foreground">{text}</span>
      </span>
    </li>
  );
}
