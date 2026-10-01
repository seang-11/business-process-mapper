import { useState } from 'react';
import { deleteProcess } from 'zitejs/api';
import { toast } from 'sonner';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@project/components/ui/alert-dialog';

interface Props {
  process: {
    id: string;
    name: string;
    versions: { id: string; stepCount: number }[];
  };
  onClose: () => void;
  onDeleted: () => void;
}

export default function DeleteProcessDialog({ process, onClose, onDeleted }: Props) {
  const [deleting, setDeleting] = useState(false);
  // The endpoint is the authority on whether this is safe — it re-checks every
  // reference server-side and hands back whatever is still pointing at it.
  const [blockedBy, setBlockedBy] = useState<string[] | null>(null);

  const versionCount = process.versions.length;
  const stepTotal = process.versions.reduce((sum, v) => sum + v.stepCount, 0);

  const handleDelete = async () => {
    setDeleting(true);
    try {
      const res = await deleteProcess({ id: process.id });
      if (!res.success) {
        setBlockedBy(res.blockedBy);
        return;
      }
      toast.success(`Deleted ${process.name}`);
      onDeleted();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not delete the process.');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <AlertDialog open onOpenChange={(o) => !o && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="text-base">
            {blockedBy ? `${process.name} is still in use` : `Delete ${process.name}?`}
          </AlertDialogTitle>
          <AlertDialogDescription className="text-xs">
            {blockedBy ? (
              'Remove it from these first, then delete it.'
            ) : (
              <>
                This permanently removes the process along with{' '}
                <strong>
                  {versionCount} version{versionCount === 1 ? '' : 's'}
                </strong>{' '}
                and{' '}
                <strong>
                  {stepTotal} step{stepTotal === 1 ? '' : 's'}
                </strong>
                , plus every connection between them. This cannot be undone.
              </>
            )}
          </AlertDialogDescription>
        </AlertDialogHeader>

        {blockedBy && blockedBy.length > 0 && (
          <ul className="max-h-48 overflow-y-auto rounded border border-border divide-y divide-border text-xs">
            {blockedBy.map((b, i) => (
              <li key={`${b}-${i}`} className="px-3 py-1.5 text-muted-foreground">
                {b}
              </li>
            ))}
          </ul>
        )}

        <AlertDialogFooter>
          <AlertDialogCancel disabled={deleting} className="text-xs">
            {blockedBy ? 'Close' : 'Cancel'}
          </AlertDialogCancel>
          {!blockedBy && (
            <AlertDialogAction
              onClick={(e) => {
                // Keep the dialog open so a refusal can be shown in place.
                e.preventDefault();
                handleDelete();
              }}
              disabled={deleting}
              className="text-xs bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? 'Deleting…' : 'Delete process'}
            </AlertDialogAction>
          )}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
