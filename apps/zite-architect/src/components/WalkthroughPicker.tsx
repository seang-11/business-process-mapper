import { useState } from 'react';
import { Play } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@project/components/ui/dialog';
import { Button } from '@project/components/ui/button';

interface VersionOption {
  id: string;
  name: string;
  state: string;
  stepCount: number;
  lastEdited: string;
}

interface Props {
  versions: VersionOption[];
  /** The version open on the map, used when there's no future version. */
  openVersionId: string | null;
  loading: boolean;
  onPlay: (versionId: string) => void;
  onClose: () => void;
}

/**
 * The walkthrough is mostly for showing where a process is heading, so a
 * future version is picked by default when there is one.
 */
export default function WalkthroughPicker({ versions, openVersionId, loading, onPlay, onClose }: Props) {
  const future = versions
    .filter((v) => /future/i.test(v.state) && v.stepCount > 0)
    .sort((a, b) => b.lastEdited.localeCompare(a.lastEdited))[0];
  const [chosen, setChosen] = useState(future?.id ?? openVersionId ?? versions[0]?.id ?? '');

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Play walkthrough</DialogTitle>
          <DialogDescription>Which version of the process should it show?</DialogDescription>
        </DialogHeader>

        <div className="space-y-2" role="radiogroup">
          {versions.map((v) => {
            const on = v.id === chosen;
            const empty = v.stepCount === 0;
            return (
              <button
                key={v.id}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => setChosen(v.id)}
                className={`flex w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors ${
                  on ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted'
                }`}
              >
                <span
                  className={`h-4 w-4 shrink-0 rounded-full border-2 ${on ? 'border-primary bg-primary shadow-[inset_0_0_0_2px_hsl(var(--background))]' : 'border-muted-foreground/40'}`}
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{v.name}</span>
                  <span className="block text-xs text-muted-foreground">
                    {v.state}
                    {' · '}
                    {empty ? 'no steps yet' : `${v.stepCount} step${v.stepCount === 1 ? '' : 's'}`}
                  </span>
                </span>
              </button>
            );
          })}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => onPlay(chosen)} disabled={loading || !chosen}>
            <Play className="mr-1.5 h-3.5 w-3.5" />
            {loading ? 'Loading…' : 'Play'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
