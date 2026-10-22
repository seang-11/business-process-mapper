import { useState } from 'react';
import { ArrowRight, Compass, GraduationCap, Hand, Layers, UsersRound, Network } from 'lucide-react';
import { Button } from '@project/components/ui/button';

interface Props {
  firstName: string;
  onDone: () => void;
}

const STEPS = 3;

/** Three quick screens for someone's first visit. Skippable, and shown once. */
export default function Welcome({ firstName, onDone }: Props) {
  const [step, setStep] = useState(0);
  const last = step === STEPS - 1;

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/30 p-4 backdrop-blur-[2px]"
      role="dialog"
      aria-label="Welcome"
    >
      <div className="w-full max-w-lg overflow-hidden rounded-2xl border border-border bg-background shadow-2xl">
        <div className="px-8 pb-6 pt-9 text-center">
          {step === 0 && (
            <>
              <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                <Hand className="h-7 w-7" />
              </span>
              <h2 className="mt-5 text-2xl font-semibold tracking-tight">Welcome, {firstName}</h2>
              <p className="mx-auto mt-3 max-w-sm text-sm leading-relaxed text-muted-foreground">
                This is where you can see how work gets done here: who does what, in which tool, and in what order.
                It takes about a minute to see how it works.
              </p>
            </>
          )}

          {step === 1 && (
            <>
              <h2 className="text-2xl font-semibold tracking-tight">Pick a process, then your role</h2>
              <p className="mx-auto mt-3 max-w-sm text-sm leading-relaxed text-muted-foreground">
                Every process is on the home page. Open one and press Start training, or switch to Cards for a Start training
                button on each. You'll see the whole picture first, then pick your role to see exactly what you do.
              </p>
              <div className="mx-auto mt-6 max-w-xs rounded-xl border border-border bg-card p-4 text-left shadow-sm">
                <div className="flex items-center justify-between">
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700">
                    <Network className="h-5 w-5" />
                  </span>
                  <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-700">Live</span>
                </div>
                <p className="mt-3 text-sm font-semibold">Employee Onboarding</p>
                <p className="text-xs text-muted-foreground">17 steps · 2 roles</p>
                <div className="mt-3 rounded-md border border-border py-1.5 text-center text-xs font-medium">
                  <GraduationCap className="mr-1.5 inline h-3.5 w-3.5 align-[-2px]" />
                  Start training
                </div>
              </div>
            </>
          )}

          {step === 2 && (
            <>
              <h2 className="text-2xl font-semibold tracking-tight">Look at it your way</h2>
              <p className="mx-auto mt-3 max-w-sm text-sm leading-relaxed text-muted-foreground">
                Open any process and switch how you see it. You can't break anything, so click around.
              </p>
              <ul className="mx-auto mt-6 max-w-sm space-y-3 text-left text-sm">
                <li className="flex items-start gap-3">
                  <UsersRound className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                  <span>
                    <b className="font-semibold">By person</b>
                    <span className="block text-xs text-muted-foreground">Who does what, in order.</span>
                  </span>
                </li>
                <li className="flex items-start gap-3">
                  <Layers className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                  <span>
                    <b className="font-semibold">By app</b>
                    <span className="block text-xs text-muted-foreground">Which tools are used where.</span>
                  </span>
                </li>
                <li className="flex items-start gap-3">
                  <Compass className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                  <span>
                    <b className="font-semibold">Overview</b>
                    <span className="block text-xs text-muted-foreground">The whole thing as a simple list.</span>
                  </span>
                </li>
                <li className="flex items-start gap-3">
                  <GraduationCap className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                  <span>
                    <b className="font-semibold">Train</b>
                    <span className="block text-xs text-muted-foreground">A lesson for your role, and a handover page.</span>
                  </span>
                </li>
              </ul>
            </>
          )}

          <div className="mt-7 flex justify-center gap-1.5" aria-hidden="true">
            {Array.from({ length: STEPS }, (_, i) => (
              <span
                key={i}
                className={`h-1.5 rounded-full transition-all ${i === step ? 'w-6 bg-primary' : 'w-1.5 bg-border'}`}
              />
            ))}
          </div>
        </div>

        <div className="flex items-center justify-between border-t border-border bg-muted/30 px-6 py-3">
          <button type="button" onClick={onDone} className="text-sm text-muted-foreground hover:text-foreground">
            Skip for now
          </button>
          <Button onClick={() => (last ? onDone() : setStep((s) => s + 1))}>
            {last ? 'Get started' : 'Next'} <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
