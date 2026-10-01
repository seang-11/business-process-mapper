import { useMemo, useRef, useState } from 'react';
import { Check, Trash2, Upload } from 'lucide-react';
import { useUpload } from 'zitejs/upload';
import { toast } from 'sonner';
import { Button } from '@project/components/ui/button';
import { Input } from '@project/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@project/components/ui/popover';
import ElementIcon, {
  BRAND_LOGO_NAMES,
  ICON_GROUPS,
  ICON_LIBRARY,
  LOGO_PREFIX,
} from './ElementIcon';

const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
/** Icons render at 22px at most, so anything bigger than this is wasted bytes. */
const MAX_EDGE = 256;

/**
 * Shrink a bitmap before upload. SVGs are passed through untouched — they are
 * already small and rasterising one would throw away the reason to use it.
 */
async function shrink(file: File): Promise<Blob | File> {
  if (file.type === 'image/svg+xml' || file.type === 'image/gif') return file;

  const bitmap = await createImageBitmap(file).catch(() => null);
  if (!bitmap) return file;
  if (bitmap.width <= MAX_EDGE && bitmap.height <= MAX_EDGE) return file;

  const scale = MAX_EDGE / Math.max(bitmap.width, bitmap.height);
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext('2d');
  if (!ctx) return file;
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, 'image/png'),
  );
  return blob ?? file;
}

interface Props {
  /** '' means "no icon of its own" — fall back to the brand mark or the type. */
  value: string;
  onChange: (icon: string) => void;
  /** An uploaded picture, which beats any icon. '' when there isn't one. */
  image: string;
  onImageChange: (url: string) => void;
  /** Used for the auto preview: a matching brand mark, else the type's icon. */
  name: string;
  typeIcon?: string;
  color?: string;
}

/** Title-cases a lucide name for display: FileSpreadsheet → File spreadsheet. */
const humanize = (icon: string) =>
  icon.replace(/([a-z])([A-Z0-9])/g, '$1 $2').replace(/^./, (c) => c.toUpperCase());

export default function IconPicker({
  value,
  onChange,
  image,
  onImageChange,
  name,
  typeIcon,
  color,
}: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const fileInput = useRef<HTMLInputElement>(null);
  const { upload, isUploading } = useUpload();

  const q = query.trim().toLowerCase();

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast.error('Pick an image file.');
      return;
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      toast.error('That image is over 5 MB.');
      return;
    }
    try {
      const data = await shrink(file);
      const { url } = await upload(data, file.name);
      onImageChange(url);
      setOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Upload failed.');
    }
  };

  const logos = useMemo(
    () => BRAND_LOGO_NAMES.filter((n) => !q || n.includes(q)),
    [q],
  );

  const groups = useMemo(
    () =>
      ICON_GROUPS.map((g) => ({
        ...g,
        icons: g.icons.filter(
          (i) => ICON_LIBRARY[i] && (!q || humanize(i).toLowerCase().includes(q)),
        ),
      })).filter((g) => g.icons.length > 0),
    [q],
  );

  const nothing = logos.length === 0 && groups.length === 0;

  const choose = (icon: string) => {
    onChange(icon);
    // An uploaded picture outranks any icon, so picking one replaces it —
    // otherwise the choice would appear to do nothing.
    if (image) onImageChange('');
    setOpen(false);
    setQuery('');
  };

  return (
    <Popover
      // modal keeps the wheel working when this sits inside a dialog.
      modal
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) setQuery('');
      }}
    >
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="h-9 w-9 shrink-0"
          aria-label="Choose an icon"
          title="Choose an icon"
        >
          <ElementIcon
            name={name}
            image={image}
            icon={value}
            typeIcon={typeIcon}
            color={color}
            size={18}
          />
        </Button>
      </PopoverTrigger>

      <PopoverContent className="w-[320px] p-0" align="start">
        <div className="p-2 border-b border-border flex items-center gap-2">
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search icons…"
            className="h-8 text-xs"
            autoFocus
          />
          <input
            ref={fileInput}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              handleFile(e.target.files?.[0]);
              e.target.value = '';
            }}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 text-xs shrink-0"
            disabled={isUploading}
            onClick={() => fileInput.current?.click()}
          >
            <Upload className="h-3.5 w-3.5 mr-1.5" />
            {isUploading ? 'Uploading…' : 'Upload'}
          </Button>
        </div>

        {image && (
          <div className="flex items-center gap-2 px-2 py-2 border-b border-border">
            <img
              src={image}
              alt=""
              className="h-8 w-8 rounded border border-border object-contain bg-background"
            />
            <span className="flex-1 text-xs">Your image</span>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 text-xs text-destructive hover:text-destructive"
              onClick={() => onImageChange('')}
            >
              <Trash2 className="h-3.5 w-3.5 mr-1" /> Remove
            </Button>
          </div>
        )}

        <div className="max-h-64 overflow-y-auto p-2 space-y-3">
          {!q && (
            <button
              type="button"
              onClick={() => choose('')}
              className={`w-full flex items-center gap-2 rounded-md border px-2 py-1.5 text-xs transition-colors ${
                value === ''
                  ? 'border-primary/50 bg-primary/5'
                  : 'border-border hover:bg-muted/50'
              }`}
            >
              <ElementIcon name={name} typeIcon={typeIcon} color={color} size={16} />
              <span className="flex-1 text-left">Automatic</span>
              {value === '' && <Check className="h-3.5 w-3.5 text-primary" />}
            </button>
          )}

          {nothing && (
            <p className="px-1 py-6 text-center text-xs text-muted-foreground">
              Nothing matches “{query.trim()}”.
            </p>
          )}

          {logos.length > 0 && (
            <div>
              <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground px-1 mb-1.5">
                Brands
              </p>
              <div className="grid grid-cols-8 gap-1">
                {logos.map((logoName) => {
                  const iconValue = `${LOGO_PREFIX}${logoName}`;
                  return (
                    <button
                      key={logoName}
                      type="button"
                      title={humanize(logoName)}
                      aria-label={logoName}
                      onClick={() => choose(iconValue)}
                      className={`h-8 w-8 flex items-center justify-center rounded border transition-colors ${
                        value === iconValue
                          ? 'border-primary/60 bg-primary/10'
                          : 'border-transparent hover:bg-muted'
                      }`}
                    >
                      <ElementIcon name={logoName} icon={iconValue} size={17} />
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {groups.map((group) => (
            <div key={group.label}>
              <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground px-1 mb-1.5">
                {group.label}
              </p>
              <div className="grid grid-cols-8 gap-1">
                {group.icons.map((iconName) => (
                  <button
                    key={iconName}
                    type="button"
                    title={humanize(iconName)}
                    aria-label={iconName}
                    onClick={() => choose(iconName)}
                    className={`h-8 w-8 flex items-center justify-center rounded border transition-colors ${
                      value === iconName
                        ? 'border-primary/60 bg-primary/10'
                        : 'border-transparent hover:bg-muted'
                    }`}
                  >
                    <ElementIcon name="" icon={iconName} color={color} size={16} />
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
