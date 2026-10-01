import { useState } from 'react';
import { saveVersion, deleteVersion, GetProcessesOutputType } from 'zitejs/api';
import { toast } from 'sonner';
import { Trash2 } from 'lucide-react';
import { Button } from '@project/components/ui/button';
import { Input } from '@project/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@project/components/ui/dialog';

type Version = GetProcessesOutputType['processes'][number]['versions'][number];

interface Props {
  versions: Version[];
  /** The one on screen, so deleting it can move the viewer somewhere valid. */
  currentVersionId: string | null;
  onChanged: (nextVersionId?: string) => void;
  onClose: () => void;
}

export default function VersionsDialog({
  versions,
  currentVersionId,
  onChanged,
  onClose,
}: Props) {
  const [names, setNames] = useState<Record<string, string>>(() =>
    Object.fromEntries(versions.map((v) => [v.id, v.name])),
  );
  const [busy, setBusy] = useState<string | null>(null);

  const rename = async (v: Version) => {
    const next = (names[v.id] ?? '').trim();
    if (!next || next === v.name) return;
    setBusy(v.id);
    try {
      await saveVersion({ id: v.id, name: next });
      onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not rename the version.');
      setNames((prev) => ({ ...prev, [v.id]: v.name }));
    } finally {
      setBusy(null);
    }
  };

  const remove = async (v: Version) => {
    setBusy(v.id);
    try {
      const res = await deleteVersion({ id: v.id });
      if (!res.success) {
        toast.error(res.reason);
        return;
      }
      toast.success(
        res.stepsRemoved
          ? `${v.name} deleted, ${res.stepsRemoved} step${res.stepsRemoved === 1 ? '' : 's'} with it`
          : `${v.name} deleted`,
      );
      onChanged(
        v.id === currentVersionId ? res.remainingVersionId ?? undefined : undefined,
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not delete the version.');
    } finally {
      setBusy(null);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-base">Versions</DialogTitle>
        </DialogHeader>

        <div className="border border-border rounded-md divide-y divide-border max-h-72 overflow-y-auto">
          {versions.map((v) => (
            <div key={v.id} className="flex items-center gap-2 px-2.5 py-2">
              <Input
                value={names[v.id] ?? ''}
                onChange={(e) => setNames((prev) => ({ ...prev, [v.id]: e.target.value }))}
                onBlur={() => rename(v)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') e.currentTarget.blur();
                }}
                disabled={busy === v.id}
                className="h-8 text-xs"
              />
              <span className="text-[11px] text-muted-foreground shrink-0 w-24 text-right">
                {v.state} · {v.stepCount}
              </span>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-7 w-7 shrink-0 text-destructive hover:text-destructive"
                disabled={busy === v.id || versions.length === 1}
                title={
                  versions.length === 1
                    ? 'A process needs at least one version'
                    : `Delete ${v.name}`
                }
                onClick={() => remove(v)}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}
        </div>

        <DialogFooter>
          <Button size="sm" onClick={onClose}>
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
