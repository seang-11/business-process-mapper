import { useState } from 'react';
import { deleteElement } from 'zitejs/api';
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
import type { ElementSummary } from '@/types';

interface Props {
  element: ElementSummary;
  onClose: () => void;
  onDeleted: () => void;
}

export default function DeleteElementDialog({ element, onClose, onDeleted }: Props) {
  const [deleting, setDeleting] = useState(false);
  // The endpoint is the authority on whether this is safe — it re-checks every
  // step and owner reference server-side and hands back what is holding it.
  const [blockedBy, setBlockedBy] = useState<string[] | null>(null);

  const referenced = element.usageCount > 0 || element.ownsCount > 0;

  const handleDelete = async () => {
    setDeleting(true);
    try {
      const res = await deleteElement({ id: element.id });
      if (!res.success) {
        setBlockedBy(res.blockedBy);
        return;
      }
      toast.success(`Deleted ${element.name}`);
      onDeleted();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not delete the element.');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <AlertDialog open onOpenChange={(o) => !o && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="text-base">
            {blockedBy ? `${element.name} is still in use` : `Delete ${element.name}?`}
          </AlertDialogTitle>
          <AlertDialogDescription className="text-xs">
            {blockedBy
              ? 'Remove it from these first, then delete it.'
              : referenced
                ? `This element is used in ${element.usageCount} step${
                    element.usageCount === 1 ? '' : 's'
                  }${element.ownsCount > 0 ? ` and owns ${element.ownsCount} other element${element.ownsCount === 1 ? '' : 's'}` : ''}. Deleting will be refused while anything still points at it.`
                : 'Nothing references it, so this removes it from the workspace for good.'}
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
              {deleting ? 'Deleting…' : 'Delete'}
            </AlertDialogAction>
          )}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
