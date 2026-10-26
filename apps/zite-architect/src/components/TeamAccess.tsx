import { useCallback, useEffect, useState } from 'react';
import { getWorkspaceLink, listEditors, ListEditorsOutputType } from 'zitejs/api';
import { ExternalLink } from 'lucide-react';
import { Button } from '@project/components/ui/button';
import { PageError, PageLoading } from './PageState';
import { useMe } from '@/lib/me';
import VersionFooter from './VersionFooter';

type Person = ListEditorsOutputType['people'][number];

const initialsOf = (name: string) =>
  name.split(/[\s@.]+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('') || '?';

/**
 * Who can change processes. Everyone in the Editors table is an admin: they
 * edit everything and see this page. Everyone else can look around and train.
 * People are added in the Editors table in Zite.
 */
export default function TeamAccess() {
  const { isRealAdmin } = useMe();
  const [people, setPeople] = useState<Person[] | null>(null);
  const [workspaceUrl, setWorkspaceUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  const load = useCallback(() => {
    setFailed(false);
    listEditors({})
      .then((r) => setPeople(r.people))
      .catch(() => setFailed(true));
    getWorkspaceLink({})
      .then((l) => setWorkspaceUrl(l.workspaceHomeUrl))
      .catch(() => setWorkspaceUrl(null));
  }, []);
  useEffect(() => {
    if (isRealAdmin) load();
  }, [isRealAdmin, load]);

  if (!isRealAdmin) {
    return (
      <div className="mx-auto max-w-[900px] px-8 py-8">
        <h1 className="text-3xl font-semibold tracking-tight">Team and access</h1>
        <p className="mt-3 text-sm text-muted-foreground">Only admins can see who has access.</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[900px] px-8 py-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Team and access</h1>
          <p className="mt-1.5 max-w-xl text-sm text-muted-foreground">
            Admins can change everything. Everyone else can look around and train.
          </p>
        </div>
        {workspaceUrl && (
          <Button variant="outline" size="sm" className="h-9" asChild>
            <a href={workspaceUrl} target="_blank" rel="noopener noreferrer">
              Add or remove people in Zite <ExternalLink className="ml-2 h-3.5 w-3.5" />
            </a>
          </Button>
        )}
      </div>

      <div className="mt-7">
        {failed ? (
          <PageError onRetry={load} />
        ) : people === null ? (
          <PageLoading blocks={1} height="h-48" />
        ) : (
          <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
            {people.map((p) => (
              <li key={p.email} className="flex items-center gap-3 px-5 py-3.5">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                  {initialsOf(p.name || p.email)}
                </span>
                <span className="min-w-0 flex-1 leading-tight">
                  <span className="block truncate text-sm font-medium">{p.name || p.email}</span>
                  {p.name && <span className="block truncate text-xs text-muted-foreground">{p.email}</span>}
                </span>
                {p.owner && <span className="text-[11px] text-muted-foreground">Owner</span>}
                <span
                  className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${
                    p.access === 'Admin' ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'
                  }`}
                >
                  {p.access}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="mt-10 border-t border-border pt-4">
        <VersionFooter />
      </div>
    </div>
  );
}
