import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getProcesses, GetProcessesOutputType } from 'zitejs/api';
import { GraduationCap } from 'lucide-react';
import { PageEmpty, PageError, PageLoading } from './PageState';
import ProcessCards from './ProcessCards';

type ProcessRow = GetProcessesOutputType['processes'][number];

/** Everyone's way in to learning: pick a live process and start training on it. */
export default function TrainingHome() {
  const navigate = useNavigate();
  const [processes, setProcesses] = useState<ProcessRow[] | null>(null);
  const [failed, setFailed] = useState(false);

  const load = useCallback(() => {
    setFailed(false);
    getProcesses({})
      .then((r) => setProcesses(r.processes))
      .catch(() => setFailed(true));
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  // Training teaches the live version, so only live processes with steps are offered.
  const learnable = useMemo(
    () => (processes ?? []).filter((p) => p.versions.some((v) => v.state === 'Current') && p.stepCount > 0),
    [processes],
  );
  const train = (id: string) => navigate(`/process/${id}?train=all&view=process`);

  return (
    <div className="mx-auto max-w-[1100px] px-8 py-8">
      <h1 className="text-3xl font-semibold tracking-tight">Training</h1>
      <p className="mt-1.5 max-w-2xl text-sm text-muted-foreground">
        Pick a process to learn how it works today, then pick your role to see exactly what you do.
      </p>
      <div className="mt-7">
        {failed ? (
          <PageError onRetry={load} />
        ) : processes === null ? (
          <PageLoading blocks={2} height="h-48" />
        ) : learnable.length === 0 ? (
          <PageEmpty
            icon={<GraduationCap className="h-6 w-6" />}
            title="Nothing to train on yet"
            text="Training appears here once a process is live. Ask an editor to make a version live."
          />
        ) : (
          <ProcessCards processes={learnable} onOpen={train} onTrain={train} />
        )}
      </div>
    </div>
  );
}
