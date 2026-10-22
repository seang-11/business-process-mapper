import { useMemo, useState } from 'react';
import { Boxes, Search, X, ArrowDownAZ } from 'lucide-react';
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
import { TokenBadge, TokenDot } from './TokenBadge';

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

  // One wrapping row shared with the column picker: on a phone the search takes
  // the full width and the four filters fall into pairs; the count and the
  // grouping toggle stay together and the picker stays pinned right.
  const toolbar = (
    <>
      <div className="relative w-full sm:w-52">
        <Search className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search elements…"
          className="h-8 pl-8 w-full text-xs"
        />
      </div>

      <div className="grid grid-cols-2 gap-2 w-full sm:flex sm:w-auto sm:flex-wrap">
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="h-8 w-full sm:w-[140px] text-xs">
            <SelectValue placeholder="Type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ANY} className="text-xs">All types</SelectItem>
            {selectableTypes.map((t) => (
              <SelectItem key={t.id} value={t.name} className="text-xs">
                {t.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={partyFilter} onValueChange={setPartyFilter}>
          <SelectTrigger className="h-8 w-full sm:w-[128px] text-xs">
            <SelectValue placeholder="Party" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ANY} className="text-xs">Any party</SelectItem>
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

        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="h-8 w-full sm:w-[128px] text-xs">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ANY} className="text-xs">Any status</SelectItem>
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

        <Select value={usageFilter} onValueChange={setUsageFilter}>
          <SelectTrigger className="h-8 w-full sm:w-[136px] text-xs">
            <SelectValue placeholder="Usage" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ANY} className="text-xs">Used or not</SelectItem>
            <SelectItem value="used" className="text-xs">In a process</SelectItem>
            <SelectItem value="unused" className="text-xs">Unused</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="flex items-center gap-2">
        <Select
          value={sortKnown ? sortValue : ''}
          onValueChange={(v) => {
            const opt = SORT_OPTIONS.find((o) => o.value === v);
            if (opt) setSort({ key: opt.key, dir: opt.dir });
          }}
        >
          <SelectTrigger className="h-8 w-[140px] text-xs">
            <ArrowDownAZ className="h-3.5 w-3.5 mr-1.5 shrink-0 text-muted-foreground" />
            <SelectValue placeholder={sort.key ? 'Custom sort' : 'Sort'} />
          </SelectTrigger>
          <SelectContent>
            {SORT_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value} className="text-xs">
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Group by</span>
          <div className="flex rounded-lg bg-muted p-0.5 text-xs">
            {(
              [
                ['type', 'Type'],
                ['category', 'Category'],
                ['owner', 'Owner'],
                ['none', 'None'],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setGroupBy(key)}
                className={`rounded-md px-2.5 py-1 font-medium transition-all ${
                  groupBy === key
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {activeFilters > 0 && (
          <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={clearAll}>
            <X className="h-3.5 w-3.5 mr-1" /> Clear
          </Button>
        )}

        <span className="text-xs text-muted-foreground whitespace-nowrap">
          {filtered.length} of {pool.length}
        </span>
      </div>
    </>
  );

  return (
    <div>
      {hasCategories && (
        <div className="mb-3 flex flex-wrap items-center gap-1.5" role="group" aria-label="Filter by category">
          <button
            type="button"
            onClick={() => setCategoryFilter(ANY)}
            className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
              categoryFilter === ANY
                ? 'border-foreground/20 bg-foreground text-background'
                : 'border-border bg-card text-muted-foreground hover:text-foreground'
            }`}
          >
            All <span className="ml-1 tabular-nums opacity-70">{pool.length}</span>
          </button>
          {categoryCounts.map(([name, count]) => {
            const style = categoryStyle(name);
            const active = categoryFilter === name;
            return (
              <button
                key={name}
                type="button"
                onClick={() => setCategoryFilter(active ? ANY : name)}
                className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-all hover:-translate-y-px"
                style={
                  active
                    ? { backgroundColor: style.bg, borderColor: style.dot, color: style.fg }
                    : { backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))', color: 'hsl(var(--foreground))' }
                }
                aria-pressed={active}
              >
                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: style.dot }} />
                {name}
                <span className="tabular-nums opacity-60">{count}</span>
              </button>
            );
          })}
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
