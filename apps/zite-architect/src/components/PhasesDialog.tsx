import { useState } from 'react';
import { savePhases } from 'zitejs/api';
import { ArrowUp, ArrowDown, X, Plus } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@project/components/ui/dialog';
import { Button } from '@project/components/ui/button';
import { Input } from '@project/components/ui/input';
import { toast } from 'sonner';
import type { Phase } from '@/types';

interface Row {
  /** Absent until saved. */
  id?: string;
  /** Stable React key, so a row keeps focus while the list reorders. */
  key: string;
  name: string;
}

interface Props {
  processId: string;
  phases: Phase[];
  /** Steps in each phase, so removing one can say what happens to them. */
  stepCounts: Map<string, number>;
  onClose: () => void;
  onSaved: () => void;
}

/**
 * One list, edited in place: type to rename, arrows to reorder, x to remove.
 * Nothing is saved until Save, so it's safe to try things.
 */
export default function PhasesDialog({ processId, phases, stepCounts, onClose, onSaved }: Props) {
  const [rows, setRows] = useState<Row[]>(() =>
    phases.map((p) => ({ id: p.id, key: p.id, name: p.name })),
  );
  const [saving, setSaving] = useState(false);
  const [showErrors, setShowErrors] = useState(false);

  const update = (key: string, name: string) =>
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, name } : r)));

  const move = (index: number, by: -1 | 1) =>
    setRows((rs) => {
      const next = [...rs];
      const [row] = next.splice(index, 1);
      next.splice(index + by, 0, row);
      return next;
    });

  const remove = (key: string) => setRows((rs) => rs.filter((r) => r.key !== key));

  const add = () =>
    setRows((rs) => [...rs, { key: `new-${Date.now()}`, name: '' }]);

  // Steps in phases that are about to disappear, for the warning under the list.
  const orphaned = phases
    .filter((p) => !rows.some((r) => r.id === p.id))
    .reduce((sum, p) => sum + (stepCounts.get(p.id) ?? 0), 0);

  const save = async () => {
    if (rows.some((r) => !r.name.trim())) {
      setShowErrors(true);
      return;
    }
    setSaving(true);
    try {
      await savePhases({
        processId,
        phases: rows.map((r) => ({ id: r.id, name: r.name.trim() })),
      });
      toast.success('Phases saved');
      onSaved();
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not save the phases.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Phases</DialogTitle>
          <DialogDescription>
            The stages of this process, left to right on the map. Only this process uses them.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          {rows.map((row, i) => {
            const empty = showErrors && !row.name.trim();
            return (
              <div key={row.key}>
                <div className="flex items-center gap-2">
                  <span className="w-5 text-right text-xs tabular-nums text-muted-foreground">{i + 1}</span>
                  <Input
                    value={row.name}
                    onChange={(e) => update(row.key, e.target.value)}
                    placeholder="Kickoff"
                    autoFocus={!row.id && i === rows.length - 1}
                    aria-invalid={empty}
                    className={`h-9 ${empty ? 'border-destructive' : ''}`}
                  />
                  <div className="flex shrink-0">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => move(i, -1)}
                      disabled={i === 0}
                      aria-label="Move up"
                    >
                      <ArrowUp className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => move(i, 1)}
                      disabled={i === rows.length - 1}
                      aria-label="Move down"
                    >
                      <ArrowDown className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-muted-foreground hover:text-destructive"
                      onClick={() => remove(row.key)}
                      aria-label={`Remove ${row.name || 'phase'}`}
                    >
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
                {empty && <p className="ml-7 mt-1 text-xs text-destructive">Give this phase a name</p>}
              </div>
            );
          })}

          {rows.length === 0 && (
            <p className="py-2 text-sm text-muted-foreground">
              No phases. The map shows the whole process as one stretch.
            </p>
          )}

          <Button type="button" variant="outline" size="sm" className="ml-7" onClick={add}>
            <Plus className="h-3.5 w-3.5 mr-1" />
            Add phase
          </Button>

          {orphaned > 0 && (
            <p className="ml-7 text-xs text-muted-foreground">
              {orphaned} step{orphaned === 1 ? '' : 's'} in removed phases will go back to Unsorted.
            </p>
          )}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="button" onClick={save} disabled={saving}>
            {saving ? 'Saving…' : 'Save'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
