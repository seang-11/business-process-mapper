import { useEffect, useRef, useState } from 'react';
import { getWorkspaceLink, GetWorkspaceLinkOutputType } from 'zitejs/api';
import { ChevronDown, Copy, Mic, Square, Wand2 } from 'lucide-react';
import { Button } from '@project/components/ui/button';
import { toast } from 'sonner';
import claudeLogo from '../assets/logos/claude.svg';
import chatgptLogo from '../assets/logos/chatgpt.svg';
import wisprLogo from '../assets/logos/wisprflow.svg';

const OPEN_KEY = 'bpm_talk_open_v3';

type Links = GetWorkspaceLinkOutputType;

/**
 * The briefing an AI agent gets. It explains what this app is for and how its
 * data fits together, tells the agent to read the app's own notes first, and
 * then has it interview you. Whatever you said or typed in the box goes in too.
 */
const buildPrompt = (links: Links | null, said: string) => `You are my process-mapping assistant for my Business Process Mapper app, built on Zite.

WHAT THIS APP IS FOR
It is a simple place for a business owner and their team to see how work really gets done. Each process is mapped as steps: who or what does each step (a person, a role, or an app doing it automatically), which tools it uses, what it produces, and how the steps connect. Each process has a v1 Current state and can have a Future state. The point is to see, at a glance, where the team spends time on work that could be automated and where a human review still matters. An AI automation lead keeps the maps up to date so the owner does not have to.
${
  links
    ? `
MY WORKSPACE
Workspace: ${links.workspaceHomeUrl}
App editor: ${links.editorUrl}
Live app: ${links.appUrl}
Only work in the workspace that matches those links. Do not touch any other workspace.
`
    : ''
}
BEFORE YOU ASK ME ANYTHING, LOOK AT THE APP (change nothing yet)
1. Open a sandbox for the workspace and read AGENTS.md and CLAUDE.md in the project root. They explain how Zite apps are built. For more detail use https://developers.zite.com/llms-full.txt.
2. Read the database tables so you know how a process is stored: Elements (people, roles, apps and documents, each with an Element Type), Process Versions (State is Current, Future or Archived), Steps (Title, Description, Step Type of Task, Decision, Wait or Sub-process, Performed By, Uses, Produces, Sequence), and Step Connections (From Step, To Step, Label).
3. List the processes and elements that already exist, so you reuse them.
4. Tell me in two sentences what you found, then start the interview.

HOW TO INTERVIEW ME
- Ask ONE short question at a time.
- Start with: What is the process called, and what starts it?
- Walk me through it in order. For each step ask who or what does it, which tools they use, and what comes next.
- Ask what happens when something goes wrong, which steps repeat, and where a human has to check the work.
- If I ramble, that is fine. Pull out the steps yourself.
- When I say "that's it", read the process back as a numbered list and ask what to fix.

RULES WHEN YOU BUILD IT (after I approve the list)
- Create the process with a version called "v1 · Current state" (State: Current).
- Every step has exactly one Performed By. Whatever performs a step is never also listed in its Uses.
- Reuse existing people, roles and apps. Only create a new element if none fits.
- Connect every step to the next with a Step Connection. A decision needs a labelled connection for each outcome, such as Yes and No. A loop back to an earlier step is fine.
- Fill Sequence in order, starting at 1.
- If I describe a better, more automated way, also build a second version called "v2 · Future state" (State: Future). Copy the v1 steps and set Copied From on each to the id of its v1 step, so the app can compare them.
- Finish by telling me what you created and where to open it in the app.
${
  said.trim()
    ? `
HERE IS WHAT I HAVE ALREADY SAID ABOUT THE PROCESS, IN MY OWN WORDS
${said.trim()}
Use this as your starting point and only ask about what is missing.
`
    : ''
}`;

// The browser's built-in speech to text. Chrome, Edge and Safari have it; Firefox does not.
type Recognition = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((e: any) => void) | null;
  onerror: ((e: any) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};
const speechCtor = (): (new () => Recognition) | null => {
  const w = window as unknown as Record<string, unknown>;
  return (w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null) as (new () => Recognition) | null;
};

/**
 * A card at the top of the home page for editors: say or type what the process
 * is, then hand it to Claude, ChatGPT or any AI agent that can reach Zite.
 */
export default function TalkItThrough() {
  const [open, setOpen] = useState(() => {
    try {
      return localStorage.getItem(OPEN_KEY) !== '0';
    } catch {
      return true;
    }
  });
  const [said, setSaid] = useState('');
  const [listening, setListening] = useState(false);
  const [links, setLinks] = useState<Links | null>(null);
  const recognition = useRef<Recognition | null>(null);
  const canSpeak = typeof window !== 'undefined' && speechCtor() !== null;

  // This app's own links, so the prompt points the AI at the right workspace.
  useEffect(() => {
    getWorkspaceLink({}).then(setLinks).catch(() => setLinks(null));
    return () => recognition.current?.stop();
  }, []);

  const toggle = () => {
    const next = !open;
    setOpen(next);
    try {
      localStorage.setItem(OPEN_KEY, next ? '1' : '0');
    } catch {
      /* it just resets next visit */
    }
  };

  const stopListening = () => {
    recognition.current?.stop();
    setListening(false);
  };

  const startListening = () => {
    const Ctor = speechCtor();
    if (!Ctor) return;
    const rec = new Ctor();
    rec.continuous = true;
    rec.interimResults = false;
    rec.lang = navigator.language || 'en-US';
    rec.onresult = (e) => {
      let heard = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) heard += e.results[i][0].transcript;
      }
      if (heard.trim()) setSaid((prev) => `${prev}${prev && !/\s$/.test(prev) ? ' ' : ''}${heard.trim()}`);
    };
    rec.onerror = (e) => {
      setListening(false);
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
        toast.error('Allow the microphone for this site, then try again.');
      }
    };
    rec.onend = () => setListening(false);
    recognition.current = rec;
    try {
      rec.start();
      setListening(true);
    } catch {
      setListening(false);
    }
  };

  // Copies the briefing, then opens the AI in a new tab so it is one click from pasting.
  const handOff = async (url: string | null) => {
    stopListening();
    const text = buildPrompt(links, said);
    // Opening the tab has to happen inside the click, before anything is awaited.
    if (url) window.open(url, '_blank', 'noopener');
    try {
      await navigator.clipboard.writeText(text);
      toast.success(url ? 'Copied. Paste it into the new chat.' : 'Copied. Paste it into your AI.');
    } catch {
      toast.error("Couldn't copy. Allow clipboard access and try again.");
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
            Describe a process out loud. Your AI learns this app, asks the right questions, and adds it here.
          </span>
        </span>
        <ChevronDown className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="grid gap-6 px-5 pb-5 md:grid-cols-[1.4fr_1fr]">
          <div>
            <label htmlFor="talk-said" className="text-sm font-medium">
              What process do you want to map?
            </label>
            <div className="relative mt-2">
              <textarea
                id="talk-said"
                value={said}
                onChange={(e) => setSaid(e.target.value)}
                rows={4}
                placeholder="Say it or type it. For example: when a client signs, we send a welcome email, then set up their folder and kick off a call…"
                className="w-full resize-none rounded-xl border border-border bg-background px-3.5 py-3 pr-14 text-sm leading-relaxed shadow-[0_1px_2px_rgba(16,24,40,0.04)] outline-none placeholder:text-muted-foreground/70 focus:border-primary/50 focus:ring-2 focus:ring-primary/15"
              />
              {canSpeak && (
                <button
                  type="button"
                  onClick={listening ? stopListening : startListening}
                  aria-label={listening ? 'Stop listening' : 'Start talking'}
                  title={listening ? 'Stop' : 'Talk instead of typing'}
                  className={`absolute right-2.5 top-2.5 flex h-9 w-9 items-center justify-center rounded-full transition-colors ${
                    listening
                      ? 'animate-pulse bg-red-500 text-white'
                      : 'bg-primary/10 text-primary hover:bg-primary/20'
                  }`}
                >
                  {listening ? <Square className="h-3.5 w-3.5 fill-current" /> : <Mic className="h-4 w-4" />}
                </button>
              )}
            </div>
            <p className="mt-1.5 flex items-center gap-1.5 text-xs text-muted-foreground">
              {listening ? (
                <span className="font-medium text-red-600">Listening… click the square when you are done.</span>
              ) : canSpeak ? (
                <>Click the mic and talk. Rough is fine, your AI asks about the gaps.</>
              ) : (
                <>
                  <img src={wisprLogo} alt="" className="h-3.5 w-3.5" /> This browser can't listen, but a voice tool
                  like Wispr Flow will type for you.
                </>
              )}
            </p>

            <div className="mt-4 flex flex-wrap items-center gap-2">
              <Button className="h-10" onClick={() => handOff('https://claude.ai/new')}>
                <img src={claudeLogo} alt="" className="mr-2 h-4 w-4 rounded-sm bg-white/90 p-px" />
                Copy and open Claude
              </Button>
              <Button variant="outline" className="h-10" onClick={() => handOff('https://chatgpt.com/')}>
                <img src={chatgptLogo} alt="" className="mr-2 h-4 w-4" />
                Copy and open ChatGPT
              </Button>
              <Button variant="ghost" className="h-10 text-muted-foreground" onClick={() => handOff(null)}>
                <Copy className="mr-1.5 h-4 w-4" /> Just copy
              </Button>
            </div>
            <p className="mt-2.5 text-xs text-muted-foreground">
              Zite needs to be connected once in your AI app (Connectors in Claude, Apps in ChatGPT). Any other AI
              agent that can reach Zite works too.
            </p>
          </div>

          <div className="rounded-xl border border-border bg-background/80 p-4">
            <p className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              What your AI does with it
            </p>
            <ol className="space-y-3 text-sm">
              {[
                ['Learns this app', 'It reads how the app works and what is already in it, so it builds the right way.'],
                ['Interviews you', 'One short question at a time, starting from what you said above.'],
                ['Builds the map', 'Steps, who does them, tools, and a future version if you describe one.'],
              ].map(([title, text], i) => (
                <li key={title} className="flex items-start gap-3">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                    {i + 1}
                  </span>
                  <span>
                    <span className="block font-medium">{title}</span>
                    <span className="block text-xs text-muted-foreground">{text}</span>
                  </span>
                </li>
              ))}
            </ol>
          </div>
        </div>
      )}
    </section>
  );
}
