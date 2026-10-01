import ElementIcon from './ElementIcon';

interface Participant {
  id: string;
  name: string;
  icon: string;
  image: string;
  typeIcon: string;
  color: string;
}

/**
 * A row of element icons — the people in a process, or the apps it runs on.
 * Wraps rather than truncating: hiding half the stack behind a "+6" buries
 * exactly the tools you were looking for. The cap only exists to stop an
 * absurd list from owning the row.
 */
export default function IconStack({
  items,
  max = 14,
  size = 16,
}: {
  items: Participant[];
  max?: number;
  size?: number;
}) {
  if (items.length === 0) return <span className="text-muted-foreground">—</span>;

  const shown = items.slice(0, max);
  const rest = items.length - shown.length;

  return (
    <span className="flex flex-wrap items-center gap-1">
      {shown.map((item) => (
        <span
          key={item.id}
          title={item.name}
          className="inline-flex items-center justify-center rounded border border-border bg-background p-0.5"
        >
          <ElementIcon
            name={item.name}
            image={item.image}
            icon={item.icon}
            typeIcon={item.typeIcon}
            color={item.color}
            size={size}
          />
        </span>
      ))}
      {rest > 0 && (
        <span
          className="text-[11px] text-muted-foreground"
          title={items.slice(max).map((i) => i.name).join(', ')}
        >
          +{rest}
        </span>
      )}
    </span>
  );
}
