import { useState, useMemo, useCallback, ReactNode } from 'react';
import { ArrowUp, ArrowDown, ArrowUpDown, MoreVertical, Pencil, Trash2, ChevronRight, ChevronDown } from 'lucide-react';
import { Skeleton } from '@project/components/ui/skeleton';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@project/components/ui/dropdown-menu';
import { Button } from '@project/components/ui/button';
import { formatCellValue, type ColumnConfig, type ColumnOverride } from '@/hooks/useColumnConfig';
import ColumnPicker from './ColumnPicker';

// --- Types ---

type SortDir = 'asc' | 'desc' | null;

export interface GroupByConfig {
  key: string;          // field key to group on
  linkedTable: string;  // table name for resolving IDs → display names
}

interface DataTableProps {
  columns: ColumnConfig[];
  visibleColumns: ColumnConfig[];
  records: Record<string, unknown>[];
  loading?: boolean;
  onRowClick?: (record: Record<string, unknown>) => void;
  onEdit?: (record: Record<string, unknown>) => void;
  onDelete?: (record: Record<string, unknown>) => void;
  overrides?: Record<string, ColumnOverride>;
  linkedNames?: Map<string, Map<string, string>>;
  onLinkedClick?: (tableName: string, id: string) => void;
  onToggleColumn: (key: string) => void;
  onReorderColumns: (newOrder: string[]) => void;
  onResetColumns: () => void;
  emptyIcon?: ReactNode;
  emptyLabel?: string;
  /** Filters and controls, laid out on the same row as the column picker. */
  toolbar?: ReactNode;
  groupBy?: GroupByConfig;
  /** localStorage key for persisting group collapse state (e.g. table SDK name) */
  groupStorageKey?: string;
  /** Lets a parent own the sort (e.g. a Sort dropdown in the toolbar). */
  sort?: { key: string | null; dir: SortDir };
  onSortChange?: (key: string | null, dir: SortDir) => void;
}

// --- Sort helper ---

function compareValues(a: unknown, b: unknown, type: string): number {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;

  if (type === 'number' || type === 'currency' || type === 'percent' || type === 'rating' || type === 'duration' || type === 'autonumber') {
    return Number(a) - Number(b);
  }
  if (type === 'datetime' || type === 'date' || type === 'created_at' || type === 'updated_at') {
    return new Date(a as string).getTime() - new Date(b as string).getTime();
  }
  if (type === 'checkbox') {
    return (a ? 1 : 0) - (b ? 1 : 0);
  }
  return String(a).localeCompare(String(b));
}

function sortRecords(records: Record<string, unknown>[], sortKey: string | null, sortDir: SortDir, visibleColumns: ColumnConfig[]): Record<string, unknown>[] {
  if (!sortKey || !sortDir) return records;
  const col = visibleColumns.find(c => c.key === sortKey);
  if (!col) return records;
  return [...records].sort((a, b) => {
    const cmp = compareValues(a[sortKey], b[sortKey], col.type);
    return sortDir === 'desc' ? -cmp : cmp;
  });
}

// --- Group helper ---

interface RecordGroup {
  groupId: string;
  groupLabel: string;
  records: Record<string, unknown>[];
}

function groupRecords(
  records: Record<string, unknown>[],
  groupBy: GroupByConfig,
  linkedNames?: Map<string, Map<string, string>>,
): RecordGroup[] {
  const nameMap = linkedNames?.get(groupBy.linkedTable);
  const groups = new Map<string, Record<string, unknown>[]>();
  const groupOrder: string[] = [];

  for (const record of records) {
    const raw = record[groupBy.key];
    const id = Array.isArray(raw) ? (raw[0] as string | undefined) : (raw as string | undefined);
    const groupId = id || '__ungrouped__';

    if (!groups.has(groupId)) {
      groups.set(groupId, []);
      groupOrder.push(groupId);
    }
    groups.get(groupId)!.push(record);
  }

  // Sort group order: named groups alphabetically, ungrouped last
  groupOrder.sort((a, b) => {
    if (a === '__ungrouped__') return 1;
    if (b === '__ungrouped__') return -1;
    const nameA = nameMap?.get(a) || a;
    const nameB = nameMap?.get(b) || b;
    return nameA.localeCompare(nameB);
  });

  return groupOrder.map(groupId => ({
    groupId,
    groupLabel: groupId === '__ungrouped__' ? 'Ungrouped' : (nameMap?.get(groupId) || groupId.slice(0, 8)),
    records: groups.get(groupId)!,
  }));
}

// --- Skeleton rows ---

function TableSkeleton({ colCount }: { colCount: number }) {
  return (
    <>
      {Array.from({ length: 5 }).map((_, rowIdx) => (
        <tr key={rowIdx} className="border-t border-border">
          {Array.from({ length: colCount }).map((_, colIdx) => (
            <td key={colIdx} className="px-4 py-3">
              <Skeleton className={`h-4 ${colIdx === 0 ? 'w-40' : 'w-24'} rounded`} />
            </td>
          ))}
          <td className="px-4 py-3"><Skeleton className="h-4 w-6 rounded" /></td>
        </tr>
      ))}
    </>
  );
}

// --- Cell renderer ---

function CellContent({
  value,
  col,
  overrides,
  record,
  linkedNames,
  onLinkedClick,
}: {
  value: unknown;
  col: ColumnConfig;
  overrides?: Record<string, ColumnOverride>;
  record: Record<string, unknown>;
  linkedNames?: Map<string, Map<string, string>>;
  onLinkedClick?: (tableName: string, id: string) => void;
}) {
  const ov = overrides?.[col.key];
  if (ov?.render) return <>{ov.render(value, record)}</>;

  if (col.type === 'url' && value) {
    return (
      <a href={String(value)} target="_blank" rel="noopener noreferrer"
        className="text-primary underline underline-offset-2 text-xs" onClick={e => e.stopPropagation()}>
        {String(value).replace(/^https?:\/\//, '').slice(0, 40)}
      </a>
    );
  }

  if (col.type === 'email' && value) {
    return (
      <a href={`mailto:${value}`} className="text-primary underline underline-offset-2 text-xs" onClick={e => e.stopPropagation()}>
        {String(value)}
      </a>
    );
  }

  if (col.type === 'single_select' && value) {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-muted text-foreground">
        {String(value)}
      </span>
    );
  }

  if (col.type === 'multiple_select' && Array.isArray(value)) {
    return (
      <div className="flex gap-1 flex-wrap">
        {(value as string[]).map(v => (
          <span key={v} className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-muted text-foreground">{v}</span>
        ))}
      </div>
    );
  }

  if (col.type === 'linked_record' && col.linkedTable) {
    const nameMap = linkedNames?.get(col.linkedTable);
    const ids = Array.isArray(value) ? value : value ? [value] : [];
    if (ids.length === 0) return <span className="text-muted-foreground">—</span>;
    return (
      <div className="flex gap-1 flex-wrap">
        {(ids as string[]).map(id => {
          const name = nameMap?.get(id) || id.slice(0, 8);
          return (
            <button key={id} type="button"
              className="text-primary underline underline-offset-2 text-xs hover:text-primary/80"
              onClick={e => { e.stopPropagation(); onLinkedClick?.(col.linkedTable!, id); }}>
              {name}
            </button>
          );
        })}
      </div>
    );
  }

  const formatted = formatCellValue(value, col.type);
  const isNumeric = ['number', 'currency', 'percent', 'rating', 'duration', 'autonumber'].includes(col.type);
  const isDate = ['datetime', 'date', 'created_at', 'updated_at'].includes(col.type);

  return (
    <span className={`${isNumeric ? 'tabular-nums' : ''} ${isDate ? 'text-muted-foreground' : ''}`}>
      {formatted}
    </span>
  );
}

// --- Group header row ---

function GroupHeaderRow({
  group,
  colSpan,
  isCollapsed,
  onToggle,
}: {
  group: RecordGroup;
  colSpan: number;
  isCollapsed: boolean;
  onToggle: () => void;
}) {
  return (
    <tr className="border-t border-border bg-muted/30">
      <td colSpan={colSpan} className="px-4 py-2">
        <button
          type="button"
          onClick={onToggle}
          className="flex items-center gap-2 text-sm font-medium text-foreground hover:text-primary transition-colors"
        >
          {isCollapsed
            ? <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
            : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />}
          {group.groupLabel}
          <span className="text-xs font-normal text-muted-foreground">
            ({group.records.length})
          </span>
        </button>
      </td>
    </tr>
  );
}

// --- Data row ---

function DataRow({
  record,
  visibleColumns,
  overrides,
  linkedNames,
  onLinkedClick,
  onRowClick,
  onEdit,
  onDelete,
}: {
  record: Record<string, unknown>;
  visibleColumns: ColumnConfig[];
  overrides?: Record<string, ColumnOverride>;
  linkedNames?: Map<string, Map<string, string>>;
  onLinkedClick?: (tableName: string, id: string) => void;
  onRowClick?: (record: Record<string, unknown>) => void;
  onEdit?: (record: Record<string, unknown>) => void;
  onDelete?: (record: Record<string, unknown>) => void;
}) {
  return (
    <tr
      className={`border-t border-border hover:bg-muted/30 transition-colors group ${onRowClick ? 'cursor-pointer' : ''}`}
      onClick={() => onRowClick?.(record)}
    >
      {visibleColumns.map((col, colIdx) => (
        <td
          key={col.key}
          className={`px-4 py-3 ${colIdx === 0 ? 'font-medium' : ''} ${col.type === 'long_text' || col.type === 'rich_text' ? 'max-w-[240px] truncate text-muted-foreground' : ''}`}
        >
          <CellContent
            value={record[col.key]}
            col={col}
            overrides={overrides}
            record={record}
            linkedNames={linkedNames}
            onLinkedClick={onLinkedClick}
          />
        </td>
      ))}
      {(onEdit || onDelete) && (
        <td className="px-2 py-3 text-right">
          <DropdownMenu>
            <DropdownMenuTrigger asChild onClick={e => e.stopPropagation()}>
              <Button variant="ghost" size="icon" className="h-7 w-7 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 data-[state=open]:opacity-100 transition-opacity">
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" onClick={e => e.stopPropagation()}>
              {onEdit && (
                <DropdownMenuItem onClick={() => onEdit(record)}>
                  <Pencil className="h-4 w-4 mr-2" /> Edit
                </DropdownMenuItem>
              )}
              {onDelete && (
                <DropdownMenuItem onClick={() => onDelete(record)} className="text-destructive">
                  <Trash2 className="h-4 w-4 mr-2" /> Delete
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </td>
      )}
    </tr>
  );
}

// --- Main Component ---

export default function DataTable({
  columns,
  visibleColumns,
  records,
  loading,
  onRowClick,
  onEdit,
  onDelete,
  overrides,
  linkedNames,
  onLinkedClick,
  onToggleColumn,
  onReorderColumns,
  onResetColumns,
  emptyIcon,
  emptyLabel,
  toolbar,
  groupBy,
  groupStorageKey,
  sort,
  onSortChange,
}: DataTableProps) {
  const [ownSort, setOwnSort] = useState<{ key: string | null; dir: SortDir }>({ key: null, dir: null });
  const sortKey = sort ? sort.key : ownSort.key;
  const sortDir = sort ? sort.dir : ownSort.dir;
  const applySort = useCallback((key: string | null, dir: SortDir) => {
    if (onSortChange) onSortChange(key, dir);
    else setOwnSort({ key, dir });
  }, [onSortChange]);

  // Persist collapsed groups to localStorage
  const collapseKey = groupStorageKey ? `grp_collapsed_${groupStorageKey}` : null;

  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(() => {
    if (!collapseKey) return new Set<string>();
    try {
      const raw = localStorage.getItem(collapseKey);
      return raw ? new Set(JSON.parse(raw) as string[]) : new Set<string>();
    } catch { return new Set<string>(); }
  });

  const handleSort = useCallback((key: string) => {
    if (sortKey === key) {
      if (sortDir === 'asc') applySort(key, 'desc');
      else if (sortDir === 'desc') applySort(null, null);
      else applySort(key, 'asc');
    } else {
      applySort(key, 'asc');
    }
  }, [sortKey, sortDir, applySort]);

  const toggleGroupCollapse = useCallback((groupId: string) => {
    setCollapsedGroups(prev => {
      const next = new Set(prev);
      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);
      if (collapseKey) {
        try { localStorage.setItem(collapseKey, JSON.stringify(Array.from(next))); } catch { /* ignore */ }
      }
      return next;
    });
  }, [collapseKey]);

  // Filter out the groupBy column from visible columns so it's not redundant
  const displayColumns = useMemo(() => {
    if (!groupBy) return visibleColumns;
    return visibleColumns.filter(c => c.key !== groupBy.key);
  }, [visibleColumns, groupBy]);

  const hasRowActions = Boolean(onEdit || onDelete);
  const totalColSpan = displayColumns.length + (hasRowActions ? 1 : 0);

  // Build grouped + sorted data
  const groupedData = useMemo<RecordGroup[]>(() => {
    if (!groupBy) {
      return [{ groupId: '__flat__', groupLabel: '', records: sortRecords(records, sortKey, sortDir, visibleColumns) }];
    }
    const groups = groupRecords(records, groupBy, linkedNames);
    // Sort within each group
    return groups.map(g => ({
      ...g,
      records: sortRecords(g.records, sortKey, sortDir, visibleColumns),
    }));
  }, [records, groupBy, linkedNames, sortKey, sortDir, visibleColumns]);

  // Filters on the left, column picker pinned right; both wrap on narrow screens.
  const toolbarRow = (
    <div className="flex flex-wrap items-center gap-2 mb-3">
      {toolbar}
      <div className="ml-auto shrink-0">
        <ColumnPicker columns={columns} onToggle={onToggleColumn} onReorder={onReorderColumns} onReset={onResetColumns} />
      </div>
    </div>
  );

  if (!loading && records.length === 0) {
    return (
      <div>
        {toolbarRow}
        <div className="text-center py-20">
          {emptyIcon && <div className="text-muted-foreground mx-auto mb-3 flex justify-center">{emptyIcon}</div>}
          <p className="text-muted-foreground text-sm">{emptyLabel || 'No records found'}</p>
        </div>
      </div>
    );
  }

  return (
    <div>
      {toolbarRow}
      <div className="border border-border rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/50 text-left">
                {displayColumns.map(col => (
                  <th
                    key={col.key}
                    className="group px-4 py-2.5 font-medium text-muted-foreground cursor-pointer select-none hover:text-foreground transition-colors whitespace-nowrap"
                    onClick={() => handleSort(col.key)}
                  >
                    <span className="inline-flex items-center gap-1">
                      {col.label}
                      {sortKey === col.key && sortDir === 'asc' && <ArrowUp className="h-3 w-3" />}
                      {sortKey === col.key && sortDir === 'desc' && <ArrowDown className="h-3 w-3" />}
                      {sortKey !== col.key && <ArrowUpDown className="h-3 w-3 opacity-0 group-hover:opacity-40" />}
                    </span>
                  </th>
                ))}
                {hasRowActions && <th className="w-10" />}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <TableSkeleton colCount={displayColumns.length} />
              ) : (
                groupedData.map(group => {
                  const isFlat = group.groupId === '__flat__';
                  const isCollapsed = collapsedGroups.has(group.groupId);

                  return (
                    <GroupFragment
                      key={group.groupId}
                      group={group}
                      isFlat={isFlat}
                      isCollapsed={isCollapsed}
                      totalColSpan={totalColSpan}
                      displayColumns={displayColumns}
                      overrides={overrides}
                      linkedNames={linkedNames}
                      onLinkedClick={onLinkedClick}
                      onRowClick={onRowClick}
                      onEdit={onEdit}
                      onDelete={onDelete}
                      onToggleCollapse={() => toggleGroupCollapse(group.groupId)}
                    />
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// Fragment for a single group (header + rows) to avoid key issues with fragments
function GroupFragment({
  group,
  isFlat,
  isCollapsed,
  totalColSpan,
  displayColumns,
  overrides,
  linkedNames,
  onLinkedClick,
  onRowClick,
  onEdit,
  onDelete,
  onToggleCollapse,
}: {
  group: RecordGroup;
  isFlat: boolean;
  isCollapsed: boolean;
  totalColSpan: number;
  displayColumns: ColumnConfig[];
  overrides?: Record<string, ColumnOverride>;
  linkedNames?: Map<string, Map<string, string>>;
  onLinkedClick?: (tableName: string, id: string) => void;
  onRowClick?: (record: Record<string, unknown>) => void;
  onEdit?: (record: Record<string, unknown>) => void;
  onDelete?: (record: Record<string, unknown>) => void;
  onToggleCollapse: () => void;
}) {
  return (
    <>
      {!isFlat && (
        <GroupHeaderRow
          group={group}
          colSpan={totalColSpan}
          isCollapsed={isCollapsed}
          onToggle={onToggleCollapse}
        />
      )}
      {!isCollapsed &&
        group.records.map(record => (
          <DataRow
            key={record.id as string}
            record={record}
            visibleColumns={displayColumns}
            overrides={overrides}
            linkedNames={linkedNames}
            onLinkedClick={onLinkedClick}
            onRowClick={onRowClick}
            onEdit={onEdit}
            onDelete={onDelete}
          />
        ))}
    </>
  );
}
