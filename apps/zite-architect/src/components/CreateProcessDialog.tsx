import { useState } from 'react';
import { createProcess } from 'zitejs/api';
import { toast } from 'sonner';
import { Button } from '@project/components/ui/button';
import { Input } from '@project/components/ui/input';
import { Label } from '@project/components/ui/label';
import { Textarea } from '@project/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@project/components/ui/dialog';
import type { ElementSummary, ElementType } from '@/types';
import ElementPicker from './ElementPicker';

interface Props {
  elements: ElementSummary[];
  types: ElementType[];
  onClose: () => void;
  onCreated: (processId: string) => void;
}

export default function CreateProcessDialog({
  elements,
  types,
  onClose,
  onCreated,
}: Props) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [ownerId, setOwnerId] = useState<string>('');
  const [backupOwnerId, setBackupOwnerId] = useState<string>('');
  const [saving, setSaving] = useState(false);

  const handleCreate = async () => {
    if (!name.trim()) {
      toast.error('Give the process a name.');
      return;
    }
    setSaving(true);
    try {
      const res = await createProcess({
        name: name.trim(),
        description,
        ownerId: ownerId || null,
        backupOwnerId: backupOwnerId || null,
      });
      toast.success('Process created');
      onCreated(res.processId);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not create the process.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-base">New process</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label className="text-xs">Name</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Client onboarding"
              autoFocus
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Description</Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What this process covers, and where it starts and ends."
              rows={2}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Owner</Label>
            <ElementPicker
              elements={elements}
              types={types}
              category="Actor"
              value={ownerId ? [ownerId] : []}
              onChange={(ids) => setOwnerId(ids[0] ?? '')}
              clearable
              placeholder="Who is accountable?"
              excludeIds={backupOwnerId ? [backupOwnerId] : []}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Backup owner</Label>
            <ElementPicker
              elements={elements}
              types={types}
              category="Actor"
              value={backupOwnerId ? [backupOwnerId] : []}
              onChange={(ids) => setBackupOwnerId(ids[0] ?? '')}
              clearable
              placeholder="Who covers when the owner is away?"
              excludeIds={ownerId ? [ownerId] : []}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button size="sm" onClick={handleCreate} disabled={saving}>
            {saving ? 'Creating…' : 'Create'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
