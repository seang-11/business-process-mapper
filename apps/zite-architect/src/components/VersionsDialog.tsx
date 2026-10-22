import { useState } from 'react';
import { saveVersion, deleteVersion, goLive, GetProcessesOutputType } from 'zitejs/api';
import { toast } from 'sonner';
import { Trash2, Radio } from 'lucide-react';
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

/** Today as YYYY-MM-DD in the viewer's own time zone. */
const today = () => new Date().toLocaleDateString('en-CA');

const STATE_TAG: Record<string, { label: string; className: string }> = {
  Current: { label: 'Live', className: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300' },
  Future: { label: 'Not live yet', className: 'bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300' },
  Archived: { label: 'Retired', className: 'bg-muted text-muted-foreground' },
};

export default function VersionsDialog({
  versions,
  currentVersionId,
  onChanged,
  onClose,
}: Props) {
  const [names, setNames] = useState<Record<string, string>>(() =>
    Object.fromEntries(versions.map((v) => [v.id, v.name])),
  );
  const [dates, setDates] = useState<Record<string, { from: string; to: string }>>(() =>
    Object.fromEntries(versions.map((v) => [v.id, { from: v.liveFrom, to: v.liveTo }])),
  );
  const [busy, setBusy] = useState<string | null>(null);
  /** The version being made live, and the day it goes live. */
  const [goingLive, setGoingLive] = useState<string | null>(null);
  const [liveDay, setLiveDay] = useState(today());

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

  const saveDate = async (v: Version, which: 'from' | 'to', value: string) => {
    setDates((prev) => ({ ...prev, [v.id]: { ...prev[v.id], [which]: value } }));
    try {
      await saveVersion({ id: v.id, ...(which === 'from' ? { liveFrom: value } : { liveTo: value }) });
      onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not save that date.');
    }
  };

  const makeLive = async (v: Version) => {
    setBusy(v.id);
    try {
      const res = await goLive({ versionId: v.id, date: liveDay });
      toast.success(
        res.retired
          ? `${v.name} is live. The previous version is retired as of ${liveDay}.`
          : `${v.name} is live`,
      );
      setGoingLive(null);
      onChanged(v.id);
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not make that version live.');
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
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="text-base">Versions</DialogTitle>
        </DialogHeader>

        <p className="-mt-1 text-sm text-muted-foreground">
          The live version is how the work is done today, so it's the one people get trained on. Build the next
          one as "Not live yet", then make it live when it's ready. The old one is kept as retired, with the dates
          it ran.
        </p>

        <div className="max-h-[22rem] divide-y divide-border overflow-y-auto rounded-lg border border-border">
          {versions.map((v) => {
            const tag = STATE_TAG[v.state] ?? STATE_TAG.Archived;
            const d = dates[v.id] ?? { from: '', to: '' };
            return (
              <div key={v.id} className="space-y-2.5 px-3 py-3">
                <div className="flex items-center gap-2">
                  <Input
                    value={names[v.id] ?? ''}
                    onChange={(e) => setNames((prev) => ({ ...prev, [v.id]: e.target.value }))}
                    onBlur={() => rename(v)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') e.currentTarget.blur();
                    }}
                    disabled={busy === v.id}
                    className="h-8 text-sm"
                  />
                  <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${tag.className}`}>
                    {tag.label}
                  </span>
                  <span className="w-16 shrink-0 text-right text-[11px] text-muted-foreground">
                    {v.stepCount} step{v.stepCount === 1 ? '' : 's'}
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

                <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground">
                  {v.state === 'Future' ? (
                    goingLive === v.id ? (
                      <>
                        <label className="flex items-center gap-2">
                          Goes live on
                          <Input
                            type="date"
                            value={liveDay}
                            onChange={(e) => setLiveDay(e.target.value)}
                            className="h-7 w-[9.5rem] text-xs"
                          />
                        </label>
                        <Button size="sm" className="h-7 text-xs" disabled={!liveDay || busy === v.id} onClick={() => makeLive(v)}>
                          <Radio className="mr-1.5 h-3 w-3" /> Make it live
                        </Button>
                        <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setGoingLive(null)}>
                          Cancel
                        </Button>
                        <span className="basis-full">
                          The version that's live now is retired on the same day.
                        </span>
                      </>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs"
                        onClick={() => {
                          setLiveDay(today());
                          setGoingLive(v.id);
                        }}
                      >
                        <Radio className="mr-1.5 h-3 w-3" /> Make this the live version
                      </Button>
                    )
                  ) : (
                    <>
                      <label className="flex items-center gap-2">
                        Live from
                        <Input
                          type="date"
                          value={d.from}
                          onChange={(e) => saveDate(v, 'from', e.target.value)}
                          className="h-7 w-[9.5rem] text-xs"
                        />
                      </label>
                      {v.state === 'Archived' ? (
                        <label className="flex items-center gap-2">
                          to
                          <Input
                            type="date"
                            value={d.to}
                            onChange={(e) => saveDate(v, 'to', e.target.value)}
                            className="h-7 w-[9.5rem] text-xs"
                          />
                        </label>
                      ) : (
                        <span>
                          {d.from ? 'and still running' : 'Add the day it went live, so you can say when this applies'}
                        </span>
                      )}
                      {v.state === 'Archived' && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 text-xs"
                          onClick={() => {
                            setLiveDay(today());
                            setGoingLive(v.id);
                          }}
                        >
                          Make live again
                        </Button>
                      )}
                      {v.state === 'Archived' && goingLive === v.id && (
                        <span className="flex basis-full flex-wrap items-center gap-2">
                          <Input
                            type="date"
                            value={liveDay}
                            onChange={(e) => setLiveDay(e.target.value)}
                            className="h-7 w-[9.5rem] text-xs"
                          />
                          <Button size="sm" className="h-7 text-xs" disabled={!liveDay || busy === v.id} onClick={() => makeLive(v)}>
                            Make it live
                          </Button>
                          <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setGoingLive(null)}>
                            Cancel
                          </Button>
                        </span>
                      )}
                    </>
                  )}
                </div>
              </div>
            );
          })}
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
