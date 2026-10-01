import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { getProcesses, getTaxonomy, GetProcessesOutputType } from 'zitejs/api';
import { Workflow, Boxes, Plus } from 'lucide-react';
import { Button } from '@project/components/ui/button';
import { Skeleton } from '@project/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger } from '@project/components/ui/tabs';
import type { ElementSummary, ElementType } from '@/types';
import { TYPE_KEYS } from '@/lib/typeKeys';
import CreateProcessDialog from './CreateProcessDialog';
import ElementDialog from './ElementDialog';
import DeleteElementDialog from './DeleteElementDialog';
import DeleteProcessDialog from './DeleteProcessDialog';
import EditProcessDialog from './EditProcessDialog';
import ElementsTable from './ElementsTable';
import ProcessesTable from './ProcessesTable';
import VersionFooter from './VersionFooter';

type ProcessRow = GetProcessesOutputType['processes'][number];

export default function WorkspaceList() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = searchParams.get('tab') === 'elements' ? 'elements' : 'processes';

  const [processes, setProcesses] = useState<ProcessRow[]>([]);
  const [elements, setElements] = useState<ElementSummary[]>([]);
  const [types, setTypes] = useState<ElementType[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [creatingElement, setCreatingElement] = useState(false);
  const [editTarget, setEditTarget] = useState<ElementSummary | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ElementSummary | null>(null);
  const [deleteProcessTarget, setDeleteProcessTarget] = useState<ProcessRow | null>(null);
  const [editProcessTarget, setEditProcessTarget] = useState<ProcessRow | null>(null);

  const load = useCallback(async () => {
    const [processRes, taxonomy] = await Promise.all([getProcesses({}), getTaxonomy({})]);
    setProcesses(processRes.processes);
    setElements(taxonomy.elements);
    setTypes(taxonomy.types);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const elementCount = useMemo(
    () => elements.filter((e) => e.typeKey !== TYPE_KEYS.process).length,
    [elements],
  );

  if (loading) {
    return (
      <div className="min-h-screen p-8">
        <Skeleton className="h-8 w-64 mb-6" />
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-28 rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border px-8 py-5">
        <h1 className="text-lg font-semibold">Business Process Mapper</h1>
      </header>

      <div className="px-8 py-6">
        <div className="flex flex-col gap-3 mb-5 sm:flex-row sm:items-center sm:justify-between">
          <Tabs
            value={tab}
            onValueChange={(v) => setSearchParams(v === 'elements' ? { tab: 'elements' } : {})}
          >
            <TabsList>
              <TabsTrigger value="processes" className="text-xs">
                <Workflow className="h-3.5 w-3.5 mr-1.5" />
                Processes ({processes.length})
              </TabsTrigger>
              <TabsTrigger value="elements" className="text-xs">
                <Boxes className="h-3.5 w-3.5 mr-1.5" />
                Elements ({elementCount})
              </TabsTrigger>
            </TabsList>
          </Tabs>

          {/* The primary action sits in the same place on both tabs. */}
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              className="h-9 shrink-0"
              onClick={() =>
                tab === 'processes' ? setCreating(true) : setCreatingElement(true)
              }
            >
              <Plus className="h-3.5 w-3.5 mr-1.5" />
              {tab === 'processes' ? 'New process' : 'New element'}
            </Button>
          </div>
        </div>

        {tab === 'processes' ? (
          <ProcessesTable
            processes={processes}
            onOpen={(processId) => navigate(`/process/${processId}`)}
            onEdit={(p) => setEditProcessTarget(p)}
            onDelete={(p) => setDeleteProcessTarget(p)}
          />
        ) : (
          <ElementsTable
            elements={elements}
            types={types}
            onOpen={(id) => navigate(`/element/${id}`)}
            onEdit={(el) => setEditTarget(el)}
            onDelete={(el) => setDeleteTarget(el)}
          />
        )}
      </div>

      {creating && (
        <CreateProcessDialog
          elements={elements}
          types={types}
          onClose={() => setCreating(false)}
          onCreated={(processId) => navigate(`/process/${processId}`)}
        />
      )}

      {(creatingElement || editTarget) && (
        <ElementDialog
          key={editTarget?.id ?? 'new'}
          types={types}
          elements={elements}
          element={editTarget}
          onClose={() => {
            setCreatingElement(false);
            setEditTarget(null);
          }}
          onSaved={() => {
            setCreatingElement(false);
            setEditTarget(null);
            load();
          }}
        />
      )}

      {deleteTarget && (
        <DeleteElementDialog
          element={deleteTarget}
          onClose={() => setDeleteTarget(null)}
          onDeleted={() => {
            setDeleteTarget(null);
            load();
          }}
        />
      )}
      {editProcessTarget && (
        <EditProcessDialog
          process={{
            id: editProcessTarget.id,
            name: editProcessTarget.name,
            ownerId: editProcessTarget.ownerId,
          }}
          elements={elements}
          types={types}
          onClose={() => setEditProcessTarget(null)}
          onSaved={() => {
            setEditProcessTarget(null);
            load();
          }}
        />
      )}
      {deleteProcessTarget && (
        <DeleteProcessDialog
          process={deleteProcessTarget}
          onClose={() => setDeleteProcessTarget(null)}
          onDeleted={() => {
            setDeleteProcessTarget(null);
            load();
          }}
        />
      )}
      <footer className="fixed bottom-3 left-4">
        <VersionFooter />
      </footer>
    </div>
  );
}
