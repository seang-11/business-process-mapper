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

import asanaLogo from '../assets/logos/asana.svg';
import calendlyLogo from '../assets/logos/calendly.svg';
import filloutLogo from '../assets/logos/fillout.png';
import frameioLogo from '../assets/logos/frameio.svg';
import gmailLogo from '../assets/logos/gmail.svg';
import googleCalendarLogo from '../assets/logos/googlecalendar.svg';
import googleDriveLogo from '../assets/logos/googledrive.svg';
import hubspotLogo from '../assets/logos/hubspot.svg';
import obsLogo from '../assets/logos/obs.svg';
import pandadocLogo from '../assets/logos/pandadoc.svg';
import premiereProLogo from '../assets/logos/premierepro.svg';
import quickbooksLogo from '../assets/logos/quickbooks.svg';
import slackLogo from '../assets/logos/slack.svg';
import stripeLogo from '../assets/logos/stripe.svg';
import zapierLogo from '../assets/logos/zapier.svg';
import zoomLogo from '../assets/logos/zoom.svg';

/**
 * Brand marks that ship with the app, keyed by lowercased element name. An
 * element with no icon of its own falls back to one of these when its name
 * matches — we would rather show a correct generic mark than a wrong logo, so
 * nothing here is guessed.
 *
 * Imported rather than referenced by path: the bundler then emits the URL
 * itself, so these can't 404 on however the app happens to be served.
 *
 * To add one: drop an SVG in `src/assets/logos`, import it, and add the name.
 */
const BRAND_LOGOS: Record<string, string> = {
  hubspot: hubspotLogo,
  stripe: stripeLogo,
  quickbooks: quickbooksLogo,
  asana: asanaLogo,
  calendly: calendlyLogo,
  fillout: filloutLogo,
  'google drive': googleDriveLogo,
  gmail: gmailLogo,
  'google calendar': googleCalendarLogo,
  zoom: zoomLogo,
  zapier: zapierLogo,
  slack: slackLogo,
  pandadoc: pandadocLogo,
  obs: obsLogo,
  'frame.io': frameioLogo,
  frameio: frameioLogo,
  'adobe premiere pro': premiereProLogo,
  'premiere pro': premiereProLogo,
};

/** Prefix marking a stored icon as one of the brand marks above. */
export const LOGO_PREFIX = 'logo:';

export const BRAND_LOGO_NAMES = Object.keys(BRAND_LOGOS);

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
