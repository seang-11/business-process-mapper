import { useMemo, useState } from 'react';
import { Boxes, Search, X, Rows3, Group } from 'lucide-react';
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

interface Props {
  elements: ElementSummary[];
  types: ElementType[];
  onOpen: (id: string) => void;
  onEdit: (element: ElementSummary) => void;
  onDelete: (element: ElementSummary) => void;
}

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
  const [grouped, setGrouped] = useState(true);

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
      if (partyFilter !== ANY && (e.party || '—') !== partyFilter) return false;
      if (statusFilter !== ANY && (e.status || '—') !== statusFilter) return false;
      if (usageFilter === 'used' && e.usageCount === 0) return false;
      if (usageFilter === 'unused' && e.usageCount > 0) return false;
      return true;
    });
  }, [pool, query, typeFilter, partyFilter, statusFilter, usageFilter]);

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
    defaultVisible: ['name', 'typeName', 'party', 'ownerName', 'usageCount'],
    overrides,
  });

  // groupRecords truncates a label to 8 chars unless it can resolve it through
  // linkedNames, so hand it an identity map of type names.
  const linkedNames = useMemo(
    () =>
      new Map([
        ['ElementTypes', new Map(types.map((t) => [t.name, t.name] as const))],
      ]),
    [types],
  );

  const activeFilters =
    (typeFilter !== ANY ? 1 : 0) +
    (partyFilter !== ANY ? 1 : 0) +
    (statusFilter !== ANY ? 1 : 0) +
    (usageFilter !== ANY ? 1 : 0) +
    (query.trim() ? 1 : 0);

  const clearAll = () => {
    setQuery('');
    setTypeFilter(ANY);
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
        <Button
          variant="outline"
          size="sm"
          className="h-8 text-xs"
          onClick={() => setGrouped((g) => !g)}
        >
          {grouped ? <Rows3 className="h-3.5 w-3.5 mr-1.5" /> : <Group className="h-3.5 w-3.5 mr-1.5" />}
          {grouped ? 'Flat list' : 'Group by type'}
        </Button>

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
      <DataTable
        toolbar={toolbar}
        columns={columns}
        visibleColumns={visibleColumns}
        records={filtered as unknown as Record<string, unknown>[]}
        onRowClick={(record) => onOpen(String(record.id))}
        onEdit={(record) => onEdit(record as unknown as ElementSummary)}
        onDelete={(record) => onDelete(record as unknown as ElementSummary)}
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
        groupBy={grouped ? { key: 'typeName', linkedTable: 'ElementTypes' } : undefined}
        groupStorageKey="elements-by-type"
      />
    </div>
  );
}
