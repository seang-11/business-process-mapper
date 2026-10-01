import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { getElementDetail, getTaxonomy, GetElementDetailOutputType } from 'zitejs/api';
import { ArrowLeft, Pencil, Trash2 } from 'lucide-react';
import { Button } from '@project/components/ui/button';
import { Skeleton } from '@project/components/ui/skeleton';
import type { ElementSummary, ElementType } from '@/types';
import { ownerPhrase, partyToken, statusToken } from '@/lib/elementTokens';
import ElementIcon from './ElementIcon';
import { TokenBadge } from './TokenBadge';
import ElementDialog from './ElementDialog';
import DeleteElementDialog from './DeleteElementDialog';

type Detail = GetElementDetailOutputType;
type StepRow = Detail['steps'][number];
type OwnedRow = Detail['owns'][number];

const CAPACITY_ORDER = ['Performs', 'Uses', 'Produces', 'Expands into'];

export default function ElementDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [detail, setDetail] = useState<Detail | null>(null);
  const [elements, setElements] = useState<ElementSummary[]>([]);
  const [types, setTypes] = useState<ElementType[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    // The taxonomy comes along for the edit dialog's type and owner pickers.
    const [res, taxonomy] = await Promise.all([getElementDetail({ id }), getTaxonomy({})]);
    setDetail(res);
    setElements(taxonomy.elements);
    setTypes(taxonomy.types);
    setLoading(false);
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  // One element can appear in a step under more than one capacity, so group by it.
  const stepsByCapacity = useMemo(() => {
    const map = new Map<string, StepRow[]>();
    for (const s of detail?.steps ?? []) {
      const list = map.get(s.capacity);
      if (list) list.push(s);
      else map.set(s.capacity, [s]);
    }
    return [...map.entries()].sort(
      (a, b) => CAPACITY_ORDER.indexOf(a[0]) - CAPACITY_ORDER.indexOf(b[0]),
    );
  }, [detail]);

  const groupByType = (rows: OwnedRow[]) => {
    const map = new Map<string, OwnedRow[]>();
    for (const o of rows) {
      const list = map.get(o.typeName || 'Untyped');
      if (list) list.push(o);
      else map.set(o.typeName || 'Untyped', [o]);
    }
    return [...map.entries()];
  };

  // People reporting in and things being looked after are different questions,
  // so they get their own sections rather than one undifferentiated pile.
  const reports = useMemo(
    () => (detail?.owns ?? []).filter((o) => o.actorClass === 'Human'),
    [detail],
  );
  const owned = useMemo(
    () => (detail?.owns ?? []).filter((o) => o.actorClass !== 'Human'),
    [detail],
  );

  if (loading) {
    return (
      <div className="min-h-screen p-8">
        <Skeleton className="h-8 w-64 mb-6" />
        <Skeleton className="h-40 rounded-lg" />
      </div>
    );
  }

  if (!detail?.element) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3">
        <p className="text-sm text-muted-foreground">That element no longer exists.</p>
        <Button variant="outline" size="sm" onClick={() => navigate('/?tab=elements')}>
          Back to elements
        </Button>
      </div>
    );
  }

  const el = detail.element;
  // The list row carries the reference counts the delete confirmation reads.
  const summary = elements.find((e) => e.id === el.id) ?? null;

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border px-8 py-4 flex items-center gap-3">
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={() => navigate('/?tab=elements')}
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <ElementIcon
          name={el.name}
          image={el.image}
          icon={el.icon}
          typeIcon={el.typeIcon}
          color={el.color}
          size={22}
        />
        <div className="min-w-0">
          <h1 className="text-base font-semibold truncate">{el.name}</h1>
          <div className="flex items-center gap-1.5 flex-wrap mt-0.5">
            <span className="text-[11px] text-muted-foreground">{el.typeName}</span>
            {el.party && <TokenBadge token={partyToken(el.party)} />}
            {el.status && <TokenBadge token={statusToken(el.status)} />}
            {el.ownerName && (
              <span className="text-[11px] text-muted-foreground">
                {ownerPhrase(el.actorClass, el.ownerName)}
              </span>
            )}
          </div>
        </div>

        <div className="ml-auto flex items-center gap-2">
          <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => setEditing(true)}>
            <Pencil className="h-3.5 w-3.5 mr-1.5" /> Edit
          </Button>
          {summary && (
            <Button
              variant="ghost"
              size="sm"
              className="h-8 text-xs text-destructive hover:text-destructive"
              onClick={() => setDeleting(true)}
            >
              <Trash2 className="h-3.5 w-3.5 mr-1.5" /> Delete
            </Button>
          )}
        </div>
      </header>

      <div className="px-8 py-6 space-y-8 max-w-4xl">
        {el.description && (
          <p className="text-sm text-muted-foreground leading-relaxed">{el.description}</p>
        )}

        {detail.owns.length === 0 && (
          <section>
            <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
              Accountable for
            </h2>
            <p className="text-xs text-muted-foreground">
              Nothing reports to this element, and it owns nothing.
            </p>
          </section>
        )}

        {[
          { key: 'reports', heading: 'Direct reports', rows: reports },
          { key: 'owns', heading: 'Owns', rows: owned },
        ]
          .filter((s) => s.rows.length > 0)
          .map((section) => (
            <section key={section.key}>
              <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
                {section.heading} ({section.rows.length})
              </h2>
              <div className="space-y-4">
                {groupByType(section.rows).map(([typeName, items]) => (
                  <div key={typeName}>
                    <p className="text-[11px] text-muted-foreground mb-1.5">{typeName}</p>
                    <div className="flex flex-wrap gap-1.5">
                      {items.map((o) => (
                        <button
                          key={o.id}
                          onClick={() => navigate(`/element/${o.id}`)}
                          className="text-xs px-2 py-1 rounded border border-border hover:border-primary/40 transition-colors inline-flex items-center gap-1.5"
                          style={o.color ? { backgroundColor: `${o.color}1A` } : undefined}
                        >
                          <ElementIcon
                            name={o.name}
                            image={o.image}
                            icon={o.icon}
                            typeIcon={o.typeIcon}
                            color={o.color}
                            size={13}
                          />
                          {o.name}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ))}

        <section>
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
            Appears in {detail.steps.length} step{detail.steps.length === 1 ? '' : 's'}
          </h2>
          {detail.steps.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              This element is not used in any process yet.
            </p>
          ) : (
            <div className="space-y-4">
              {stepsByCapacity.map(([capacity, items]) => (
                <div key={capacity}>
                  <p className="text-[11px] text-muted-foreground mb-1.5">
                    {capacity} ({items.length})
                  </p>
                  <div className="border border-border rounded-lg divide-y divide-border overflow-hidden">
                    {items.map((s) => (
                      <button
                        key={`${s.id}-${s.capacity}`}
                        onClick={() =>
                          navigate(`/process/${s.processId}?version=${s.versionId}`)
                        }
                        className="w-full text-left px-3 py-2 hover:bg-muted/50 transition-colors flex items-center justify-between gap-3"
                      >
                        <span className="text-xs truncate">{s.title}</span>
                        <span className="text-[10px] text-muted-foreground shrink-0">
                          {s.processName}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      {editing && (
        <ElementDialog
          types={types}
          elements={elements}
          element={{
            id: el.id,
            name: el.name,
            description: el.description,
            icon: el.icon,
            image: el.image,
            typeId: el.typeId,
            party: el.party,
            status: el.status,
            ownerId: el.ownerId,
          }}
          onClose={() => setEditing(false)}
          onSaved={() => {
            setEditing(false);
            load();
          }}
        />
      )}

      {deleting && summary && (
        <DeleteElementDialog
          element={summary}
          onClose={() => setDeleting(false)}
          onDeleted={() => navigate('/?tab=elements')}
        />
      )}
    </div>
  );
}
