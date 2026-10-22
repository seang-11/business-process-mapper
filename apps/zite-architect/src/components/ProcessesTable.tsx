import { useMemo, useState } from 'react';
import { GetProcessesOutputType } from 'zitejs/api';
import { formatDistanceToNowStrict } from 'date-fns';
import { Workflow, Search, X } from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@project/components/ui/tooltip';
import { Button } from '@project/components/ui/button';
import { Input } from '@project/components/ui/input';
import { useColumnConfig, type ColumnOverride } from '@/hooks/useColumnConfig';
import DataTable from './DataTable';
import ElementIcon from './ElementIcon';
import IconStack from './IconStack';

type ProcessRow = GetProcessesOutputType['processes'][number];

// Soft tints for the people avatars, picked from the name so a role keeps its
// colour every time it appears.
const AVATAR_TINTS = [
  { fg: 'hsl(217 65% 42%)', bg: 'hsl(217 90% 95%)' },
  { fg: 'hsl(262 55% 48%)', bg: 'hsl(262 80% 96%)' },
  { fg: 'hsl(152 55% 32%)', bg: 'hsl(152 60% 94%)' },
  { fg: 'hsl(24 80% 42%)', bg: 'hsl(24 95% 94%)' },
  { fg: 'hsl(336 65% 46%)', bg: 'hsl(336 85% 96%)' },
  { fg: 'hsl(188 70% 30%)', bg: 'hsl(188 65% 93%)' },
];

const tintFor = (name: string) => {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return AVATAR_TINTS[h % AVATAR_TINTS.length];
};

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('');

/** Overlapping initials, one per person or role. Hover names them. */
function PeopleStack({ people }: { people: { id: string; name: string }[] }) {
  if (people.length === 0) return <span className="text-muted-foreground">—</span>;
  const shown = people.slice(0, 6);
  const rest = people.length - shown.length;
  return (
    <TooltipProvider delayDuration={100}>
      <span className="flex items-center">
        <span className="flex -space-x-1.5">
          {shown.map((p) => {
            const tint = tintFor(p.name);
            return (
              <Tooltip key={p.id}>
                <TooltipTrigger asChild>
                  <span
                    className="flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-semibold ring-2 ring-card"
                    style={{ backgroundColor: tint.bg, color: tint.fg }}
                  >
                    {initials(p.name)}
                  </span>
                </TooltipTrigger>
                <TooltipContent side="top" className="text-xs">
                  {p.name}
                </TooltipContent>
              </Tooltip>
            );
          })}
        </span>
        {rest > 0 && <span className="ml-1.5 text-[11px] text-muted-foreground">+{rest}</span>}
      </span>
    </TooltipProvider>
  );
}

interface Props {
  processes: ProcessRow[];
  onOpen: (id: string) => void;
  onEdit: (process: ProcessRow) => void;
  onDelete: (process: ProcessRow) => void;
}

export default function ProcessesTable({ processes, onOpen, onEdit, onDelete }: Props) {
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return processes;
    return processes.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.ownerName.toLowerCase().includes(q) ||
        p.people.some((x) => x.name.toLowerCase().includes(q)) ||
        p.apps.some((x) => x.name.toLowerCase().includes(q)),
    );
  }, [processes, query]);

  const overrides = useMemo<Record<string, ColumnOverride>>(
    () => ({
      name: {
        render: (_value, record) => {
          const versionCount = Array.isArray(record.versions) ? record.versions.length : 0;
          return (
            <span className="flex min-w-0 items-center gap-2.5">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-border bg-muted/60 text-muted-foreground">
                <ElementIcon name={String(record.name ?? '')} typeIcon="Workflow" size={14} />
              </span>
              <span className="truncate font-medium">{String(record.name ?? '')}</span>
              {versionCount > 1 && (
                <span
                  className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary"
                  title="Has a future version to compare"
                >
                  {versionCount} versions
                </span>
              )}
            </span>
          );
        },
      },
      lastEdited: {
        render: (value) => {
          const date = value ? new Date(String(value)) : null;
          if (!date || Number.isNaN(date.getTime())) return <span className="text-muted-foreground">—</span>;
          return (
            <span className="text-muted-foreground" title={date.toLocaleString()}>
              {formatDistanceToNowStrict(date, { addSuffix: true })}
            </span>
          );
        },
      },
      ownerName: {
        render: (value, record) => {
          const label = value ? String(value) : 'Unassigned';
          return (
            <button
              type="button"
              className="text-left hover:underline underline-offset-2"
              onClick={(e) => {
                e.stopPropagation();
                const match = processes.find((p) => p.id === String(record.id));
                if (match) onEdit(match);
              }}
            >
              <span className={value ? '' : 'text-muted-foreground'}>{label}</span>
            </button>
          );
        },
      },
      people: {
        render: (value) => <PeopleStack people={(value ?? []) as { id: string; name: string }[]} />,
      },
      apps: {
        render: (value) => <IconStack items={(value ?? []) as never[]} />,
      },
      stepCount: {
        render: (value) => {
          const total = Number(value ?? 0);
          if (total === 0) return <span className="text-muted-foreground">—</span>;
          return <span className="tabular-nums">{total}</span>;
        },
      },
    }),
    [processes, onEdit],
  );

  const { columns, visibleColumns, toggleColumn, reorderColumns, resetToDefault } =
    useColumnConfig({
      tableName: 'Processes',
      defaultVisible: ['name', 'ownerName', 'people', 'apps', 'stepCount', 'lastEdited'],
      overrides,
    });

  const toolbar = (
    <>
      <div className="relative w-full sm:w-52">
        <Search className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search processes…"
          className="h-8 pl-8 w-full text-xs"
        />
      </div>
      {query.trim() && (
        <Button
          variant="ghost"
          size="sm"
          className="h-8 text-xs"
          onClick={() => setQuery('')}
        >
          <X className="h-3.5 w-3.5 mr-1" /> Clear
        </Button>
      )}
      <span className="text-xs text-muted-foreground whitespace-nowrap">
        {filtered.length} of {processes.length}
      </span>
    </>
  );

  return (
    <DataTable
      toolbar={toolbar}
      columns={columns}
      visibleColumns={visibleColumns}
      records={filtered as unknown as Record<string, unknown>[]}
      onRowClick={(record) => onOpen(String(record.id))}
      onEdit={(record) => {
        const match = processes.find((p) => p.id === String(record.id));
        if (match) onEdit(match);
      }}
      onDelete={(record) => {
        const match = processes.find((p) => p.id === String(record.id));
        if (match) onDelete(match);
      }}
      overrides={overrides}
      onToggleColumn={toggleColumn}
      onReorderColumns={reorderColumns}
      onResetColumns={resetToDefault}
      emptyIcon={<Workflow className="h-6 w-6" />}
      emptyLabel={
        query.trim()
          ? 'No processes match that search'
          : 'No processes yet — click "New process" to create your first one'
      }
    />
  );
}
