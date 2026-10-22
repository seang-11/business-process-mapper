import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getTaxonomy, GetProcessesOutputType } from 'zitejs/api';
import { logout } from 'zitejs/auth';
import { ArrowLeftRight, BarChart3, Boxes, GraduationCap, Home, Keyboard, LogOut, Plus, Users } from 'lucide-react';
import { Dialog, DialogContent, DialogTitle } from '@project/components/ui/dialog';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@project/components/ui/command';
import type { ElementSummary } from '@/types';
import { TYPE_KEYS } from '@/lib/typeKeys';
import { useMe } from '@/lib/me';
import ElementIcon from './ElementIcon';

type ProcessRow = GetProcessesOutputType['processes'][number];

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Already sorted A to Z. */
  processes: ProcessRow[];
  onShowShortcuts: () => void;
}

const ITEM = 'flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm';

/**
 * The Cmd+K menu: jump to any process or element by typing a few letters, or
 * run an action. Elements only show once you start typing, since there are a
 * lot of them and they would bury everything else.
 */
export default function CommandMenu({ open, onOpenChange, processes, onShowShortcuts }: Props) {
  const navigate = useNavigate();
  const { canEdit, isRealAdmin } = useMe();
  const [query, setQuery] = useState('');
  const [elements, setElements] = useState<ElementSummary[] | null>(null);

  // Elements load the first time the menu opens.
  useEffect(() => {
    if (!open || elements !== null) return;
    getTaxonomy({})
      .then((r) => setElements(r.elements.filter((e) => e.typeKey !== TYPE_KEYS.process)))
      .catch(() => setElements([]));
  }, [open, elements]);

  useEffect(() => {
    if (!open) setQuery('');
  }, [open]);

  const run = (fn: () => void) => {
    onOpenChange(false);
    // Let the menu close first, so focus lands on the page it opens.
    setTimeout(fn, 0);
  };

  const matches = (e: ElementSummary) => e.name.toLowerCase().includes(query.trim().toLowerCase());
  const shownElements = query.trim() && elements ? elements.filter(matches).slice(0, 12) : [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="top-[16%] max-w-xl translate-y-0 gap-0 overflow-hidden p-0 data-[state=closed]:slide-out-to-top-[10%] data-[state=open]:slide-in-from-top-[10%]">
        <DialogTitle className="sr-only">Search and commands</DialogTitle>
        <Command className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:pt-2 [&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wider [&_[cmdk-group-heading]]:text-muted-foreground">
          <CommandInput
            value={query}
            onValueChange={setQuery}
            placeholder="Search processes and elements, or run a command…"
            className="h-12 text-sm"
          />
          <CommandList className="max-h-[min(420px,60vh)] p-2">
            <CommandEmpty className="py-8 text-center text-sm text-muted-foreground">Nothing matches that.</CommandEmpty>

            <CommandGroup heading="Go to">
              <CommandItem className={ITEM} value="go to home processes" onSelect={() => run(() => navigate('/'))}>
                <Home className="h-4 w-4 text-muted-foreground" /> Home
              </CommandItem>
              <CommandItem className={ITEM} value="go to overview where time goes" onSelect={() => run(() => navigate('/overview'))}>
                <BarChart3 className="h-4 w-4 text-muted-foreground" /> Overview
              </CommandItem>
              <CommandItem className={ITEM} value="go to handoffs who passes work" onSelect={() => run(() => navigate('/handoffs'))}>
                <ArrowLeftRight className="h-4 w-4 text-muted-foreground" /> Handoffs
              </CommandItem>
              <CommandItem className={ITEM} value="go to training learn" onSelect={() => run(() => navigate('/training'))}>
                <GraduationCap className="h-4 w-4 text-muted-foreground" /> Training
              </CommandItem>
              <CommandItem
                className={ITEM}
                value="go to elements tools people roles"
                onSelect={() => run(() => navigate('/?tab=elements'))}
              >
                <Boxes className="h-4 w-4 text-muted-foreground" /> Elements
              </CommandItem>
              {isRealAdmin && (
                <CommandItem className={ITEM} value="go to team and access editors admins" onSelect={() => run(() => navigate('/team'))}>
                  <Users className="h-4 w-4 text-muted-foreground" /> Team and access
                </CommandItem>
              )}
            </CommandGroup>

            <CommandGroup heading="Actions">
              {canEdit && (
                <CommandItem
                  className={ITEM}
                  value="new process create add"
                  onSelect={() => run(() => navigate('/?new=process'))}
                >
                  <Plus className="h-4 w-4 text-muted-foreground" /> New process
                </CommandItem>
              )}
              <CommandItem className={ITEM} value="keyboard shortcuts help" onSelect={() => run(onShowShortcuts)}>
                <Keyboard className="h-4 w-4 text-muted-foreground" /> Keyboard shortcuts
              </CommandItem>
              <CommandItem className={ITEM} value="sign out log out" onSelect={() => run(() => logout())}>
                <LogOut className="h-4 w-4 text-muted-foreground" /> Sign out
              </CommandItem>
            </CommandGroup>

            <CommandGroup heading="Processes">
              {processes.map((p) => {
                const live = p.versions.some((v) => v.state === 'Current');
                return (
                  <CommandItem
                    key={p.id}
                    className={ITEM}
                    value={`process ${p.name}`}
                    onSelect={() => run(() => navigate(`/process/${p.id}`))}
                  >
                    <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${live ? 'bg-emerald-500' : 'bg-amber-400'}`} />
                    <span className="min-w-0 flex-1 truncate">{p.name}</span>
                    <span className="text-[11px] text-muted-foreground">{live ? 'Live' : 'Draft'}</span>
                  </CommandItem>
                );
              })}
            </CommandGroup>

            {shownElements.length > 0 && (
              <CommandGroup heading="Elements">
                {shownElements.map((e) => (
                  <CommandItem
                    key={e.id}
                    className={ITEM}
                    value={`element ${e.name} ${e.id}`}
                    onSelect={() => run(() => navigate(`/element/${e.id}`))}
                  >
                    <ElementIcon
                      name={e.name}
                      image={e.image}
                      icon={e.icon}
                      typeIcon={e.typeIcon}
                      color={e.typeColor}
                      size={16}
                    />
                    <span className="min-w-0 flex-1 truncate">{e.name}</span>
                    <span className="text-[11px] text-muted-foreground">{e.typeName}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
          </CommandList>
          <div className="flex items-center gap-4 border-t border-border bg-muted/30 px-4 py-2 text-[11px] text-muted-foreground">
            <span>↑ ↓ to move</span>
            <span>Enter to open</span>
            <span>Esc to close</span>
          </div>
        </Command>
      </DialogContent>
    </Dialog>
  );
}
