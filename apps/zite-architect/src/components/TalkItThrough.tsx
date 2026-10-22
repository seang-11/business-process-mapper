import { useState } from 'react';
import { Check, ChevronDown, Copy, Mic, Sparkles } from 'lucide-react';
import { Button } from '@project/components/ui/button';
import { toast } from 'sonner';

const OPEN_KEY = 'bpm_talk_open';

const PROMPT = `You are helping me add a business process to my Business Process Mapper app in Zite.

First, look at the app's tables in my Zite workspace (Processes, Steps, Elements, and so on) so you know how a process is stored. Do not change anything yet.

Then interview me about one process. Rules:
- Ask ONE question at a time. Keep each question short.
- Start with: What is the process called, and what starts it?
- Then walk me through it in order. For each step ask: who does it (a person or an app), which tools they use, and what they hand off to the next step.
- Ask what happens when something goes wrong, and whether any step repeats.
- If I ramble, that is fine. Pull out the steps yourself.
- When I say "that's it", read the whole process back to me as a numbered list and ask what to fix.

After I approve the list, build it in my Zite workspace: create the process, add every step in order, link the people and apps, and connect the steps. Reuse people and apps that already exist instead of making duplicates.

Finish by telling me what you created, and where to open it in the Business Process Mapper.`;

/**
 * A slim strip at the top of the home page that points editors to the easiest
 * way to add a process: talk it through with Claude or ChatGPT.
 */
export default function TalkItThrough() {
  const [open, setOpen] = useState(() => {
    try {
      return localStorage.getItem(OPEN_KEY) === '1';
    } catch {
      return false;
    }
  });
  const [copied, setCopied] = useState(false);

  const toggle = () => {
    const next = !open;
    setOpen(next);
    try {
      localStorage.setItem(OPEN_KEY, next ? '1' : '0');
    } catch {
      /* it just resets next visit */
    }
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(PROMPT);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Couldn't copy. Select the text and copy it by hand.");
    }
  };

  return (
    <section className="mb-6 rounded-xl border border-border bg-card">
      <button
        type="button"
        onClick={toggle}
        className="flex w-full items-center gap-3 px-4 py-3 text-left"
        aria-expanded={open}
      >
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Sparkles className="h-4 w-4" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-medium">Add a process by talking to Claude</span>
          <span className="block truncate text-xs text-muted-foreground">
            Describe it out loud. It asks the questions and builds the map for you.
          </span>
        </span>
        <ChevronDown className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="grid gap-5 border-t border-border px-4 py-4 md:grid-cols-2">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">New to this</p>
            <ol className="mt-2 space-y-2 text-sm">
              <li>
                <b>1.</b> Open Claude or ChatGPT and connect <b>Zite</b> in its connectors or apps settings.
              </li>
              <li>
                <b>2.</b> Start a new chat and paste the prompt (copy it on the right).
              </li>
              <li>
                <b>3.</b> Answer its questions. It builds the process here when you are done.
              </li>
            </ol>
          </div>

          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Already connected</p>
            <p className="mt-2 text-sm text-muted-foreground">Paste this into a new chat and start talking.</p>
            <pre className="mt-2 max-h-28 overflow-auto whitespace-pre-wrap rounded-lg bg-muted p-3 text-xs leading-relaxed text-muted-foreground">
              {PROMPT}
            </pre>
            <Button size="sm" className="mt-2 h-8" onClick={copy}>
              {copied ? <Check className="mr-1.5 h-3.5 w-3.5" /> : <Copy className="mr-1.5 h-3.5 w-3.5" />}
              {copied ? 'Copied' : 'Copy prompt'}
            </Button>
          </div>

          <p className="flex items-start gap-2 rounded-lg bg-muted/60 px-3 py-2 text-xs text-muted-foreground md:col-span-2">
            <Mic className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            Tip: use a voice tool like Wispr Flow so you can talk instead of type. Explaining a process out loud is
            faster, and you remember more steps.
          </p>
        </div>
      )}
    </section>
  );
}
