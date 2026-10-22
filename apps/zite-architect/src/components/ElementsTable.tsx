import { useMemo, useState } from 'react';
import { Boxes, Search, X, SlidersHorizontal, Check, Rows3 } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@project/components/ui/popover';
import { categoryStyle } from '@/lib/categories';
import { Button } from '@project/components/ui/button';
import { Input } from '@project/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@project/components/ui/select';
import { useColumnConfig, type ColumnOverride } from '@/hooks/useColumnConfig';
import type { ElementSummary, ElementType } from '@/types';
import {
  ACCOUNTABLE_FOR_LABEL,
  ACCOUNTABLE_LABEL,
  PARTY_VALUES,
  STATUS_VALUES,
  partyToken,
  statusToken,
} from '@/lib/elementTokens';
import { TYPE_KEYS } from '@/lib/typeKeys';
import DataTable from './DataTable';
import ElementIcon from './ElementIcon';
import { TokenBadge } from './TokenBadge';

const ANY = '__any__';

type SortDir = 'asc' | 'desc' | null;

const SORT_OPTIONS: { value: string; label: string; key: string; dir: 'asc' | 'desc' }[] = [
  { value: 'name:asc', label: 'Name A to Z', key: 'name', dir: 'asc' },
  { value: 'name:desc', label: 'Name Z to A', key: 'name', dir: 'desc' },
  { value: 'usageCount:desc', label: 'Most used', key: 'usageCount', dir: 'desc' },
  { value: 'usageCount:asc', label: 'Least used', key: 'usageCount', dir: 'asc' },
];

interface Props {
  elements: ElementSummary[];
  types: ElementType[];
  onOpen: (id: string) => void;
  /** Leave out for read-only viewers: no Edit or Delete in the row menu. */
  onEdit?: (element: ElementSummary) => void;
  onDelete?: (element: ElementSummary) => void;
}

/** A tool's category, or a plain label for the ones without: "Uncategorized" for a tool, "Not a tool" for people, roles and documents. */
const categoryOf = (e: ElementSummary) => e.category || (e.typeKey === 'app' ? 'Uncategorized' : 'Not a tool');

export default function ElementsTable({
  elements,
  types,
  onOpen,
  onEdit,
  onDelete,
}: Props) {
  const [query, setQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>(ANY);
  const [partyFilter, setPartyFilter] = useState<string>(ANY);
  const [statusFilter, setStatusFilter] = useState<string>(ANY);
  const [usageFilter, setUsageFilter] = useState<string>(ANY);
  // How the list is grouped: by what it is, what kind of tool it is, who owns it, or not at all.
  const [groupBy, setGroupBy] = useState<'type' | 'category' | 'owner' | 'none'>('type');
  const [categoryFilter, setCategoryFilter] = useState<string>(ANY);
  // Alphabetical by default; clicking a column header or using the Sort menu changes it.
  const [sort, setSort] = useState<{ key: string | null; dir: SortDir }>({ key: 'name', dir: 'asc' });
  const sortValue = sort.key && sort.dir ? `${sort.key}:${sort.dir}` : '';
  const sortKnown = SORT_OPTIONS.some((o) => o.value === sortValue);

  // Processes are elements, but they have their own screen.
  const pool = useMemo(
    () => elements.filter((e) => e.typeKey !== TYPE_KEYS.process),
    [elements],
  );

  const selectableTypes = useMemo(
    () =>
      types
        .filter((t) => t.key !== TYPE_KEYS.process && pool.some((e) => e.typeId === t.id))
        .sort((a, b) => a.sortOrder - b.sortOrder),
    [types, pool],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return pool.filter((e) => {
      if (q && !e.name.toLowerCase().includes(q) && !e.description.toLowerCase().includes(q)) {
        return false;
      }
      if (typeFilter !== ANY && e.typeName !== typeFilter) return false;
      if (categoryFilter !== ANY && categoryOf(e) !== categoryFilter) return false;
      if (partyFilter !== ANY && (e.party || '—') !== partyFilter) return false;
      if (statusFilter !== ANY && (e.status || '—') !== statusFilter) return false;
      if (usageFilter === 'used' && e.usageCount === 0) return false;
      if (usageFilter === 'unused' && e.usageCount > 0) return false;
      return true;
    });
  }, [pool, query, typeFilter, categoryFilter, partyFilter, statusFilter, usageFilter]);

  const overrides = useMemo<Record<string, ColumnOverride>>(
    () => ({
      name: {
        render: (_value, record) => (
          <span className="flex items-center gap-2 min-w-0">
            <ElementIcon
              name={String(record.name ?? '')}
              image={String(record.image ?? '')}
              icon={String(record.icon ?? '')}
              typeIcon={String(record.typeIcon ?? '')}
              color={String(record.typeColor ?? '')}
              size={16}
            />
            <span className="truncate font-medium">{String(record.name ?? '')}</span>
          </span>
        ),
      },
      usageCount: {
        render: (value) => {
          const n = Number(value ?? 0);
          return n === 0 ? (
            <span className="text-muted-foreground">Unused</span>
          ) : (
            <span>{n}</span>
          );
        },
      },
      category: {
        render: (value) =>
          value ? (
            <span
              className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium"
              style={{ backgroundColor: categoryStyle(String(value)).bg, color: categoryStyle(String(value)).fg }}
            >
              <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: categoryStyle(String(value)).dot }} />
              {String(value)}
            </span>
          ) : (
            <span className="text-muted-foreground">—</span>
          ),
      },
      // The list mixes people and things, so neither "Owner" nor "Reports to"
      // fits — this word works whichever way a row's relationship reads.
      ownerName: { label: ACCOUNTABLE_LABEL },
      ownsCount: {
        label: ACCOUNTABLE_FOR_LABEL,
        render: (value) => {
          const n = Number(value ?? 0);
          return n === 0 ? <span className="text-muted-foreground">—</span> : <span>{n}</span>;
        },
      },
      party: {
        render: (value) => <TokenBadge token={partyToken(value ? String(value) : null)} />,
      },
      status: {
        render: (value) => <TokenBadge token={statusToken(value ? String(value) : null)} />,
      },
    }),
    [],
  );

  const {
    columns,
    visibleColumns,
    toggleColumn,
    reorderColumns,
    resetToDefault,
  } = useColumnConfig({
    tableName: 'Elements',
    defaultVisible: ['name', 'typeName', 'category', 'party', 'ownerName', 'usageCount'],
    overrides,
  });

  // groupRecords truncates a label to 8 chars unless it can resolve it through
  // linkedNames, so hand it an identity map of type names.
  const linkedNames = useMemo(
    () =>
      new Map([
        ['ElementTypes', new Map(types.map((t) => [t.name, t.name] as const))],
        ['Category', new Map([...new Set(pool.map((e) => categoryOf(e)))].map((c) => [c, c] as const))],
        ['Owner', new Map([...new Set(pool.map((e) => e.ownerName || 'No owner'))].map((o) => [o, o] as const))],
      ]),
    [types, pool],
  );

  // Records carry a group label for each way of grouping, so an empty one still gets a tidy heading.
  const rows = useMemo(
    () => filtered.map((e) => ({ ...e, categoryGroup: categoryOf(e), ownerGroup: e.ownerName || 'No owner' })),
    [filtered],
  );

  // The column that a grouping already says is left out of the table.
  const shownColumns = useMemo(
    () =>
      visibleColumns.filter(
        (c) => !(groupBy === 'category' && c.key === 'category') && !(groupBy === 'owner' && c.key === 'ownerName'),
      ),
    [visibleColumns, groupBy],
  );

  // Category chips: one tap to see just Communication, or just Finance. Only categories in use show.
  const categoryCounts = useMemo(() => {
    const counts = new Map<string, number>();
    // Only tools are sorted into categories, so people, roles and documents don't get a chip.
    for (const e of pool) {
      if (e.typeKey !== 'app' && !e.category) continue;
      counts.set(categoryOf(e), (counts.get(categoryOf(e)) ?? 0) + 1);
    }
    return [...counts.entries()].sort(
      (a, b) => (a[0] === 'Uncategorized' ? 1 : 0) - (b[0] === 'Uncategorized' ? 1 : 0) || b[1] - a[1] || a[0].localeCompare(b[0]),
    );
  }, [pool]);
  const hasCategories = categoryCounts.some(([name]) => name !== 'Uncategorized');

  const activeFilters =
    (typeFilter !== ANY ? 1 : 0) +
    (categoryFilter !== ANY ? 1 : 0) +
    (partyFilter !== ANY ? 1 : 0) +
    (statusFilter !== ANY ? 1 : 0) +
    (usageFilter !== ANY ? 1 : 0) +
    (query.trim() ? 1 : 0);

  const clearAll = () => {
    setQuery('');
    setTypeFilter(ANY);
    setCategoryFilter(ANY);
    setPartyFilter(ANY);
    setStatusFilter(ANY);
    setUsageFilter(ANY);
  };

  // The toolbar is just three things: search, Filter, View. Everything else lives inside them.
  const usageLabel = usageFilter === 'used' ? 'In a process' : usageFilter === 'unused' ? 'Unused' : '';
  const activeChips: { key: string; label: string; clear: () => void }[] = [
    partyFilter !== ANY && { key: 'party', label: `Party: ${partyFilter}`, clear: () => setPartyFilter(ANY) },
    statusFilter !== ANY && { key: 'status', label: `Status: ${statusFilter}`, clear: () => setStatusFilter(ANY) },
    usageFilter !== ANY && { key: 'usage', label: usageLabel, clear: () => setUsageFilter(ANY) },
  ].filter(Boolean) as { key: string; label: string; clear: () => void }[];
  const moreCount = (partyFilter !== ANY ? 1 : 0) + (statusFilter !== ANY ? 1 : 0) + (usageFilter !== ANY ? 1 : 0);

  const toolbar = (
    <>
      <div className="relative w-full sm:w-64">
        <Search className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search elements…"
          className="h-8 pl-8 w-full text-xs"
        />
      </div>

      {hasCategories && (
        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger className="h-8 w-[210px] text-xs" aria-label="Kind of tool">
            <SelectValue placeholder="Kind of tool" />
          </SelectTrigger>
          <SelectContent className="max-h-72">
            <SelectItem value={ANY} className="text-xs">
              All kinds of tool
            </SelectItem>
            {categoryCounts.map(([name, count]) => {
              const style = categoryStyle(name);
              return (
                <SelectItem key={name} value={name} className="text-xs">
                  <span className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full" style={{ backgroundColor: style.dot }} />
                    {name}
                    <span className="text-muted-foreground">{count}</span>
                  </span>
                </SelectItem>
              );
            })}
          </SelectContent>
        </Select>
      )}

      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm" className="h-8 text-xs">
            <SlidersHorizontal className="mr-1.5 h-3.5 w-3.5" /> More filters
            {moreCount > 0 && (
              <span className="ml-1.5 rounded-full bg-primary px-1.5 text-[10px] font-semibold text-primary-foreground">
                {moreCount}
              </span>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-64 space-y-3 p-4">
          <LabeledSelect label="Party" value={partyFilter} onChange={setPartyFilter} options={PARTY_VALUES.map((v) => [v, v])} anyLabel="Internal or external" />
          <LabeledSelect label="Status" value={statusFilter} onChange={setStatusFilter} options={STATUS_VALUES.map((v) => [v, v])} anyLabel="Any status" />
          <LabeledSelect
            label="Use"
            value={usageFilter}
            onChange={setUsageFilter}
            options={[['used', 'In a process'], ['unused', 'Not used yet']]}
            anyLabel="Used or not"
          />
          {moreCount > 0 && (
            <div className="flex justify-end border-t border-border pt-3">
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs"
                onClick={() => {
                  setPartyFilter(ANY);
                  setStatusFilter(ANY);
                  setUsageFilter(ANY);
                }}
              >
                Clear
              </Button>
            </div>
          )}
        </PopoverContent>
      </Popover>

      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm" className="h-8 text-xs">
            <Rows3 className="mr-1.5 h-3.5 w-3.5" /> View
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-64 space-y-4 p-4">
          <div>
            <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Group by</p>
            <div className="space-y-0.5">
              {(
                [
                  ['type', 'What it is'],
                  ['category', 'Kind of tool'],
                  ['owner', 'Owner'],
                  ['none', 'Don’t group'],
                ] as const
              ).map(([key, label]) => (
                <MenuRow key={key} active={groupBy === key} onClick={() => setGroupBy(key)}>
                  {label}
                </MenuRow>
              ))}
            </div>
          </div>
          <div>
            <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Sort by</p>
            <div className="space-y-0.5">
              {SORT_OPTIONS.map((o) => (
                <MenuRow
                  key={o.value}
                  active={sort.key === o.key && sort.dir === o.dir}
                  onClick={() => setSort({ key: o.key, dir: o.dir })}
                >
                  {o.label}
                </MenuRow>
              ))}
            </div>
          </div>
        </PopoverContent>
      </Popover>

      <span className="ml-1 text-xs text-muted-foreground whitespace-nowrap">
        {filtered.length === pool.length ? `${pool.length} elements` : `${filtered.length} of ${pool.length}`}
      </span>
    </>
  );

  return (
    <div>
      <div className="mb-4 flex flex-wrap gap-1.5">
        {[{ name: ANY, label: 'All', count: pool.length }, ...selectableTypes.map((t) => ({
          name: t.name,
          label: t.name === 'Role' ? 'Roles' : t.name === 'Person' ? 'People' : t.name === 'App' ? 'Apps' : t.name === 'Document' ? 'Documents' : t.name === 'Location' ? 'Locations' : t.name,
          count: pool.filter((e) => e.typeId === t.id).length,
        }))].map((tab) => (
          <button
            key={tab.name}
            type="button"
            onClick={() => {
              setTypeFilter(tab.name);
              // Kinds of tool only make sense for apps.
              if (tab.name !== ANY && tab.name !== 'App') setCategoryFilter(ANY);
            }}
            aria-pressed={typeFilter === tab.name}
            className={`inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors ${
              typeFilter === tab.name
                ? 'border-primary bg-primary text-primary-foreground'
                : 'border-border bg-card text-foreground hover:bg-muted'
            }`}
          >
            {tab.label}
            <span className={`text-xs tabular-nums ${typeFilter === tab.name ? 'opacity-80' : 'text-muted-foreground'}`}>{tab.count}</span>
          </button>
        ))}
      </div>
      {activeChips.length > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-1.5">
          {activeChips.map((c) => (
            <span
              key={c.key}
              className="inline-flex items-center gap-1 rounded-full border border-border bg-card py-0.5 pl-2.5 pr-1 text-xs font-medium"
            >
              {c.label}
              <button
                type="button"
                onClick={c.clear}
                className="flex h-5 w-5 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                aria-label={`Remove filter ${c.label}`}
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
          <button type="button" onClick={clearAll} className="px-1 text-xs text-muted-foreground hover:text-foreground">
            Clear all
          </button>
        </div>
      )}
      <DataTable
        toolbar={toolbar}
        columns={columns}
        visibleColumns={shownColumns}
        sort={sort}
        onSortChange={(key, dir) => setSort({ key, dir })}
        records={rows as unknown as Record<string, unknown>[]}
        onRowClick={(record) => onOpen(String(record.id))}
        onEdit={onEdit ? (record) => onEdit(record as unknown as ElementSummary) : undefined}
        onDelete={onDelete ? (record) => onDelete(record as unknown as ElementSummary) : undefined}
        overrides={overrides}
        linkedNames={linkedNames}
        onToggleColumn={toggleColumn}
        onReorderColumns={reorderColumns}
        onResetColumns={resetToDefault}
        emptyIcon={<Boxes className="h-6 w-6" />}
        emptyLabel={
          activeFilters > 0
            ? 'No elements match those filters'
            : 'No elements yet — add your team, roles and apps to get started'
        }
        groupBy={
          groupBy === 'type'
            ? { key: 'typeName', linkedTable: 'ElementTypes' }
            : groupBy === 'category'
            ? { key: 'categoryGroup', linkedTable: 'Category' }
            : groupBy === 'owner'
            ? { key: 'ownerGroup', linkedTable: 'Owner' }
            : undefined
        }
        groupStorageKey={`elements-by-${groupBy}`}
      />
    </div>
  );
}

function LabeledSelect({ label, value, onChange, options, anyLabel }: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: (readonly [string, string])[];
  anyLabel: string;
}) {
  return (
    <div>
      <p className="mb-1 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{label}</p>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="h-8 text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ANY} className="text-xs">{anyLabel}</SelectItem>
          {options.map(([v, l]) => (
            <SelectItem key={v} value={v} className="text-xs">{l}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function MenuRow({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:bg-muted"
    >
      <Check className={`h-4 w-4 text-primary ${active ? '' : 'opacity-0'}`} />
      {children}
    </button>
  );
}
