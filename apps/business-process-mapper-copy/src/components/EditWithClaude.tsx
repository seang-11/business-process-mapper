import { useEffect, useState } from 'react';
import { getWorkspaceLink, GetWorkspaceLinkOutputType } from 'zitejs/api';
import { Check, Copy, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@project/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@project/components/ui/dialog';
import claudeLogo from '../assets/logos/claude.svg';
// The same two notes the Just talk prompt carries, so Claude knows how Zite apps work.
import claudeMd from '../assets/zite/CLAUDE.md?raw';
import agentsMd from '../assets/zite/AGENTS.md?raw';

type Links = GetWorkspaceLinkOutputType;

interface Target {
  processId: string;
  processName: string;
  versionId: string;
  versionName: string;
  /** Current is live; Future is being prepared. */
  versionState: string;
}

/** Everything Claude needs to change one process. Claude asks what to change. */
export function buildEditPrompt(links: Links | null, t: Target) {
  const live = t.versionState === 'Current';
  return `You are my process-mapping assistant for my Business Process Mapper app, built on Zite.

WHAT I WANT
Change one process: "${t.processName}" (process id ${t.processId}).
Work on the version "${t.versionName}" (${live ? 'the live version' : t.versionState === 'Future' ? 'a future version, not live yet' : t.versionState}, version id ${t.versionId}). Leave every other process and version alone unless I say so.

Ask me what I want to change, one short question at a time.
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

BEFORE YOU CHANGE ANYTHING
1. Read this version's Steps (Title, Description, Step Type of Task, Decision, Wait or Sub-process, Performed By, Uses, Produces, Sequence, Minutes Per Run) and Step Connections (From Step, To Step, Label), plus the Elements they point to.
2. Read the steps back to me as a short numbered list.
3. Tell me exactly what you will change, as a short list, and wait for my OK.

RULES WHEN YOU CHANGE IT
- Every step has exactly one Performed By. Whatever performs a step is never also listed in its Uses.
- Reuse existing people, roles and apps. Only create a new element if none fits.
- Keep every step connected. A decision needs a labelled connection for each outcome, such as Yes and No.
- Keep Sequence in order, starting at 1.
- Keep Minutes Per Run on steps a person on the team does. Leave it empty for steps an app does on its own.${
    live
      ? `
- This is the live version people are trained on. If the change is a new way of working rather than a fix, suggest building it as a "Future state" version first (copy the steps and set Copied From on each to the id of the step it came from), so it can be compared before it goes live.`
      : ''
  }
- Finish by telling me what changed, and to refresh the process page to see it.
`;
}

/**
 * For editors: copy a prompt that already tells Claude which process and
 * version to change, open Claude, paste, and say what to change there.
 */
export default function EditWithClaude({ target, onClose }: { target: Target; onClose: () => void }) {
  const [links, setLinks] = useState<Links | null>(null);
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    getWorkspaceLink({}).then(setLinks).catch(() => setLinks(null));
  }, []);

  // Copying and opening Claude are two clicks: opening a tab in the same click
  // moves focus away, and the browser then refuses to copy.
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(buildEditPrompt(links, target));
      setCopied(true);
    } catch {
      toast.error("Couldn't copy. Allow clipboard access and try again.");
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <img src={claudeLogo} alt="" className="h-5 w-5" /> Edit with Claude
          </DialogTitle>
          <DialogDescription>
            The prompt tells Claude to work on {target.processName}. Once it's pasted, just tell Claude what to change.
          </DialogDescription>
        </DialogHeader>

        <ol className="space-y-2.5">
          <li className="flex items-center gap-3">
            <Step n={1} done={copied} />
            <Button onClick={copy} variant={copied ? 'outline' : 'default'}>
              {copied ? <Check className="mr-1.5 h-4 w-4" /> : <Copy className="mr-1.5 h-4 w-4" />}
              {copied ? 'Copied' : 'Copy the prompt'}
            </Button>
          </li>
          <li className="flex items-center gap-3">
            <Step n={2} />
            <Button variant={copied ? 'default' : 'outline'} asChild>
              <a href="https://claude.ai/new" target="_blank" rel="noopener noreferrer">
                <img src={claudeLogo} alt="" className="mr-1.5 h-4 w-4" /> Open Claude
                <ExternalLink className="ml-1.5 h-3.5 w-3.5 opacity-70" />
              </a>
            </Button>
          </li>
          <li className="flex items-center gap-3 text-sm">
            <Step n={3} />
            Paste it into the new chat, then tell Claude what to change.
          </li>
        </ol>
        <p className="text-[11px] text-muted-foreground">
          First time? Connect Zite to Claude once from the "Just talk" card on Home, so Claude can make the changes for you.
        </p>
      </DialogContent>
    </Dialog>
  );
}

function Step({ n, done }: { n: number; done?: boolean }) {
  return (
    <span
      className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
        done ? 'bg-emerald-100 text-emerald-700' : 'bg-primary/10 text-primary'
      }`}
    >
      {done ? <Check className="h-3.5 w-3.5" /> : n}
    </span>
  );
}
