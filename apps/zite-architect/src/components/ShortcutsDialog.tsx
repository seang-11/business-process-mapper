import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@project/components/ui/dialog';
import { useMe } from '@/lib/me';

const isMac = typeof navigator !== 'undefined' && /mac/i.test(navigator.platform);
const MOD = isMac ? '⌘' : 'Ctrl';

interface Row {
  keys: string[];
  does: string;
  /** Only editors and admins can do this. */
  editorOnly?: boolean;
}

const SECTIONS: { title: string; rows: Row[] }[] = [
  {
    title: 'Anywhere',
    rows: [
      { keys: [MOD, 'K'], does: 'Open the menu: jump to any process or element, or run a command' },
      { keys: ['?'], does: 'Show this list' },
      { keys: ['Esc'], does: 'Close a window or the menu' },
    ],
  },
  {
    title: 'On a process map',
    rows: [
      { keys: [MOD, 'Z'], does: 'Undo the last move or connection', editorOnly: true },
      { keys: ['Drag a card'], does: 'Move it to another lane', editorOnly: true },
      { keys: ['Drop on a card'], does: 'Place it before or after that step. You see a preview first', editorOnly: true },
      { keys: ['Drag the pin'], does: 'Draw an arrow from a step to another step', editorOnly: true },
      { keys: [MOD, 'Scroll'], does: 'Zoom in and out' },
      { keys: ['Drag the background'], does: 'Pan around' },
    ],
  },
  {
    title: 'In training and the walkthrough',
    rows: [
      { keys: ['←', '→'], does: 'Back and next step' },
      { keys: ['Esc'], does: 'Leave' },
    ],
  },
];

/** A plain list of every shortcut, opened from the sidebar or with the ? key. */
export default function ShortcutsDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const { canEdit } = useMe();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-base">Keyboard shortcuts</DialogTitle>
          <DialogDescription>Everything you can do without reaching for the mouse.</DialogDescription>
        </DialogHeader>
        <div className="space-y-5">
          {SECTIONS.map((section) => {
            const rows = section.rows.filter((r) => !r.editorOnly || canEdit);
            if (rows.length === 0) return null;
            return (
              <section key={section.title}>
                <h3 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {section.title}
                </h3>
                <ul className="divide-y divide-border rounded-xl border border-border">
                  {rows.map((r) => (
                    <li key={r.does} className="flex items-center justify-between gap-4 px-3 py-2 text-sm">
                      <span>{r.does}</span>
                      <span className="flex shrink-0 items-center gap-1">
                        {r.keys.map((k) => (
                          <kbd
                            key={k}
                            className="rounded-md border border-border bg-muted px-1.5 py-0.5 text-[11px] font-medium"
                          >
                            {k}
                          </kbd>
                        ))}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}
