import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { useEffect } from 'react';
import { useAuth, loginWithRedirect } from 'zitejs/auth';
import { Toaster } from '@project/components/ui/sonner';
import WorkspaceList from '@/components/WorkspaceList';
import ProcessCanvas from '@/components/ProcessCanvas';
import ElementDetail from '@/components/ElementDetail';
import AppShell from '@/components/AppShell';
import { MeProvider } from '@/lib/me';

export default function App() {
  const { user, isLoading } = useAuth();

  useEffect(() => {
    if (!isLoading && !user) loginWithRedirect();
  }, [isLoading, user]);

  if (isLoading || !user) {
    return (
      <div className="h-screen flex items-center justify-center">
        <div className="animate-pulse text-muted-foreground text-sm">Loading…</div>
      </div>
    );
  }

  return (
    <MeProvider>
      <BrowserRouter>
        <Toaster />
        <Routes>
          <Route element={<AppShell />}>
            <Route path="/" element={<WorkspaceList />} />
            <Route path="/process/:id" element={<ProcessCanvas />} />
            <Route path="/element/:id" element={<ElementDetail />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </MeProvider>
  );
}
