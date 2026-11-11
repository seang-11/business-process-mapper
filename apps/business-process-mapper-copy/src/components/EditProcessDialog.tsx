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
import IconPicker from './IconPicker';
import { processIconName } from '@/lib/processIcon';

interface ProcessInfo {
  id: string;
  name: string;
  ownerId: string | null;
  backupOwnerId?: string | null;
  department?: string;
  runsPerMonth?: number | null;
  icon?: string;
  image?: string;
}

interface Props {
  process: ProcessInfo;
  elements: ElementSummary[];
  types: ElementType[];
  /** Departments already in use, offered as suggestions. */
  departments?: string[];
  onClose: () => void;
  onSaved: () => void;
}

export default function EditProcessDialog({
  process,
  elements,
  types,
  departments = [],
  onClose,
  onSaved,
}: Props) {
  const [name, setName] = useState(process.name);
  const [ownerId, setOwnerId] = useState<string | null>(process.ownerId);
  const [backupOwnerId, setBackupOwnerId] = useState<string | null>(process.backupOwnerId ?? null);
  const [department, setDepartment] = useState(process.department ?? '');
  const [runs, setRuns] = useState(process.runsPerMonth ? String(process.runsPerMonth) : '');
  const [icon, setIcon] = useState(process.icon ?? '');
  const [image, setImage] = useState(process.image ?? '');
  const runsValue = runs.trim() && Number(runs) > 0 ? Math.round(Number(runs)) : null;
  const [saving, setSaving] = useState(false);

  const dirty =
    name.trim() !== process.name ||
    ownerId !== process.ownerId ||
    backupOwnerId !== (process.backupOwnerId ?? null) ||
    department.trim() !== (process.department ?? '') ||
    runsValue !== (process.runsPerMonth ?? null) ||
    icon !== (process.icon ?? '') ||
    image !== (process.image ?? '');

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
      if (department.trim() !== (process.department ?? '')) (patch as any).department = department.trim();
      if (runsValue !== (process.runsPerMonth ?? null)) (patch as any).runsPerMonth = runsValue;
      if (icon !== (process.icon ?? '')) (patch as any).icon = icon;
      if (image !== (process.image ?? '')) (patch as any).image = image;
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
            <Label className="text-xs">Name and icon</Label>
            <div className="flex items-center gap-2">
              {/* The icon shown on training and process cards. Empty means one that fits the name. */}
              <IconPicker
                value={icon}
                onChange={setIcon}
                image={image}
                onImageChange={setImage}
                name={name}
                typeIcon={icon ? undefined : processIconName(name)}
              />
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Process name"
                autoFocus
                className="flex-1"
              />
            </div>
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
          <div className="space-y-1.5">
            <Label className="text-xs">Department</Label>
            <Input
              value={department}
              onChange={(e) => setDepartment(e.target.value)}
              list="process-departments"
              placeholder="Sales, Delivery, Finance…"
            />
            <datalist id="process-departments">
              {departments.map((d) => (
                <option key={d} value={d} />
              ))}
            </datalist>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Runs per month</Label>
            <Input
              type="number"
              min={0}
              value={runs}
              onChange={(e) => setRuns(e.target.value)}
              placeholder="20"
              className="w-32"
            />
            <p className="text-[11px] text-muted-foreground">How many times this process happens in a month. A rough guess is fine. Used to show people hours.</p>
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
