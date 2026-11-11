import { useMemo, useState } from 'react';
import { Check, ChevronsUpDown, Plus, X } from 'lucide-react';
import { Button } from '@project/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@project/components/ui/popover';
import {
  Command,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@project/components/ui/command';
import type { ElementSummary, ElementType } from '@/types';
import ElementIcon from './ElementIcon';

export type ElementCategory = 'Actor' | 'Resource' | 'Output' | 'Place';

/**
 * The one way to choose elements anywhere in the app: typeahead search, icons,
 * and grouping by type so every app sits together and every person sits
 * together. Use this instead of a plain Select whenever the options are
 * elements — a flat alphabetical list stops being usable at about twenty.
 */
interface Props {
  elements: ElementSummary[];
  types: ElementType[];
  /** Only types carrying this category can fill the slot. Omit to offer every element. */
  category?: ElementCategory;
  /**
   * Restrict to these type keys instead, for slots a category can't express —
   * a sub-process points at a process, and processes carry no category.
   */
  typeKeys?: string[];
  multiple?: boolean;
  value: string[];
  onChange: (ids: string[]) => void;
  /** Elements already used nearby — floated to the top of their group. */
  recentIds?: string[];
  /** Never offer these — e.g. an element cannot be its own owner. */
  excludeIds?: string[];
  onCreate?: (name: string, typeId: string) => Promise<string | null>;
  placeholder?: string;
  /** Single-select only: show an X to empty the field again. */
  clearable?: boolean;
  disabled?: boolean;
}

export default function ElementPicker({
  elements,
  types,
  category,
  typeKeys,
  multiple = false,
  value,
  onChange,
  recentIds = [],
  excludeIds = [],
  onCreate,
  placeholder = 'Select…',
  clearable = false,
  disabled = false,
}: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [creating, setCreating] = useState(false);

  // A type belongs to a slot only if it declares the matching category.
  // Types with no categories at all (Process) never appear in any picker.
  const allowedTypeIds = useMemo(
    () =>
      new Set(
        types
          .filter((t) =>
            typeKeys
              ? typeKeys.includes(t.key)
              : category
              ? t.categories.includes(category)
              : t.categories.length > 0,
          )
          .map((t) => t.id),
      ),
    [types, category, typeKeys],
  );

  const typeById = useMemo(() => new Map(types.map((t) => [t.id, t])), [types]);

  const excludeSet = useMemo(() => new Set(excludeIds), [excludeIds]);

  const candidates = useMemo(
    () =>
      elements.filter(
        (e) => e.typeId && allowedTypeIds.has(e.typeId) && !excludeSet.has(e.id),
      ),
    [elements, allowedTypeIds, excludeSet],
  );

  const recentSet = useMemo(() => new Set(recentIds), [recentIds]);

  const q = query.trim().toLowerCase();

  // Grouped by type, groups in the taxonomy's own order — so the list reads the
  // same way every time regardless of what happens to match.
  const groups = useMemo(() => {
    const byType = new Map<string, ElementSummary[]>();
    for (const e of candidates) {
      if (q && !e.name.toLowerCase().includes(q) && !e.typeName.toLowerCase().includes(q)) {
        continue;
      }
      const key = e.typeId ?? '__untyped__';
      const list = byType.get(key);
      if (list) list.push(e);
      else byType.set(key, [e]);
    }

    return [...byType.entries()]
      .map(([typeId, items]) => {
        const type = typeById.get(typeId);
        return {
          typeId,
          label: type?.name ?? 'Untyped',
          sortOrder: type?.sortOrder ?? 999,
          items: items.sort((a, b) => {
            // Whatever is already in play nearby comes first, then A–Z.
            const ar = recentSet.has(a.id) ? 0 : 1;
            const br = recentSet.has(b.id) ? 0 : 1;
            return ar - br || a.name.localeCompare(b.name);
          }),
        };
      })
      .sort((a, b) => a.sortOrder - b.sortOrder || a.label.localeCompare(b.label));
  }, [candidates, q, recentSet, typeById]);

  const matchCount = useMemo(
    () => groups.reduce((n, g) => n + g.items.length, 0),
    [groups],
  );

  const selected = useMemo(
    () =>
      value
        .map((id) => elements.find((c) => c.id === id))
        .filter(Boolean) as ElementSummary[],
    [value, elements],
  );

  const toggle = (id: string) => {
    if (multiple) {
      onChange(value.includes(id) ? value.filter((v) => v !== id) : [...value, id]);
    } else {
      onChange(value.includes(id) ? [] : [id]);
      setOpen(false);
    }
  };

  const defaultCreateType = useMemo(() => {
    const allowed = types
      .filter((t) => allowedTypeIds.has(t.id))
      .sort((a, b) => a.sortOrder - b.sortOrder);
    return allowed[0];
  }, [types, allowedTypeIds]);

  const handleCreate = async () => {
    const name = query.trim();
    if (!name || !onCreate || !defaultCreateType || creating) return;
    setCreating(true);
    try {
      const id = await onCreate(name, defaultCreateType.id);
      if (id) {
        onChange(multiple ? [...value, id] : [id]);
        setQuery('');
        if (!multiple) setOpen(false);
      }
    } finally {
      setCreating(false);
    }
  };

  const exactExists = candidates.some((c) => c.name.toLowerCase() === q);
  const canCreate = Boolean(onCreate && q && !exactExists && defaultCreateType);
  const slotLabel = category ? category.toLowerCase() : 'matching';

  return (
    <div className="space-y-1.5">
      <Popover
        // The popover renders in a portal, outside the scroll lock a dialog
        // puts on the page — without modal, the wheel is swallowed in there and
        // the only way to scroll this list is dragging the scrollbar.
        modal
        open={open}
        onOpenChange={(o) => {
          setOpen(o);
          if (!o) setQuery('');
        }}
      >
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            disabled={disabled}
            className="w-full justify-between font-normal h-9"
          >
            <span className="truncate text-xs flex items-center gap-2 min-w-0">
              {selected.length === 0 ? (
                <span className="text-muted-foreground">{placeholder}</span>
              ) : multiple ? (
                `${selected.length} selected`
              ) : (
                <>
                  <ElementIcon
                    name={selected[0].name}
                    image={selected[0].image}
                    icon={selected[0].icon}
                    typeIcon={selected[0].typeIcon}
                    color={selected[0].typeColor}
                    size={14}
                  />
                  <span className="truncate">{selected[0].name}</span>
                </>
              )}
            </span>
            {clearable && !multiple && selected.length > 0 ? (
              <span
                role="button"
                tabIndex={-1}
                aria-label="Clear selection"
                className="shrink-0 rounded p-0.5 opacity-50 hover:opacity-100"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onChange([]);
                }}
              >
                <X className="h-3.5 w-3.5" />
              </span>
            ) : (
              <ChevronsUpDown className="h-3.5 w-3.5 opacity-50 shrink-0" />
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[320px] p-0" align="start">
          <Command shouldFilter={false}>
            <CommandInput
              placeholder="Search…"
              value={query}
              onValueChange={setQuery}
            />
            <CommandList className="max-h-64">
              {matchCount === 0 && (
                <div className="px-3 py-6 text-center text-xs text-muted-foreground">
                  {candidates.length === 0
                    ? `No ${slotLabel} elements yet.`
                    : `Nothing matches “${query.trim()}”.`}
                  {canCreate && <span className="block mt-1">Create it below.</span>}
                </div>
              )}

              {groups.map((group) => (
                <CommandGroup key={group.typeId} heading={group.label}>
                  {group.items.map((el) => (
                    <CommandItem
                      key={el.id}
                      value={el.id}
                      onSelect={() => toggle(el.id)}
                      className="text-xs"
                    >
                      <Check
                        className={`mr-2 h-3.5 w-3.5 shrink-0 ${
                          value.includes(el.id) ? 'opacity-100' : 'opacity-0'
                        }`}
                      />
                      <ElementIcon
                        name={el.name}
                        image={el.image}
                        icon={el.icon}
                        typeIcon={el.typeIcon}
                        color={el.typeColor}
                        size={14}
                        className="mr-2 shrink-0"
                      />
                      <span className="truncate">{el.name}</span>
                      {el.party === 'External' && (
                        <span className="ml-auto pl-2 text-[10px] text-amber-600 dark:text-amber-400 shrink-0">
                          external
                        </span>
                      )}
                    </CommandItem>
                  ))}
                </CommandGroup>
              ))}

              {canCreate && (
                <CommandGroup>
                  <CommandItem onSelect={handleCreate} className="text-xs">
                    <Plus className="mr-2 h-3.5 w-3.5" />
                    {creating
                      ? 'Creating…'
                      : `Create “${query.trim()}” as ${defaultCreateType!.name}`}
                  </CommandItem>
                </CommandGroup>
              )}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      {multiple && selected.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {selected.map((el) => (
            <span
              key={el.id}
              className="inline-flex items-center gap-1 text-[11px] px-1.5 py-0.5 rounded border border-border"
              style={el.typeColor ? { backgroundColor: `${el.typeColor}1F` } : undefined}
            >
              <ElementIcon
                name={el.name}
                image={el.image}
                icon={el.icon}
                typeIcon={el.typeIcon}
                color={el.typeColor}
                size={12}
              />
              {el.name}
              <button
                type="button"
                onClick={() => onChange(value.filter((v) => v !== el.id))}
                className="opacity-60 hover:opacity-100"
                aria-label={`Remove ${el.name}`}
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
