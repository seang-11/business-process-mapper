import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { listEditors, saveEditor, deleteEditor, ListEditorsOutputType } from 'zitejs/api';
import { ArrowLeft, ChevronRight, ShieldCheck, Trash2, UserPlus } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@project/components/ui/button';
import { Input } from '@project/components/ui/input';
import { Skeleton } from '@project/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@project/components/ui/select';
import { useMe } from '@/lib/me';

type Person = ListEditorsOutputType['people'][number];
type Access = Person['access'];

const CARD = 'rounded-xl border border-border bg-card shadow-[0_1px_2px_rgba(16,24,40,0.04)]';

const initials = (p: { name: string; email: string }) => {
  const source = p.name.trim() || p.email.split('@')[0];
  return source
    .split(/[\s._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('');
};

/**
 * Who can change things. Admins manage this list and edit; editors edit; anyone
 * else who signs in can look around and train, but not change anything.
 */
export default function People() {
  const navigate = useNavigate();
  const { isAdmin, loading: meLoading, me } = useMe();
  const [people, setPeople] = useState<Person[] | null>(null);
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [access, setAccess] = useState<Access>('Editor');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setPeople((await listEditors({})).people);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not load the list.');
    }
  }, []);

  useEffect(() => {
    if (isAdmin) load();
  }, [isAdmin, load]);

  const add = async () => {
    const mail = email.trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(mail)) {
      toast.error('Enter a full email address, like name@prospectautomations.com.');
      return;
    }
    setBusy(true);
    try {
      await saveEditor({ email: mail, name: name.trim(), access });
      toast.success(`${mail} can now ${access === 'Admin' ? 'edit and manage people' : 'edit'}`);
      setEmail('');
      setName('');
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not add them.');
    } finally {
      setBusy(false);
    }
  };

  const changeAccess = async (p: Person, next: Access) => {
    try {
      await saveEditor({ email: p.email, access: next });
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not change their access.');
    }
  };

  const remove = async (p: Person) => {
    if (!p.id) return;
    try {
      await deleteEditor({ id: p.id });
      toast.success(`${p.email} is now a viewer`);
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not remove them.');
    }
  };

  return (
    <div className="min-h-screen bg-[hsl(220_20%_98.5%)]">
      <header className="sticky top-0 z-20 border-b border-border bg-background/80 px-8 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-3xl items-center gap-2 text-sm">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => navigate('/')} aria-label="Back">
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <button
            type="button"
            onClick={() => navigate('/')}
            className="text-muted-foreground transition-colors hover:text-foreground"
          >
            Home
          </button>
          <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="font-medium">People</span>
        </div>
      </header>

      <div className="mx-auto max-w-3xl px-8 py-8">
        {meLoading ? (
          <Skeleton className="h-40 rounded-xl" />
        ) : !isAdmin ? (
          <div className={`${CARD} p-8 text-center`}>
            <span className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-muted text-muted-foreground">
              <ShieldCheck className="h-5 w-5" />
            </span>
            <p className="mt-3 text-sm font-medium">Only admins can manage people</p>
            <p className="mx-auto mt-1 max-w-sm text-xs text-muted-foreground">
              You're signed in as {me?.email ?? 'a viewer'}. Ask an admin if you need to edit processes.
            </p>
            <Button variant="outline" size="sm" className="mt-4" onClick={() => navigate('/')}>
              Back to home
            </Button>
          </div>
        ) : (
          <>
            <h1 className="text-2xl font-semibold tracking-tight">People</h1>
            <p className="mt-1.5 max-w-xl text-sm text-muted-foreground">
              Choose who can change things. Everyone else from prospectautomations.com can still look around, play the
              walkthrough and train, but can't edit.
            </p>

            <div className={`${CARD} mt-6 p-4`}>
              <p className="text-sm font-semibold">Add someone</p>
              <div className="mt-3 grid gap-2 sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_9rem_auto]">
                <Input
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && add()}
                  placeholder="name@prospectautomations.com"
                  className="h-9 text-sm"
                  aria-label="Email"
                />
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && add()}
                  placeholder="Name (optional)"
                  className="h-9 text-sm"
                  aria-label="Name"
                />
                <Select value={access} onValueChange={(v) => setAccess(v as Access)}>
                  <SelectTrigger className="h-9 text-sm" aria-label="Access">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Editor">Editor</SelectItem>
                    <SelectItem value="Admin">Admin</SelectItem>
                  </SelectContent>
                </Select>
                <Button className="h-9" disabled={busy} onClick={add}>
                  <UserPlus className="mr-1.5 h-4 w-4" /> Add
                </Button>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                Editors can change processes. Admins can also manage this list.
              </p>
            </div>

            <div className={`${CARD} mt-4 overflow-hidden`}>
              {people === null ? (
                <div className="space-y-2 p-4">
                  <Skeleton className="h-10" />
                  <Skeleton className="h-10" />
                </div>
              ) : (
                <ul className="divide-y divide-border/70">
                  {people.map((p) => (
                    <li key={p.email} className="flex items-center gap-3 px-4 py-3">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                        {initials(p)}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">
                          {p.name || p.email}
                          {p.email === me?.email && <span className="ml-2 text-xs font-normal text-muted-foreground">You</span>}
                        </p>
                        {p.name && <p className="truncate text-xs text-muted-foreground">{p.email}</p>}
                      </div>
                      {p.owner ? (
                        <span className="rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">
                          Owner · Admin
                        </span>
                      ) : (
                        <>
                          <Select value={p.access} onValueChange={(v) => changeAccess(p, v as Access)}>
                            <SelectTrigger className="h-8 w-[7.5rem] text-xs" aria-label={`Access for ${p.email}`}>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="Editor" className="text-xs">Editor</SelectItem>
                              <SelectItem value="Admin" className="text-xs">Admin</SelectItem>
                            </SelectContent>
                          </Select>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-destructive hover:text-destructive"
                            onClick={() => remove(p)}
                            aria-label={`Remove ${p.email}`}
                            title="Remove edit access"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
