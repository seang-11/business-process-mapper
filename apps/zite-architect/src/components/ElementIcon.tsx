import { useState } from 'react';
import {
  AlertTriangle, AppWindow, BarChart3, Bell, BookOpen, Bot, Box, Boxes, Briefcase,
  Building, Building2, Calendar, CalendarDays, Camera, Car, CheckCircle2,
  ClipboardCheck, ClipboardList, Clock, Cloud, Code, Coffee, Contact, Cpu,
  CreditCard, Database, DollarSign, Factory, File, FileCheck, FileSpreadsheet,
  FileText, Files, Filter, Flag, FolderOpen, GitBranch, Globe, Hammer, Home, Key,
  Landmark, Link, Lock, Mail, Map, MapPin, Megaphone, MessageSquare, Monitor,
  Package, Paperclip, Phone, PiggyBank, Plug, Printer, Receipt, Search, Send,
  Server, Settings, Shield, ShoppingCart, Smartphone, Star, Store, Table, Tag,
  Terminal, Timer, TrendingUp, Truck, User, UserCheck, UserCog, UserPlus, Users,
  Video, Wallet, Warehouse, Workflow, Wrench, Zap,
  type LucideIcon,
} from 'lucide-react';

/**
 * Brand marks that ship with the app. Drop an SVG in `src/assets/logos` and it
 * shows up — no extra import. The file stem is the lookup key (`notion.svg` →
 * "notion"). Extra aliases live in LOGO_ALIASES for names that don't match
 * the file (spaces, dots, product families).
 *
 * Vite globs the folder so the bundler still emits hashed URLs; these can't
 * 404 on however the app happens to be served.
 */
const LOGO_MODULES = import.meta.glob('../assets/logos/*.svg', {
  eager: true,
  import: 'default',
}) as Record<string, string>;

const LOGO_ALIASES: Record<string, string> = {
  'google drive': 'googledrive',
  'google calendar': 'googlecalendar',
  'google sheets': 'googlesheets',
  'google meet': 'googlemeet',
  'frame.io': 'frameio',
  'adobe premiere pro': 'premierepro',
  'premiere pro': 'premierepro',
  'mail chimp': 'mailchimp',
  'cal.com': 'calcom',
  cal: 'calcom',
  'e-signatures': 'esignatures',
  'e signatures': 'esignatures',
  esignatures: 'esignatures',
  'docu sign': 'docusign',
  clickup: 'clickup',
  'click up': 'clickup',
  linkedin: 'linkedin',
  'linked in': 'linkedin',
  'monday.com': 'monday',
  monday: 'monday',
  apollo: 'apollographql',
  'apollo graphql': 'apollographql',
  'text request': 'textrequest',
  youtube: 'youtube',
  '1password': '1password',
  '1 password': '1password',
  'google ads': 'googleads',
  'google adwords': 'googleads',
  'meta ads': 'metaads',
  'facebook ads': 'metaads',
  meta: 'metaads',
  'chat gpt': 'chatgpt',
  openai: 'chatgpt',
  'open ai': 'chatgpt',
  anthropic: 'claude',
  'claude ai': 'claude',
  'wispr flow': 'wisprflow',
  wispr: 'wisprflow',
  'microsoft teams': 'microsoftteams',
  'ms teams': 'microsoftteams',
  teams: 'microsoftteams',
  'microsoft outlook': 'outlook',
  'outlook calendar': 'outlook',
  'jira software': 'jira',
  'instantly.ai': 'instantly',
  'attio crm': 'attio',
  'google docs': 'googledocs',
  'google doc': 'googledocs',
  'smartlead.ai': 'smartlead',
  'wix.com': 'wix',
  twitter: 'x',
  'x (twitter)': 'x',
  'x / twitter': 'x',
  'x.com': 'x',
  'whats app': 'whatsapp',
  'whatsapp business': 'whatsapp',
  fb: 'facebook',
  'pay pal': 'paypal',
  'google analytics 4': 'googleanalytics',
  ga4: 'googleanalytics',
  excel: 'microsoftexcel',
  'microsoft excel': 'microsoftexcel',
  'linkedin ads': 'linkedinads',
  'linkedin campaign manager': 'linkedinads',
  'square pos': 'square',
};

function stemFromPath(path: string): string {
  const file = path.split('/').pop() ?? path;
  return file.replace(/\.svg$/i, '').toLowerCase();
}

// One entry per SVG file. This is what the picker lists, so each brand shows
// up exactly once no matter how many aliases point at it.
const BRAND_FILES: Record<string, string> = {};
for (const [path, src] of Object.entries(LOGO_MODULES)) {
  BRAND_FILES[stemFromPath(path)] = src;
}

// Lookup table: file stems plus aliases. Used to resolve stored icons and to
// auto-match element names — never listed in the picker.
const BRAND_LOGOS: Record<string, string> = { ...BRAND_FILES };
const ALIASES_BY_STEM: Record<string, string[]> = {};
for (const [alias, stem] of Object.entries(LOGO_ALIASES)) {
  const src = BRAND_FILES[stem];
  if (!src) continue;
  BRAND_LOGOS[alias] = src;
  (ALIASES_BY_STEM[stem] ??= []).push(alias);
}

/** Prefix marking a stored icon as one of the brand marks above. */
export const LOGO_PREFIX = 'logo:';

/** Unique brand marks, one per file, sorted. */
export const BRAND_LOGO_NAMES = Object.keys(BRAND_FILES).sort();

/** Does a brand (by file stem) match a search query, via its stem or any alias? */
export const brandMatches = (stem: string, q: string): boolean =>
  !q || stem.includes(q) || (ALIASES_BY_STEM[stem] ?? []).some((a) => a.includes(q));

/**
 * The icons anyone can pick from. Element Types store a bare lucide name, so
 * every type icon has to live in here too.
 */
export const ICON_GROUPS: { label: string; icons: string[] }[] = [
  {
    label: 'People & org',
    icons: ['User', 'Users', 'UserCog', 'UserCheck', 'UserPlus', 'Contact',
      'Briefcase', 'Building', 'Building2', 'Landmark', 'Factory', 'Store'],
  },
  {
    label: 'Systems',
    icons: ['AppWindow', 'Monitor', 'Server', 'Database', 'Cloud', 'Cpu', 'Bot',
      'Globe', 'Smartphone', 'Terminal', 'Code', 'Plug', 'Zap', 'Workflow', 'GitBranch'],
  },
  {
    label: 'Documents & data',
    icons: ['FileText', 'File', 'Files', 'FolderOpen', 'ClipboardList',
      'ClipboardCheck', 'BookOpen', 'Receipt', 'FileSpreadsheet', 'FileCheck',
      'Table', 'BarChart3'],
  },
  {
    label: 'Communication',
    icons: ['Mail', 'MessageSquare', 'Phone', 'Send', 'Bell', 'Megaphone',
      'Video', 'Calendar', 'CalendarDays'],
  },
  {
    label: 'Money & goods',
    icons: ['CreditCard', 'DollarSign', 'Wallet', 'PiggyBank', 'TrendingUp',
      'ShoppingCart', 'Package', 'Truck', 'Warehouse'],
  },
  {
    label: 'Places & things',
    icons: ['MapPin', 'Map', 'Home', 'Wrench', 'Hammer', 'Boxes', 'Box', 'Key',
      'Lock', 'Shield', 'Tag', 'Star', 'Flag', 'CheckCircle2', 'AlertTriangle',
      'Clock', 'Timer', 'Settings', 'Filter', 'Search', 'Link', 'Paperclip',
      'Printer', 'Camera', 'Coffee', 'Car'],
  },
];

export const ICON_LIBRARY: Record<string, LucideIcon> = {
  AlertTriangle, AppWindow, BarChart3, Bell, BookOpen, Bot, Box, Boxes, Briefcase,
  Building, Building2, Calendar, CalendarDays, Camera, Car, CheckCircle2,
  ClipboardCheck, ClipboardList, Clock, Cloud, Code, Coffee, Contact, Cpu,
  CreditCard, Database, DollarSign, Factory, File, FileCheck, FileSpreadsheet,
  FileText, Files, Filter, Flag, FolderOpen, GitBranch, Globe, Hammer, Home, Key,
  Landmark, Link, Lock, Mail, Map, MapPin, Megaphone, MessageSquare, Monitor,
  Package, Paperclip, Phone, PiggyBank, Plug, Printer, Receipt, Search, Send,
  Server, Settings, Shield, ShoppingCart, Smartphone, Star, Store, Table, Tag,
  Terminal, Timer, TrendingUp, Truck, User, UserCheck, UserCog, UserPlus, Users,
  Video, Wallet, Warehouse, Workflow, Wrench, Zap,
};

export const logoSrc = (logoName: string): string | undefined =>
  BRAND_LOGOS[logoName.trim().toLowerCase()];

interface Props {
  name: string;
  /** An uploaded picture. Beats every icon — someone chose this file deliberately. */
  image?: string;
  /** The element's own icon: a lucide name, or `logo:<brand>`. */
  icon?: string;
  /** Fallback from the element's type. */
  typeIcon?: string;
  color?: string;
  /** Pixel size of the square the icon occupies. */
  size?: number;
  className?: string;
}

/** A stored icon string → what to draw. Both icon fields go through this. */
function resolve(value?: string): { logo?: string; Icon?: LucideIcon } | null {
  const v = value?.trim();
  if (!v) return null;
  if (v.startsWith(LOGO_PREFIX)) {
    const src = logoSrc(v.slice(LOGO_PREFIX.length));
    return src ? { logo: src } : null;
  }
  // hasOwnProperty rather than a truthiness check: the values are components,
  // and TS treats an indexed function value as always defined.
  if (!Object.prototype.hasOwnProperty.call(ICON_LIBRARY, v)) return null;
  return { Icon: ICON_LIBRARY[v] };
}

export default function ElementIcon({
  name,
  image,
  icon,
  typeIcon,
  color,
  size = 16,
  className = '',
}: Props) {
  // Which source failed, not merely that one did: a component instance gets
  // reused as a list re-renders, and a plain boolean would leave it stuck on
  // the fallback for every element that came after.
  const [failedSrc, setFailedSrc] = useState<string | null>(null);

  // Uploaded picture, then chosen icon, then a brand mark matching the name,
  // then the type's icon.
  const autoLogo = logoSrc(name);
  const resolved =
    (image?.trim() ? { logo: image.trim() } : null) ??
    resolve(icon) ??
    (autoLogo ? { logo: autoLogo } : null) ??
    resolve(typeIcon);

  if (resolved?.logo && resolved.logo !== failedSrc) {
    const src = resolved.logo;
    return (
      <img
        src={src}
        alt=""
        aria-hidden="true"
        width={size}
        height={size}
        className={`shrink-0 object-contain ${className}`}
        style={{ width: size, height: size }}
        onError={() => setFailedSrc(src)}
      />
    );
  }

  // A logo that won't load falls back to the type's icon — an app still looks
  // like an app — and only then to the generic box.
  const Icon = resolved?.Icon ?? resolve(typeIcon)?.Icon ?? Box;
  return (
    <Icon
      className={`shrink-0 ${className}`}
      style={{ width: size, height: size, color: color || undefined }}
      aria-hidden="true"
    />
  );
}
