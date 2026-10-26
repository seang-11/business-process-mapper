import { CATEGORY_NAMES, categoryStyle } from '@/lib/categories';
import { useMemo, useState } from 'react';
import { saveElement, SaveElementInputType } from 'zitejs/api';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@project/components/ui/select';
import type { ElementSummary, ElementType } from '@/types';
import {
  PARTY_VALUES,
  STATUS_VALUES,
  ownerLabel,
  ownerPlaceholder,
  partyToken,
  statusToken,
} from '@/lib/elementTokens';
import { TYPE_KEYS } from '@/lib/typeKeys';
import { similarNames } from '@/lib/similarNames';
import ElementIcon from './ElementIcon';
import ElementPicker from './ElementPicker';
import IconPicker from './IconPicker';
import { TokenDot } from './TokenBadge';

const NONE = '__none__';

/** The fields this dialog edits — anything holding these can be passed straight in. */
export interface EditableElement {
  id: string;
  name: string;
  description: string;
  icon: string;
  image: string;
  typeId: string | null;
  party: string;
  status: string;
  /** Optional: what kind of tool this is. */
  category?: string;
  ownerId: string | null;
}

interface Props {
  types: ElementType[];
  elements: ElementSummary[];
  /** Omit to create. Pass an element to edit it. */
  element?: EditableElement | null;
  onClose: () => void;
  onSaved: (id: string) => void;
  /** When creating: the type to start on, such as Role from the Roles page. */
  defaultTypeId?: string;
  /** What to call it in the title, such as "role". Defaults to "element". */
  noun?: string;
  /** Switch to editing one that already exists, from the duplicate warning. */
  onPickExisting?: (el: ElementSummary) => void;
}

export default function ElementDialog({
  types,
  elements,
  element = null,
  onClose,
  onSaved,
  defaultTypeId,
  noun = 'element',
  onPickExisting,
}: Props) {
  const editing = Boolean(element);

  // Processes are elements too, but they are created from the Processes tab so
  // that a current-state version comes with them. An element already typed as
  // one still shows its own type, so editing it can never silently retype it.
  const selectableTypes = useMemo(() => {
    const list = types.filter(
      (t) => t.key !== TYPE_KEYS.process || t.id === element?.typeId,
    );
    return list.sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
  }, [types, element?.typeId]);

  const [name, setName] = useState(element?.name ?? '');
  const [description, setDescription] = useState(element?.description ?? '');
  const [icon, setIcon] = useState(element?.icon ?? '');
  const [image, setImage] = useState(element?.image ?? '');
  const [typeId, setTypeId] = useState<string>(element?.typeId ?? defaultTypeId ?? '');
  const [party, setParty] = useState<string>(element?.party || NONE);
  const [status, setStatus] = useState(element?.status || 'Active');
  const [category, setCategory] = useState<string>(element?.category || NONE);
  const [ownerId, setOwnerId] = useState<string | null>(element?.ownerId ?? null);
  const [saving, setSaving] = useState(false);

  const selectedType = selectableTypes.find((t) => t.id === typeId);

  // Before adding one, look for one that's already there: the same name, an
  // abbreviation of it, or a close match. People, apps and things only check
  // against their own kind.
  const similar = useMemo(() => {
    if (editing) return [];
    const pool = elements.filter(
      (e) => !selectedType || !selectedType.actorClass || e.actorClass === selectedType.actorClass,
    );
    return similarNames(name, pool);
  }, [editing, elements, name, selectedType]);
  const exact = similar.find((s) => s.how === 'same')?.item ?? null;

  const handleSave = async () => {
    if (!name.trim()) {
      toast.error(`Give the ${noun} a name.`);
      return;
    }
    if (exact) {
      toast.error(`${exact.name} is already in the list. Use that one, or pick a different name.`);
      return;
    }
    if (!typeId) {
      toast.error('Pick a type — it decides which slots this element can fill.');
      return;
    }

    const next = {
      name: name.trim(),
      description,
      icon,
      image,
      typeId,
      party: party === NONE ? null : party,
      status,
      category: category === NONE ? null : category,
      ownerId,
    };

    setSaving(true);
    try {
      let payload: SaveElementInputType = next;

      if (element) {
        // Send only what actually changed. The endpoint patches, so untouched
        // fields — icon, image, the effective dates — are left alone.
        const changed: SaveElementInputType = { id: element.id };
        if (next.name !== element.name) changed.name = next.name;
        if (next.description !== element.description) changed.description = next.description;
        if (next.icon !== element.icon) changed.icon = next.icon;
        if (next.image !== element.image) changed.image = next.image;
        if (next.typeId !== element.typeId) changed.typeId = next.typeId;
        if (next.party !== (element.party || null)) changed.party = next.party;
        if (next.status !== element.status) changed.status = next.status;
        if (next.category !== (element.category || null)) changed.category = next.category;
        if (next.ownerId !== element.ownerId) changed.ownerId = next.ownerId;

        if (Object.keys(changed).length === 1) {
          onClose();
          return;
        }
        payload = changed;
      }

      const { id } = await saveElement(payload);
      toast.success(editing ? 'Saved' : `Created ${next.name}`);
      onSaved(id);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not save the element.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-base">
            {editing ? `Edit ${noun}` : `New ${noun}`}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label className="text-xs">Name</Label>
            <div className="flex items-center gap-2">
              <IconPicker
                value={icon}
                onChange={setIcon}
                image={image}
                onImageChange={setImage}
                name={name}
                typeIcon={selectedType?.icon}
                color={selectedType?.color}
              />
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Account manager"
                autoFocus
                className="flex-1"
              />
            </div>
            {similar.length > 0 && (
              <div
                className={`rounded-lg border px-2.5 py-2 text-xs ${
                  exact ? 'border-amber-300 bg-amber-50 text-amber-900' : 'border-border bg-muted/50 text-muted-foreground'
                }`}
              >
                <p className="font-medium">
                  {exact ? `${exact.name} is already in the list.` : `Already in the list. Is it one of these?`}
                </p>
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {similar.map(({ item }) => (
                    <button
                      key={item.id}
                      type="button"
                      disabled={!onPickExisting}
                      onClick={() => onPickExisting?.(item)}
                      title={item.description || item.name}
                      className="rounded-full border border-border bg-background px-2 py-0.5 text-[11px] font-medium text-foreground enabled:hover:border-primary/40 enabled:hover:bg-primary/5"
                    >
                      {item.name}
                      {item.typeName ? <span className="text-muted-foreground"> · {item.typeName}</span> : null}
                    </button>
                  ))}
                </div>
                {onPickExisting && <p className="mt-1.5 text-[11px] opacity-80">Click one to open it instead.</p>}
              </div>
            )}
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Type</Label>
            <Select value={typeId} onValueChange={setTypeId}>
              <SelectTrigger className="h-9">
                <SelectValue placeholder="What kind of thing is this?" />
              </SelectTrigger>
              <SelectContent>
                {selectableTypes.map((t) => (
                  <SelectItem key={t.id} value={t.id} className="text-xs">
                    <span className="flex items-center gap-2">
                      <ElementIcon name={t.name} typeIcon={t.icon} color={t.color} size={14} />
                      {t.name}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Description</Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What it is, and where it fits."
              rows={2}
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Category</Label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger className="h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE} className="text-xs">
                  <span className="text-muted-foreground">Not set</span>
                </SelectItem>
                {CATEGORY_NAMES.map((c) => (
                  <SelectItem key={c} value={c} className="text-xs">
                    <span className="flex items-center gap-2">
                      <span className="h-2 w-2 rounded-full" style={{ backgroundColor: categoryStyle(c).dot }} />
                      {c}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-[11px] text-muted-foreground">Groups tools together, like Communication or Finance.</p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Party</Label>
              <Select value={party} onValueChange={setParty}>
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE} className="text-xs">
                    <span className="text-muted-foreground">Not set</span>
                  </SelectItem>
                  {PARTY_VALUES.map((v) => (
                    <SelectItem key={v} value={v} className="text-xs">
                      <span className="flex items-center gap-2">
                        <TokenDot token={partyToken(v)} />
                        {v}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Status</Label>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATUS_VALUES.map((v) => (
                    <SelectItem key={v} value={v} className="text-xs">
                      <span className="flex items-center gap-2">
                        <TokenDot token={statusToken(v)} />
                        {v}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">{ownerLabel(selectedType?.actorClass)}</Label>
            <ElementPicker
              elements={elements}
              types={types}
              category="Actor"
              value={ownerId ? [ownerId] : []}
              onChange={(ids) => setOwnerId(ids[0] ?? null)}
              excludeIds={element ? [element.id] : []}
              clearable
              placeholder={ownerPlaceholder(selectedType?.actorClass)}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button size="sm" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving…' : editing ? 'Save' : 'Create'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
