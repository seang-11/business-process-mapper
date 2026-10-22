import { useState, useCallback, useMemo, ReactNode } from 'react';
import { format } from 'date-fns';

// --- Field type definitions ---

export interface FieldDef {
  key: string;
  label: string;
  type: string;
  linkedTable?: string;
}

export interface ColumnConfig {
  key: string;
  label: string;
  type: string;
  visible: boolean;
  linkedTable?: string;
}

export interface ColumnOverride {
  label?: string;
  render?: (value: unknown, record: Record<string, unknown>) => ReactNode;
}

// --- Static schema metadata for known tables ---

const TABLE_SCHEMAS: Record<string, FieldDef[]> = {
  Processes: [
    { key: 'name', label: 'Process', type: 'single_line_text' },
    { key: 'ownerName', label: 'Owner', type: 'single_line_text' },
    { key: 'people', label: 'People', type: 'custom' },
    { key: 'apps', label: 'Apps', type: 'custom' },
    { key: 'stepCount', label: 'Steps', type: 'number' },
    { key: 'lastEdited', label: 'Last updated', type: 'datetime' },
    { key: 'description', label: 'Description', type: 'long_text' },
  ],
  Elements: [
    { key: 'name', label: 'Name', type: 'single_line_text' },
    { key: 'typeName', label: 'Type', type: 'single_select' },
    { key: 'category', label: 'Category', type: 'single_select' },
    { key: 'party', label: 'Party', type: 'single_select' },
    { key: 'status', label: 'Status', type: 'single_select' },
    { key: 'ownerName', label: 'Owner', type: 'single_line_text' },
    { key: 'usageCount', label: 'Used in steps', type: 'number' },
    { key: 'ownsCount', label: 'Owns', type: 'number' },
    { key: 'description', label: 'Description', type: 'long_text' },
  ],
};

// --- Smart formatting by field type ---

export function formatCellValue(value: unknown, type: string): string {
  if (value == null || value === '') return '—';

  switch (type) {
    case 'datetime':
    case 'created_at':
    case 'updated_at': {
      const d = new Date(value as string);
      return isNaN(d.getTime()) ? String(value) : format(d, 'MMM d, h:mm a');
    }
    case 'date': {
      const d = new Date(value as string);
      return isNaN(d.getTime()) ? String(value) : format(d, 'MMM d, yyyy');
    }
    case 'currency': {
      const n = Number(value);
      return isNaN(n) ? String(value) : new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n);
    }
    case 'percent': {
      const n = Number(value);
      return isNaN(n) ? String(value) : `${(n * 100).toFixed(0)}%`;
    }
    case 'checkbox':
      return value ? 'Yes' : 'No';
    case 'number':
    case 'autonumber':
    case 'rating':
    case 'duration': {
      const n = Number(value);
      return isNaN(n) ? String(value) : new Intl.NumberFormat('en-US').format(n);
    }
    case 'long_text':
    case 'rich_text': {
      const s = String(value);
      return s.length > 80 ? s.slice(0, 80) + '…' : s;
    }
    case 'linked_record': {
      if (Array.isArray(value)) return value.length > 0 ? `${value.length} linked` : '—';
      return value ? '1 linked' : '—';
    }
    default:
      return String(value);
  }
}

// --- localStorage helpers ---

const STORAGE_PREFIX = 'colcfg_';

function loadSavedConfig(tableName: string): { order?: string[]; hidden?: string[] } | null {
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + tableName);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

function saveConfig(tableName: string, order: string[], hidden: string[]) {
  try {
    localStorage.setItem(STORAGE_PREFIX + tableName, JSON.stringify({ order, hidden }));
  } catch { /* ignore */ }
}

// --- Hook ---

interface UseColumnConfigOptions {
  tableName: string;
  defaultVisible?: string[];
  overrides?: Record<string, ColumnOverride>;
}

export function useColumnConfig({ tableName, defaultVisible, overrides }: UseColumnConfigOptions) {
  const fields = useMemo(() => TABLE_SCHEMAS[tableName] || [], [tableName]);

  const defaultOrder = useMemo(() => fields.map(f => f.key), [fields]);
  const defaultHidden = useMemo(() => {
    if (!defaultVisible) return [] as string[];
    return fields.filter(f => !defaultVisible.includes(f.key)).map(f => f.key);
  }, [fields, defaultVisible]);

  const [columnOrder, setColumnOrder] = useState<string[]>(() => {
    const saved = loadSavedConfig(tableName);
    if (saved?.order) {
      // Merge: add any new fields not in saved order
      const known = new Set(saved.order);
      const extra = fields.filter(f => !known.has(f.key)).map(f => f.key);
      return [...saved.order.filter(k => fields.some(f => f.key === k)), ...extra];
    }
    return defaultOrder;
  });

  const [hiddenColumns, setHiddenColumns] = useState<Set<string>>(() => {
    const saved = loadSavedConfig(tableName);
    return new Set(saved?.hidden ?? defaultHidden);
  });

  const columns = useMemo<ColumnConfig[]>(() => {
    const fieldMap = new Map(fields.map(f => [f.key, f]));
    return columnOrder
      .map(key => {
        const field = fieldMap.get(key);
        if (!field) return null;
        const ov = overrides?.[key];
        return {
          key: field.key,
          label: ov?.label ?? field.label,
          type: field.type,
          visible: !hiddenColumns.has(key),
          linkedTable: field.linkedTable,
        };
      })
      .filter(Boolean) as ColumnConfig[];
  }, [columnOrder, hiddenColumns, fields, overrides]);

  const visibleColumns = useMemo(() => columns.filter(c => c.visible), [columns]);

  const persist = useCallback((order: string[], hidden: string[]) => {
    saveConfig(tableName, order, hidden);
  }, [tableName]);

  const toggleColumn = useCallback((key: string) => {
    setHiddenColumns(prev => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        // Ensure at least 1 visible
        const visibleCount = columns.filter(c => c.visible).length;
        if (visibleCount <= 1) return prev;
        next.add(key);
      }
      persist(columnOrder, Array.from(next));
      return next;
    });
  }, [columns, columnOrder, persist]);

  const reorderColumns = useCallback((newOrder: string[]) => {
    setColumnOrder(newOrder);
    persist(newOrder, Array.from(hiddenColumns));
  }, [hiddenColumns, persist]);

  const resetToDefault = useCallback(() => {
    setColumnOrder(defaultOrder);
    setHiddenColumns(new Set(defaultHidden));
    persist(defaultOrder, defaultHidden);
  }, [defaultOrder, defaultHidden, persist]);

  return {
    columns,
    visibleColumns,
    toggleColumn,
    reorderColumns,
    resetToDefault,
    overrides: overrides ?? {},
  };
}
