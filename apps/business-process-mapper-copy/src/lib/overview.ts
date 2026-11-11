import type { ElementRef, ProcessStep } from '@/types';
import type { OverviewProc, OverviewStep } from '@/components/ProcessPopup';

/** A step's actor or app, in the shape the overview draws. */
function who(e: ElementRef): OverviewStep['who'] & object {
  return {
    id: e.id,
    name: e.name,
    icon: e.icon,
    image: e.image,
    typeIcon: e.typeIcon,
    color: e.color,
    kind: e.actorClass === 'Human' ? 'person' : e.actorClass === 'System' ? 'app' : 'other',
    typeName: e.typeName,
    humanKind: '',
    party: e.party,
  };
}

/** A team member's own step: not an app, an outside party, a wait or another process. */
const isTeamStep = (s: ProcessStep) =>
  s.performedBy?.actorClass === 'Human' && s.performedBy.party !== 'External' && s.stepType !== 'Wait' && !s.subProcessId;

/** People hours a month for these steps, or null until there are runs and minutes. */
export function hoursFromSteps(steps: ProcessStep[], runsPerMonth: number | null) {
  const minutes = steps.reduce((n, s) => n + (isTeamStep(s) ? s.minutesPerRun ?? 0 : 0), 0);
  return runsPerMonth && minutes ? (minutes * runsPerMonth) / 60 : null;
}

/** The overview for one version of a process, from the steps the process page already has. */
export function overviewFromSteps(
  steps: ProcessStep[],
  meta: { name: string; icon?: string; department: string; description: string; live: boolean; runsPerMonth: number | null; ownerName: string },
): OverviewProc {
  const ordered = [...steps].sort((a, b) => a.sequence - b.sequence);
  let automated = 0;
  let review = 0;
  let manual = 0;
  for (const s of ordered) {
    if (s.stepType === 'Wait') continue;
    if (s.performedBy?.actorClass === 'System') automated += 1;
    else if (s.stepType === 'Decision') review += 1;
    else manual += 1;
  }
  return {
    ...meta,
    stepCount: ordered.length,
    automated,
    review,
    manual,
    runs: [...new Set(ordered.map((s) => s.subProcessId).filter((id): id is string => !!id))].map((processId) => ({ processId })),
    steps: ordered.map((s) => ({
      id: s.id,
      title: s.title,
      stepType: s.stepType,
      automated: s.performedBy?.actorClass === 'System',
      who: s.performedBy ? who(s.performedBy) : null,
      uses: s.uses.map(who),
      minutes: s.minutesPerRun && s.minutesPerRun > 0 ? s.minutesPerRun : null,
      subProcessId: s.subProcessId,
    })),
  };
}
