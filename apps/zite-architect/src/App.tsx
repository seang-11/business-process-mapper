import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { useEffect } from 'react';
import { useAuth, loginWithRedirect } from 'zitejs/auth';
import { Toaster } from '@project/components/ui/sonner';
import WorkspaceList from '@/components/WorkspaceList';
import ProcessCanvas from '@/components/ProcessCanvas';
import ElementDetail from '@/components/ElementDetail';
import AppShell from '@/components/AppShell';
import TrainingHome from '@/components/TrainingHome';
import TeamAccess from '@/components/TeamAccess';
import NotFound from '@/components/NotFound';
import Brain from '@/components/Brain';
import Roles from '@/components/Roles';
import Insights from '@/components/Insights';
import RoleBrief from '@/components/RoleBrief';
import SharedProcess from '@/components/SharedProcess';
import { MeProvider } from '@/lib/me';

/**
 * A share link opens without signing in, so it is decided before anything that
 * checks who you are. It renders one page and nothing else from the app.
 */
export default function App() {
  if (window.location.pathname.startsWith('/share/')) {
    return (
      <BrowserRouter>
        <Toaster />
        <Routes>
          <Route path="/share/:token" element={<SharedProcess />} />
        </Routes>
      </BrowserRouter>
    );
  }
  return <MemberApp />;
}

function MemberApp() {
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
            <Route path="/brain" element={<Brain />} />
            <Route path="/insights" element={<Insights />} />
            <Route path="/roles" element={<Roles />} />
            <Route path="/roles/:id" element={<RoleBrief />} />
            <Route path="/training" element={<TrainingHome />} />
            <Route path="/team" element={<TeamAccess />} />
            <Route path="/process/:id" element={<ProcessCanvas />} />
            <Route path="/element/:id" element={<ElementDetail />} />
            <Route path="*" element={<NotFound />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </MeProvider>
  );
}
