import { useState } from 'react';
import { saveElement } from 'zitejs/api';
import { toast } from 'sonner';
import { Button } from '@project/components/ui/button';
import { Input } from '@project/components/ui/input';
import { Label } from '@project/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@project/components/ui/dialog';
import type { ElementSummary, ElementType } from '@/types';
import ElementPicker from './ElementPicker';

interface ProcessInfo {
  id: string;
  name: string;
  ownerId: string | null;
  backupOwnerId?: string | null;
}

interface Props {
  process: ProcessInfo;
  elements: ElementSummary[];
  types: ElementType[];
  onClose: () => void;
  onSaved: () => void;
}

export default function EditProcessDialog({
  process,
  elements,
  types,
  onClose,
  onSaved,
}: Props) {
  const [name, setName] = useState(process.name);
  const [ownerId, setOwnerId] = useState<string | null>(process.ownerId);
  const [backupOwnerId, setBackupOwnerId] = useState<string | null>(process.backupOwnerId ?? null);
  const [saving, setSaving] = useState(false);

  const dirty =
    name.trim() !== process.name ||
    ownerId !== process.ownerId ||
    backupOwnerId !== (process.backupOwnerId ?? null);

  const handleSave = async () => {
    if (!name.trim()) {
      toast.error('Give the process a name.');
      return;
    }
    setSaving(true);
    try {
      const patch: Record<string, unknown> = { id: process.id };
      if (name.trim() !== process.name) (patch as any).name = name.trim();
      if (ownerId !== process.ownerId) (patch as any).ownerId = ownerId;
      if (backupOwnerId !== (process.backupOwnerId ?? null)) (patch as any).backupOwnerId = backupOwnerId;
      await saveElement(patch as any);
      toast.success('Process updated');
      onSaved();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : 'Could not update the process.',
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-base">Process settings</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label className="text-xs">Name</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Process name"
              autoFocus
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Owner</Label>
            <ElementPicker
              elements={elements}
              types={types}
              category="Actor"
              value={ownerId ? [ownerId] : []}
              onChange={(ids) => setOwnerId(ids[0] ?? null)}
              clearable
              placeholder="Who is accountable?"
              excludeIds={[process.id, ...(backupOwnerId ? [backupOwnerId] : [])]}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Backup owner</Label>
            <ElementPicker
              elements={elements}
              types={types}
              category="Actor"
              value={backupOwnerId ? [backupOwnerId] : []}
              onChange={(ids) => setBackupOwnerId(ids[0] ?? null)}
              clearable
              placeholder="Who covers when the owner is away?"
              excludeIds={[process.id, ...(ownerId ? [ownerId] : [])]}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button size="sm" onClick={handleSave} disabled={saving || !dirty}>
            {saving ? 'Saving…' : 'Save'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
