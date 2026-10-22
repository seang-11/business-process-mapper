import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getProcesses, GetProcessesOutputType } from 'zitejs/api';
import { Skeleton } from '@project/components/ui/skeleton';
import ProcessCards from './ProcessCards';

type ProcessRow = GetProcessesOutputType['processes'][number];

/** Everyone's way in to learning: pick a live process and start training on it. */
export default function TrainingHome() {
  const navigate = useNavigate();
  const [processes, setProcesses] = useState<ProcessRow[] | null>(null);

  useEffect(() => {
    getProcesses({})
      .then((r) => setProcesses(r.processes))
      .catch(() => setProcesses([]));
  }, []);

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
        {processes === null ? (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-56 rounded-2xl" />
            ))}
          </div>
        ) : learnable.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-border bg-card/60 px-6 py-14 text-center text-sm text-muted-foreground">
            Nothing to train on yet. Training appears once a process is live.
          </p>
        ) : (
          <ProcessCards processes={learnable} onOpen={train} onTrain={train} />
        )}
      </div>
    </div>
  );
}
