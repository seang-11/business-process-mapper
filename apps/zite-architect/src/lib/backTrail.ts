import { useCallback, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

/**
 * The pages you've been on, so Back returns to the one you came from (the
 * Brain, a role brief, a process) rather than always Home. Only page changes
 * count: switching a view or version on the same page doesn't add a step,
 * it just updates where that page was left.
 */
const trail: { path: string; search: string }[] = [];

/** Called once, high up, so every page change is noted. */
export function useTrackTrail() {
  const loc = useLocation();
  useEffect(() => {
    const last = trail[trail.length - 1];
    if (last && last.path === loc.pathname) {
      last.search = loc.search;
      return;
    }
    trail.push({ path: loc.pathname, search: loc.search });
    if (trail.length > 50) trail.shift();
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
    navigate(t.path + t.search);
  }, [navigate, pathname, fallback]);
  return { go, name };
}
