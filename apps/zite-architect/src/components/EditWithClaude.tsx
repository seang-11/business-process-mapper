import { useEffect, useState } from 'react';
import { getWorkspaceLink, GetWorkspaceLinkOutputType } from 'zitejs/api';
import { Check, Copy, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@project/components/ui/button';
import { Textarea } from '@project/components/ui/textarea';
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

/** Everything Claude needs to change one process, plus what the person wants changed (if they wrote it). */
export function buildEditPrompt(links: Links | null, t: Target, request: string) {
  const live = t.versionState === 'Current';
  return `You are my process-mapping assistant for my Business Process Mapper app, built on Zite.

WHAT I WANT
Change one process: "${t.processName}" (process id ${t.processId}).
Work on the version "${t.versionName}" (${live ? 'the live version' : t.versionState === 'Future' ? 'a future version, not live yet' : t.versionState}, version id ${t.versionId}). Leave every other process and version alone unless I say so.
${request.trim() ? `\nWhat I want different:\n${request.trim()}\n` : '\nAsk me what I want to change, one short question at a time.\n'}${
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
 * For editors: describe a change in plain words, then hand it to Claude with
 * everything it needs about this process already in the prompt.
 */
export default function EditWithClaude({ target, onClose }: { target: Target; onClose: () => void }) {
  const [request, setRequest] = useState('');
  const [links, setLinks] = useState<Links | null>(null);
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    getWorkspaceLink({}).then(setLinks).catch(() => setLinks(null));
  }, []);

  const copy = async (open: boolean) => {
    // Open Claude straight away, so the browser treats it as part of the click.
    const tab = open ? window.open('https://claude.ai/new', '_blank', 'noopener') : null;
    try {
      await navigator.clipboard.writeText(buildEditPrompt(links, target, request));
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
      toast.success(open ? 'Prompt copied. Paste it into the new Claude chat.' : 'Prompt copied');
    } catch {
      tab?.close();
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
            Say what should change in {target.processName}. The prompt already tells Claude which process and version to work on.
          </DialogDescription>
        </DialogHeader>

        <Textarea
          value={request}
          onChange={(e) => setRequest(e.target.value)}
          rows={5}
          autoFocus
          placeholder="Example: The Finance Lead no longer emails the invoice. QuickBooks sends it automatically, and the Finance Lead only checks it first."
        />
        <p className="-mt-1 text-xs text-muted-foreground">
          Leave it empty and Claude will ask you what to change instead.
        </p>

        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={() => copy(true)}>
            {copied ? <Check className="mr-1.5 h-4 w-4" /> : <ExternalLink className="mr-1.5 h-4 w-4" />}
            Copy prompt and open Claude
          </Button>
          <Button variant="outline" onClick={() => copy(false)}>
            <Copy className="mr-1.5 h-4 w-4" /> Copy only
          </Button>
        </div>
        <p className="text-[11px] text-muted-foreground">
          First time? Connect Zite to Claude once from the "Just talk" card on Home, so Claude can make the changes for you.
        </p>
      </DialogContent>
    </Dialog>
  );
}
