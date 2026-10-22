import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { getMe, GetMeOutputType } from 'zitejs/api';

type Me = GetMeOutputType;
type Access = Me['access'];

/** What an admin is pretending to be, so they can see the app the way someone else does. */
export interface ViewAs {
  access: Access;
  /** Shown on the switcher: "Viewer", "Editor", or a person's name. */
  label: string;
  /** For the greeting, when previewing as a particular person. */
  firstName?: string;
}

interface MeContextValue {
  /** Who the app should treat you as: your real self, or whoever you're previewing. */
  me: Me | null;
  loading: boolean;
  /** Can change processes: editors and admins. */
  canEdit: boolean;
  /** Can also manage who the editors are. */
  isAdmin: boolean;
  /** Is really an admin, whatever they're previewing. Only these people get the switcher. */
  isRealAdmin: boolean;
  viewAs: ViewAs | null;
  setViewAs: (next: ViewAs | null) => void;
  welcomeSeen: boolean;
  markWelcomeSeen: () => void;
  /** Preview as a viewer and show the welcome screens again. */
  replayWelcome: () => void;
  refresh: () => Promise<void>;
}

const VIEW_AS_KEY = 'bpm_view_as';
const WELCOME_KEY = 'bpm_welcome_seen';

const MeContext = createContext<MeContextValue>({
  me: null,
  loading: true,
  canEdit: false,
  isAdmin: false,
  isRealAdmin: false,
  viewAs: null,
  setViewAs: () => {},
  welcomeSeen: true,
  markWelcomeSeen: () => {},
  replayWelcome: () => {},
  refresh: async () => {},
});

const readStored = <T,>(storage: 'session' | 'local', key: string): T | null => {
  try {
    const raw = (storage === 'session' ? sessionStorage : localStorage).getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
};

/** Looks up who is signed in once, so every screen can tell an editor from a viewer. */
export function MeProvider({ children }: { children: ReactNode }) {
  const [realMe, setRealMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);
  // Previewing lasts for this tab only, so closing it puts an admin back in their own seat.
  const [viewAs, setViewAsState] = useState<ViewAs | null>(() => readStored<ViewAs>('session', VIEW_AS_KEY));
  const [welcomeSeen, setWelcomeSeen] = useState(() => readStored<boolean>('local', WELCOME_KEY) === true);

  const refresh = useCallback(async () => {
    try {
      setRealMe(await getMe({}));
    } catch {
      // If this fails, treat the person as a viewer: the server enforces the real rules anyway.
      setRealMe(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const setViewAs = useCallback((next: ViewAs | null) => {
    setViewAsState(next);
    try {
      if (next) sessionStorage.setItem(VIEW_AS_KEY, JSON.stringify(next));
      else sessionStorage.removeItem(VIEW_AS_KEY);
    } catch {
      /* it just resets on reload */
    }
  }, []);

  const markWelcomeSeen = useCallback(() => {
    setWelcomeSeen(true);
    try {
      localStorage.setItem(WELCOME_KEY, JSON.stringify(true));
    } catch {
      /* it shows again next time */
    }
  }, []);

  const replayWelcome = useCallback(() => {
    setViewAs({ access: 'viewer', label: 'Viewer' });
    setWelcomeSeen(false);
    try {
      localStorage.removeItem(WELCOME_KEY);
    } catch {
      /* nothing to forget */
    }
  }, [setViewAs]);

  const value = useMemo<MeContextValue>(() => {
    const isRealAdmin = realMe?.access === 'admin';
    // Only a real admin can preview; anyone else's stored preview is ignored.
    const preview = isRealAdmin ? viewAs : null;
    const me: Me | null =
      realMe && preview
        ? { ...realMe, access: preview.access, firstName: preview.firstName ?? realMe.firstName }
        : realMe;
    return {
      me,
      loading,
      canEdit: me?.access === 'admin' || me?.access === 'editor',
      isAdmin: me?.access === 'admin',
      isRealAdmin,
      viewAs: preview,
      setViewAs,
      welcomeSeen,
      markWelcomeSeen,
      replayWelcome,
      refresh,
    };
  }, [realMe, loading, viewAs, setViewAs, welcomeSeen, markWelcomeSeen, replayWelcome, refresh]);

  return <MeContext.Provider value={value}>{children}</MeContext.Provider>;
}

export const useMe = () => useContext(MeContext);
