import { useNavigate } from 'react-router-dom';
import { Compass } from 'lucide-react';
import { Button } from '@project/components/ui/button';
import { PageEmpty } from './PageState';

/** Shown for any address the app does not have. */
export default function NotFound() {
  const navigate = useNavigate();
  return (
    <div className="mx-auto max-w-xl px-8 py-16">
      <PageEmpty
        icon={<Compass className="h-6 w-6" />}
        title="We can't find that page"
        text="The link may be old, or the process may have been removed."
        action={<Button onClick={() => navigate('/')}>Go Home</Button>}
      />
    </div>
  );
}
