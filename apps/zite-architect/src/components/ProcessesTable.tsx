import { useMemo, useState } from 'react';
import { GetProcessesOutputType } from 'zitejs/api';
import { Workflow, Search, X } from 'lucide-react';
import { Button } from '@project/components/ui/button';
import { Input } from '@project/components/ui/input';
import { useColumnConfig, type ColumnOverride } from '@/hooks/useColumnConfig';
import DataTable from './DataTable';
import ElementIcon from './ElementIcon';
import IconStack from './IconStack';

type ProcessRow = GetProcessesOutputType['processes'][number];

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
        render: (_value, record) => (
          <span className="flex items-center gap-2 min-w-0">
            <ElementIcon name={String(record.name ?? '')} typeIcon="Workflow" size={16} />
            <span className="truncate font-medium">{String(record.name ?? '')}</span>
          </span>
        ),
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
        render: (value) => <IconStack items={(value ?? []) as never[]} />,
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
