import { useEffect, useState } from 'react';
import { getWorkspaceLink, GetWorkspaceLinkOutputType } from 'zitejs/api';
import { Check, ChevronDown, Copy, ExternalLink, Mic, Wand2 } from 'lucide-react';
import { Button } from '@project/components/ui/button';
import { toast } from 'sonner';
import claudeLogo from '../assets/logos/claude.svg';
import chatgptLogo from '../assets/logos/chatgpt.svg';
import wisprLogo from '../assets/logos/wisprflow.svg';
// The same two notes an agent finds in a Zite project folder. They ride along in the copied prompt.
import claudeMd from '../assets/zite/CLAUDE.md?raw';
import agentsMd from '../assets/zite/AGENTS.md?raw';

const OPEN_KEY = 'bpm_talk_open_v4';

// Where to add Zite in each AI app. These are Zite's own listing pages.
const CONNECT_CLAUDE = 'https://claude.ai/directory/connectors/dbc52c7f-cbc6-49f4-be8d-ca58126b85ed';
const CONNECT_CHATGPT = 'https://chatgpt.com/apps/zite/asdk_app_6a0dfddea830819180d3eaf355793e42';

type Links = GetWorkspaceLinkOutputType;

/**
 * Everything an AI needs in one paste: what this app is for, how Zite apps are
 * built (the project's own AGENTS.md and CLAUDE.md), which workspace is ours, and
 * how to interview and build. Nothing has to be explained again.
 */
const buildPrompt = (links: Links | null) => `You are my process-mapping assistant for my Business Process Mapper app, built on Zite.

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
HOW ZITE APPS WORK
These are the two notes that sit in this project's folder. Treat them as your instructions for the framework.

----- AGENTS.md -----
${agentsMd.trim()}

----- CLAUDE.md -----
${claudeMd.trim()}
----- end -----

BEFORE YOU ASK ME ANYTHING, LOOK AT THE APP (change nothing yet)
1. Read the database tables so you know how a process is stored: Elements (people, roles, apps and documents, each with an Element Type; a process also has Runs Per Month), Process Versions (State is Current, Future or Archived), Steps (Title, Description, Step Type of Task, Decision, Wait or Sub-process, Performed By, Uses, Produces, Sequence, Minutes Per Run), and Step Connections (From Step, To Step, Label).
2. List the processes and elements that already exist, so you reuse them.
3. Tell me in two sentences what you found, then start the interview.

HOW TO INTERVIEW ME
- Ask ONE short question at a time.
- Start with: What is the process called, and what starts it?
- Walk me through it in order. For each step ask who or what does it, which tools they use, and what comes next.
- Ask what happens when something goes wrong, which steps repeat, and where a human has to check the work.
- Ask how many times a month the process happens.
- For each step a person on the team does, ask roughly how many minutes it takes. A rough guess is fine. Skip steps an app does on its own, and steps a client or prospect does.
- If I ramble, that is fine. Pull out the steps yourself.
- When I say "that's it", read the process back as a numbered list with the minutes beside each step, and ask what to fix.

RULES WHEN YOU BUILD IT (after I approve the list)
- Create the process with a version called "v1 · Current state" (State: Current).
- Every step has exactly one Performed By. Whatever performs a step is never also listed in its Uses.
- Reuse existing people, roles and apps. Only create a new element if none fits.
- Connect every step to the next with a Step Connection. A decision needs a labelled connection for each outcome, such as Yes and No. A loop back to an earlier step is fine.
- Fill Sequence in order, starting at 1.
- Put how often it happens in the process's Runs Per Month, and each step's minutes in its Minutes Per Run. For a step that only happens sometimes (a decline, a chase), use the average per run, so weight it down. The app's Insights page uses these to show where the team's time goes.
- If I describe a better, more automated way, also build a second version called "v2 · Future state" (State: Future). Copy the v1 steps and set Copied From on each to the id of its v1 step, so the app can compare them. Give the future steps their own minutes, so the comparison shows the time saved.
- Finish by telling me what you created and where to open it in the app.
`;

/**
 * A card at the top of the home page for editors. Two things to do: connect Zite
 * to your AI once, then copy the prompt and start talking.
 */
export default function TalkItThrough() {
  const [open, setOpen] = useState(() => {
    try {
      return localStorage.getItem(OPEN_KEY) !== '0';
    } catch {
      return true;
    }
  });
  const [copied, setCopied] = useState(false);
  // This app's own links, so the prompt points the AI at the right workspace.
  const [links, setLinks] = useState<Links | null>(null);
  useEffect(() => {
    getWorkspaceLink({}).then(setLinks).catch(() => setLinks(null));
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

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(buildPrompt(links));
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
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
            Describe a process out loud to Claude, ChatGPT, or any AI agent. It interviews you, then adds it here.
          </span>
        </span>
        <ChevronDown className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="grid gap-6 px-5 pb-5 md:grid-cols-[1.1fr_1fr]">
          <div className="space-y-5">
            {/* 1. Connect */}
            <div className="flex items-start gap-3">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                1
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold">Connect Zite to your AI</p>
                <p className="text-xs text-muted-foreground">One time only. Click Connect on the page that opens.</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <Button variant="outline" size="sm" className="h-9" asChild>
                    <a href={CONNECT_CLAUDE} target="_blank" rel="noopener noreferrer">
                      <img src={claudeLogo} alt="" className="mr-2 h-4 w-4" /> Claude
                      <ExternalLink className="ml-2 h-3 w-3 text-muted-foreground" />
                    </a>
                  </Button>
                  <Button variant="outline" size="sm" className="h-9" asChild>
                    <a href={CONNECT_CHATGPT} target="_blank" rel="noopener noreferrer">
                      <img src={chatgptLogo} alt="" className="mr-2 h-4 w-4" /> ChatGPT
                      <ExternalLink className="ml-2 h-3 w-3 text-muted-foreground" />
                    </a>
                  </Button>
                </div>
              </div>
            </div>

            {/* 2. Copy */}
            <div className="flex items-start gap-3">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                2
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold">Copy the prompt, paste it in a new chat</p>
                <p className="text-xs text-muted-foreground">
                  It teaches your AI what this app is, how Zite works, and which workspace is yours. Then start talking.
                </p>
                <Button className="mt-2 h-10 px-5" onClick={copy}>
                  {copied ? <Check className="mr-2 h-4 w-4" /> : <Copy className="mr-2 h-4 w-4" />}
                  {copied ? 'Copied. Now paste it in your AI' : 'Copy the prompt'}
                </Button>
                <details className="mt-2 text-xs text-muted-foreground">
                  <summary className="cursor-pointer select-none hover:text-foreground">See what it says</summary>
                  <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap rounded-lg bg-muted p-3 leading-relaxed">
                    {buildPrompt(links)}
                  </pre>
                </details>
              </div>
            </div>
          </div>

          {/* A little preview of how it feels */}
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
