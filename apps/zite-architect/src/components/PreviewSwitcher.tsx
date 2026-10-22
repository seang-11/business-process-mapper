import { useEffect, useState } from 'react';
import { listEditors, ListEditorsOutputType } from 'zitejs/api';
import { Check, ChevronDown, Eye, X } from 'lucide-react';
import { Button } from '@project/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@project/components/ui/dropdown-menu';
import { useMe, type ViewAs } from '@/lib/me';

type Person = ListEditorsOutputType['people'][number];

const ACCESS_WORD: Record<string, string> = { admin: 'Admin', editor: 'Editor', viewer: 'Viewer' };

/**
 * For admins only: see the app the way someone else does. Everything stays
 * clickable for real, so this is just a different pair of glasses; the
 * server still knows you're an admin. Previewing ends when the tab closes.
 */
export default function PreviewSwitcher() {
  const { isRealAdmin, viewAs, setViewAs, replayWelcome } = useMe();
  const [open, setOpen] = useState(false);
  const [people, setPeople] = useState<Person[] | null>(null);

  // The list of teammates loads the first time the menu opens.
  useEffect(() => {
    if (!open || !isRealAdmin || people !== null) return;
    listEditors({})
      .then((r) => setPeople(r.people))
      .catch(() => setPeople([]));
  }, [open, isRealAdmin, people]);

  if (!isRealAdmin) return null;

  const previewing = !!viewAs;
  const choose = (next: ViewAs | null) => {
    setViewAs(next);
    setOpen(false);
  };

  return (
    <div className="train-noprint flex items-center gap-1">
      {previewing ? (
        <span className="flex items-center gap-1.5 rounded-full border border-amber-300 bg-amber-50 py-1 pl-3 pr-1 text-xs font-medium text-amber-900">
          <Eye className="h-3.5 w-3.5" />
          Previewing as {viewAs!.label}
          <button
            type="button"
            onClick={() => choose(null)}
            className="ml-0.5 flex h-6 w-6 items-center justify-center rounded-full transition-colors hover:bg-amber-100"
            aria-label="Stop previewing"
            title={`Back to your admin view (you were seeing ${ACCESS_WORD.admin})`}
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </span>
      ) : (
        <Button
          variant="outline"
          size="sm"
          className="h-8 text-xs"
          onClick={() => choose({ access: 'viewer', label: 'Viewer' })}
          title="See the simpler app a new teammate sees"
        >
          <Eye className="mr-1.5 h-3.5 w-3.5" /> Preview as viewer
        </Button>
      )}

      <DropdownMenu open={open} onOpenChange={setOpen}>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="More ways to preview">
            <ChevronDown className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent side="bottom" align="end" className="w-72">
          <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
            See the app as…
          </DropdownMenuLabel>
          <DropdownMenuItem onClick={() => choose(null)} className="items-start gap-2">
            <Check className={`mt-0.5 h-4 w-4 ${previewing ? 'opacity-0' : ''}`} />
            <span>
              <span className="block text-sm font-medium">You, as admin</span>
              <span className="block text-xs text-muted-foreground">Everything, including editing.</span>
            </span>
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => choose({ access: 'editor', label: 'Editor' })}
            className="items-start gap-2"
          >
            <Check className={`mt-0.5 h-4 w-4 ${viewAs?.label === 'Editor' ? '' : 'opacity-0'}`} />
            <span>
              <span className="block text-sm font-medium">An editor</span>
              <span className="block text-xs text-muted-foreground">Can edit processes, but not manage people.</span>
            </span>
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => choose({ access: 'viewer', label: 'Viewer' })}
            className="items-start gap-2"
          >
            <Check className={`mt-0.5 h-4 w-4 ${viewAs?.label === 'Viewer' ? '' : 'opacity-0'}`} />
            <span>
              <span className="block text-sm font-medium">A viewer</span>
              <span className="block text-xs text-muted-foreground">What a new teammate sees. Nothing to edit.</span>
            </span>
          </DropdownMenuItem>

          <DropdownMenuSeparator />
          <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">A specific person</DropdownMenuLabel>
          {people === null ? (
            <p className="px-2 py-1.5 text-xs text-muted-foreground">Loading…</p>
          ) : (
            people
              .filter((p) => !p.owner)
              .map((p) => {
                const label = p.name.trim() || p.email;
                const active = viewAs?.label === label;
                return (
                  <DropdownMenuItem
                    key={p.email}
                    onClick={() =>
                      choose({
                        access: p.access === 'Admin' ? 'admin' : 'editor',
                        label,
                        firstName: (p.name.trim().split(/\s+/)[0] || p.email.split('@')[0]).replace(/^./, (c) => c.toUpperCase()),
                      })
                    }
                    className="gap-2"
                  >
                    <Check className={`h-4 w-4 ${active ? '' : 'opacity-0'}`} />
                    <span className="min-w-0 flex-1 truncate text-sm">{label}</span>
                    <span className="text-[11px] text-muted-foreground">{p.access}</span>
                  </DropdownMenuItem>
                );
              })
          )}
          <p className="px-2 pb-1.5 pt-1 text-[11px] leading-snug text-muted-foreground">
            Anyone not in the Editors table is a viewer, so pick "A viewer" to see what they see.
          </p>

          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={() => {
              replayWelcome();
              setOpen(false);
            }}
          >
            Replay the welcome screens
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
