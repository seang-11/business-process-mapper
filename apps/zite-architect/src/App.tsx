import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { useAuth } from '@project/components/lib/legacyAuth';
import { Toaster } from '@project/components/ui/sonner';
import WorkspaceList from '@/components/WorkspaceList';
import ProcessCanvas from '@/components/ProcessCanvas';
import ElementDetail from '@/components/ElementDetail';
import WorkWithDan from '@/components/WorkWithDan';

export default function App() {
  const { user, isLoading } = useAuth();

  if (isLoading || !user) {
    return (
      <div className="h-screen flex items-center justify-center">
        <div className="animate-pulse text-muted-foreground text-sm">Loading…</div>
      </div>
    );
  }

  return (
    <BrowserRouter>
      <Toaster />
      <Routes>
        <Route path="/" element={<WorkspaceList />} />
        <Route path="/process/:id" element={<ProcessCanvas />} />
        <Route path="/element/:id" element={<ElementDetail />} />
      </Routes>
      {/* Outside Routes so it is present on every screen. */}
      <WorkWithDan />
    </BrowserRouter>
  );
}
