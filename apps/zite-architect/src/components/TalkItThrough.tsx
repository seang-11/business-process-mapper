import { useState } from 'react';
import { Check, ChevronDown, Copy, Mic, Plug, Sparkles, Wand2 } from 'lucide-react';
import { Button } from '@project/components/ui/button';
import { toast } from 'sonner';
import claudeLogo from '../assets/logos/claude.svg';
import chatgptLogo from '../assets/logos/chatgpt.svg';
import wisprLogo from '../assets/logos/wisprflow.svg';

const OPEN_KEY = 'bpm_talk_open_v2';

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

type Mode = 'new' | 'ready';

/**
 * A card at the top of the home page that shows editors the easiest way to
 * add a process: talk it through with any AI agent that can reach Zite.
 */
export default function TalkItThrough() {
  const [open, setOpen] = useState(() => {
    try {
      return localStorage.getItem(OPEN_KEY) !== '0';
    } catch {
      return true;
    }
  });
  const [mode, setMode] = useState<Mode>('ready');
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
    <section className="mb-6 overflow-hidden rounded-2xl border border-primary/20 bg-gradient-to-br from-primary/[0.08] via-card to-card shadow-sm">
      <button
        type="button"
        onClick={toggle}
        className="flex w-full items-center gap-3 px-5 py-4 text-left"
        aria-expanded={open}
      >
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-[0_2px_8px_hsl(var(--primary)/0.35)]">
          <Wand2 className="h-5 w-5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-base font-semibold tracking-tight">Just talk. Your AI builds the map.</span>
          <span className="block text-xs text-muted-foreground">
            Describe a process out loud to Claude, ChatGPT, or any AI agent. It interviews you, then adds it here.
          </span>
        </span>
        <ChevronDown className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="grid gap-6 px-5 pb-5 md:grid-cols-[1.1fr_1fr]">
          {/* Left: pick your path, then do it */}
          <div>
            <div className="inline-flex rounded-lg bg-muted p-0.5 text-xs">
              {(
                [
                  ['ready', 'I have an AI connected'],
                  ['new', 'First time'],
                ] as const
              ).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setMode(key)}
                  className={`rounded-md px-3 py-1 font-medium transition-all ${
                    mode === key ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            {mode === 'ready' ? (
              <div className="mt-4">
                <p className="text-sm text-muted-foreground">
                  Copy this, paste it into a new chat, and start talking.
                </p>
                <Button className="mt-3 h-10 px-5" onClick={copy}>
                  {copied ? <Check className="mr-2 h-4 w-4" /> : <Copy className="mr-2 h-4 w-4" />}
                  {copied ? 'Copied. Now paste it in your AI' : 'Copy the prompt'}
                </Button>
                <details className="mt-3 text-xs text-muted-foreground">
                  <summary className="cursor-pointer select-none hover:text-foreground">See what it says</summary>
                  <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap rounded-lg bg-muted p-3 leading-relaxed">
                    {PROMPT}
                  </pre>
                </details>
              </div>
            ) : (
              <ol className="mt-4 space-y-3">
                {[
                  { Icon: Plug, title: 'Connect Zite', text: 'In your AI app, open connectors (or apps) settings and add Zite.' },
                  { Icon: Copy, title: 'Paste the prompt', text: 'Switch to "I have an AI connected" and copy it into a new chat.' },
                  { Icon: Mic, title: 'Talk it through', text: 'Answer its questions. It builds the process here when you finish.' },
                ].map(({ Icon, title, text }, i) => (
                  <li key={title} className="flex items-start gap-3">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                      {i + 1}
                    </span>
                    <span className="text-sm">
                      <span className="flex items-center gap-1.5 font-medium">
                        <Icon className="h-3.5 w-3.5 text-primary" /> {title}
                      </span>
                      <span className="block text-muted-foreground">{text}</span>
                    </span>
                  </li>
                ))}
              </ol>
            )}

            <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              Works with
              <span className="inline-flex items-center gap-1 rounded-full border border-border bg-background px-2 py-0.5">
                <img src={claudeLogo} alt="" className="h-3.5 w-3.5" /> Claude
              </span>
              <span className="inline-flex items-center gap-1 rounded-full border border-border bg-background px-2 py-0.5">
                <img src={chatgptLogo} alt="" className="h-3.5 w-3.5" /> ChatGPT
              </span>
              <span className="inline-flex items-center gap-1 rounded-full border border-border bg-background px-2 py-0.5">
                <Sparkles className="h-3 w-3" /> Any agent that connects to Zite
              </span>
            </div>
          </div>

          {/* Right: a little preview of how it feels */}
          <div className="rounded-xl border border-border bg-background/80 p-4">
            <p className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              What it feels like
            </p>
            <div className="space-y-2.5 text-sm">
              <div className="max-w-[85%] rounded-2xl rounded-tl-sm bg-muted px-3 py-2">
                What is the process called, and what starts it?
              </div>
              <div className="ml-auto flex max-w-[85%] items-start gap-2 rounded-2xl rounded-tr-sm bg-primary px-3 py-2 text-primary-foreground">
                <Mic className="mt-0.5 h-3.5 w-3.5 shrink-0 opacity-80" />
                <span>Client onboarding. It starts when a contract gets signed.</span>
              </div>
              <div className="max-w-[85%] rounded-2xl rounded-tl-sm bg-muted px-3 py-2">
                Got it. Who does the first step, and in which tool?
              </div>
            </div>
            <p className="mt-4 flex items-start gap-2 rounded-lg bg-muted/60 px-3 py-2 text-xs text-muted-foreground">
              <img src={wisprLogo} alt="" className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                <b className="text-foreground">Pro tip:</b> use a voice tool like Wispr Flow. Talking is faster than
                typing, and you remember more steps out loud.
              </span>
            </p>
          </div>
        </div>
      )}
    </section>
  );
}
