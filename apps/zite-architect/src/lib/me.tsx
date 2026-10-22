import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { getMe, GetMeOutputType } from 'zitejs/api';

type Me = GetMeOutputType;

interface MeContextValue {
  me: Me | null;
  loading: boolean;
  /** Can change processes: editors and admins. */
  canEdit: boolean;
  /** Can also manage who the editors are. */
  isAdmin: boolean;
  refresh: () => Promise<void>;
}

const MeContext = createContext<MeContextValue>({
  me: null,
  loading: true,
  canEdit: false,
  isAdmin: false,
  refresh: async () => {},
});

/** Looks up who is signed in once, so every screen can tell an editor from a viewer. */
export function MeProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      setMe(await getMe({}));
    } catch {
      // If this fails, treat the person as a viewer: the server enforces the real rules anyway.
      setMe(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const value = useMemo<MeContextValue>(
    () => ({
      me,
      loading,
      canEdit: me?.access === 'admin' || me?.access === 'editor',
      isAdmin: me?.access === 'admin',
      refresh,
    }),
    [me, loading, refresh],
  );

  return <MeContext.Provider value={value}>{children}</MeContext.Provider>;
}

export const useMe = () => useContext(MeContext);
