import { useEffect, useState } from 'react';
import { getShareLink, setShareLink } from 'zitejs/api';
import { Check, Copy, ExternalLink, FileDown } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@project/components/ui/button';
import { Input } from '@project/components/ui/input';
import { Switch } from '@project/components/ui/switch';
import { Skeleton } from '@project/components/ui/skeleton';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@project/components/ui/dialog';

interface Props {
  processId: string;
  processName: string;
  /** Whether any version is live. The link only ever shows the live one. */
  hasLive: boolean;
  onClose: () => void;
}

/**
 * Turn a read-only link for one process on or off. Anyone with the link can see
 * the live version without signing in, and save it as a PDF. Turning it off
 * breaks the link for good; turning it on again makes the same link work again.
 */
export default function ShareDialog({ processId, processName, hasLive, onClose }: Props) {
  // undefined while loading, null when the link is off.
  const [token, setToken] = useState<string | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getShareLink({ processId })
      .then((r) => !cancelled && setToken(r.token))
      .catch(() => {
        if (!cancelled) {
          setToken(null);
          toast.error('Could not check the share link.');
        }
      });
    return () => {
      cancelled = true;
    };
  }, [processId]);

  const link = token ? `${window.location.origin}/share/${token}` : '';

  const toggle = async (enabled: boolean) => {
    setBusy(true);
    try {
      const r = await setShareLink({ processId, enabled });
      setToken(r.token);
      toast.success(enabled ? 'Link is on. Anyone with it can view this process.' : 'Link turned off. It no longer works.');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not change the link.');
    } finally {
      setBusy(false);
    }
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Couldn't copy. Select the link and copy it by hand.");
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-base">Share “{processName}”</DialogTitle>
          <DialogDescription>
            Send a read-only view to a client or a new hire. They don't need an account.
          </DialogDescription>
        </DialogHeader>

        {token === undefined ? (
          <Skeleton className="h-14 rounded-xl" />
        ) : (
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-4 rounded-xl border border-border bg-card px-4 py-3">
              <div>
                <p className="text-sm font-medium">Anyone with the link can view</p>
                <p className="text-xs text-muted-foreground">{token ? 'The link is on.' : 'The link is off.'}</p>
              </div>
              <Switch checked={!!token} disabled={busy} onCheckedChange={toggle} aria-label="Anyone with the link can view" />
            </div>

            {token && (
              <>
                <div className="flex gap-2">
                  <Input readOnly value={link} onFocus={(e) => e.currentTarget.select()} className="h-9 text-xs" />
                  <Button size="sm" className="h-9 shrink-0" onClick={copy}>
                    {copied ? <Check className="mr-1.5 h-3.5 w-3.5" /> : <Copy className="mr-1.5 h-3.5 w-3.5" />}
                    {copied ? 'Copied' : 'Copy'}
                  </Button>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" size="sm" className="h-9" asChild>
                    <a href={link} target="_blank" rel="noopener noreferrer">
                      <ExternalLink className="mr-1.5 h-3.5 w-3.5" /> Open the page
                    </a>
                  </Button>
                  <Button variant="outline" size="sm" className="h-9" asChild>
                    <a href={`${link}?print=1`} target="_blank" rel="noopener noreferrer">
                      <FileDown className="mr-1.5 h-3.5 w-3.5" /> Save as PDF
                    </a>
                  </Button>
                </div>
              </>
            )}

            <ul className="space-y-1 text-xs text-muted-foreground">
              <li>It shows the live version only, and nobody can edit it.</li>
              <li>You can turn it off any time. Turning it off breaks the link for good.</li>
              {!hasLive && (
                <li className="font-medium text-amber-700">
                  This process has no live version yet, so the link says it isn't available until one goes live.
                </li>
              )}
            </ul>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
