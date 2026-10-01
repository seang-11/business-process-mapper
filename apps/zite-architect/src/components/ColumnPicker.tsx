import { useMemo } from 'react';
import { GripVertical, Settings2, RotateCcw } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@project/components/ui/popover';
import { Button } from '@project/components/ui/button';
import { Checkbox } from '@project/components/ui/checkbox';
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, DragEndEvent } from '@dnd-kit/core';
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy, arrayMove } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { ColumnConfig } from '@/hooks/useColumnConfig';

interface ColumnPickerProps {
  columns: ColumnConfig[];
  onToggle: (key: string) => void;
  onReorder: (newOrder: string[]) => void;
  onReset: () => void;
}

function SortableItem({ col, onToggle }: { col: ColumnConfig; onToggle: (key: string) => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: col.key });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-muted/50"
    >
      <button
        type="button"
        className="cursor-grab text-muted-foreground hover:text-foreground touch-none"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="h-3.5 w-3.5" />
      </button>
      <Checkbox
        checked={col.visible}
        onCheckedChange={() => onToggle(col.key)}
        id={`col-${col.key}`}
      />
      <label
        htmlFor={`col-${col.key}`}
        className={`text-sm cursor-pointer select-none ${col.visible ? 'text-foreground' : 'text-muted-foreground'}`}
      >
        {col.label}
      </label>
    </div>
  );
}

export default function ColumnPicker({ columns, onToggle, onReorder, onReset }: ColumnPickerProps) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const ids = useMemo(() => columns.map(c => c.key), [columns]);

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      const oldIndex = ids.indexOf(active.id as string);
      const newIndex = ids.indexOf(over.id as string);
      onReorder(arrayMove(ids, oldIndex, newIndex));
    }
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1.5 text-muted-foreground">
          <Settings2 className="h-3.5 w-3.5" /> Columns
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-64 p-3">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
          Columns
        </p>
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={ids} strategy={verticalListSortingStrategy}>
            <div className="space-y-0.5 max-h-64 overflow-y-auto">
              {columns.map(col => (
                <SortableItem key={col.key} col={col} onToggle={onToggle} />
              ))}
            </div>
          </SortableContext>
        </DndContext>
        <div className="border-t border-border mt-2 pt-2">
          <button
            onClick={onReset}
            className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
          >
            <RotateCcw className="h-3 w-3" /> Reset to default
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
