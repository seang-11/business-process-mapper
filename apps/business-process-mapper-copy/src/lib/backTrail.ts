import { useCallback, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

/**
 * The pages you've been on, so Back returns to the one you came from (the
 * Brain, a role brief, a process) rather than always Home. Only page changes
 * count: switching a view or version on the same page doesn't add a step,
 * it just updates where that page was left.
 */
type Stop = { path: string; search: string };
const KEY = 'bpm_back_trail';

// Kept in this tab's storage too, not just in memory: the Zite editor's preview
// reloads the app when you move between pages, and a refresh does the same.
// Without this the trail was wiped and Back fell all the way to Home.
const load = (): Stop[] => {
  try {
    const raw = sessionStorage.getItem(KEY);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list.filter((x) => x && typeof x.path === 'string' && typeof x.search === 'string') : [];
  } catch {
    return [];
  }
};
const save = () => {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(trail));
  } catch {
    // Not stored; Back still works until the next reload.
  }
};
const trail: Stop[] = load();

/** Called once, high up, so every page change is noted. */
export function useTrackTrail() {
  const loc = useLocation();
  useEffect(() => {
    const last = trail[trail.length - 1];
    if (last && last.path === loc.pathname) {
      last.search = loc.search;
    } else {
      trail.push({ path: loc.pathname, search: loc.search });
      if (trail.length > 50) trail.shift();
    }
    save();
  }, [loc.pathname, loc.search]);
}

const NAMES: [RegExp, string][] = [
  [/^\/$/, 'Home'],
  [/^\/brain$/, 'Brain'],
  [/^\/roles$/, 'Roles'],
  [/^\/roles\/.+/, 'role brief'],
  [/^\/training$/, 'Training'],
  [/^\/team$/, 'Team and access'],
  [/^\/(process|view)\/.+/, 'process'],
  [/^\/element\/.+/, 'element'],
];

function previous(currentPath: string) {
  for (let i = trail.length - 1; i >= 0; i -= 1) {
    if (trail[i].path !== currentPath) return i;
  }
  return -1;
}

/**
 * Back to the page before this one, or to `fallback` when this page was
 * opened directly (a shared link, a refresh). Also says where it goes, for
 * the button's label.
 */
export function useBack(fallback: string, fallbackName: string) {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const i = previous(pathname);
  const target = i >= 0 ? trail[i] : null;
  const name = target ? NAMES.find(([re]) => re.test(target.path))?.[1] ?? 'previous page' : fallbackName;
  const go = useCallback(() => {
    const at = previous(pathname);
    if (at < 0) {
      navigate(fallback);
      return;
    }
    const t = trail[at];
    trail.splice(at + 1);
    save();
    navigate(t.path + t.search);
  }, [navigate, pathname, fallback]);
  return { go, name };
}
