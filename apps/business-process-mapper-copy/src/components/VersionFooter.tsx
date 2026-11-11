import { useState } from 'react';
import { RotateCcw } from 'lucide-react';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@project/components/ui/dialog';
import { ensureCoreTypes } from 'zitejs/api';
import { APP_VERSION, CHANGELOG } from '@/lib/version';

export default function VersionFooter() {
  const [open, setOpen] = useState(false);
  const [restoring, setRestoring] = useState(false);

  const handleRestore = async () => {
    setRestoring(true);
    try {
      const res = await ensureCoreTypes({});
      if (res.created > 0) {
        toast.success(
          `Restored ${res.created} core type${res.created === 1 ? '' : 's'}. Reload to see them.`,
        );
      } else {
        toast('All core types are already in place.');
      }
    } catch {
      toast.error('Could not restore core types.');
    } finally {
      setRestoring(false);
    }
  };

  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-[11px] text-muted-foreground/60 hover:text-muted-foreground transition-colors"
      >
        v{APP_VERSION}
      </button>

      <button
        type="button"
        onClick={handleRestore}
        disabled={restoring}
        className="flex items-center gap-1 text-[11px] text-muted-foreground/40 hover:text-muted-foreground transition-colors disabled:opacity-50"
      >
        <RotateCcw className="h-3 w-3" />
        {restoring ? 'Restoring…' : 'Restore core types'}
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md max-h-[70vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-base">Release History</DialogTitle>
          </DialogHeader>

          <div className="space-y-5">
            {CHANGELOG.map((release) => (
              <div key={release.version}>
                <div className="flex items-baseline gap-2 mb-1.5">
                  <span className="text-sm font-semibold">v{release.version}</span>
                  <span className="text-xs text-muted-foreground">{release.date}</span>
                </div>
                <ul className="space-y-1 pl-4">
                  {release.changes.map((c, i) => (
                    <li
                      key={i}
                      className="text-sm text-muted-foreground list-disc"
                    >
                      {c}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
