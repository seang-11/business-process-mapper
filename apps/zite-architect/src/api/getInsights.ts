import { z } from 'zod';
import { createEndpoint } from 'zitejs/backend';
import { zite } from 'zitejs/db';

const one = (v?: string | string[]): string | null =>
  (Array.isArray(v) ? v[0] : v) ?? null;
const many = (v?: string | string[]): string[] => (Array.isArray(v) ? v : v ? [v] : []);

const app = z.object({ id: z.string(), name: z.string(), icon: z.string(), image: z.string(), typeIcon: z.string(), color: z.string() });

/**
 * Where the team's time goes. A process's hours are its people steps' minutes,
 * added up, times how often it runs. Both numbers are estimates someone types
 * in, so the page also says how much of the map has them.
 */
export default createEndpoint({
  authenticated: true,
  description: 'Insights: people hours per process and role, share done by apps, hours future versions save, and manual steps ready to automate',
  inputSchema: z.object({}),
  outputSchema: z.object({
    processCount: z.number(),
    /** Steps an app does on its own, out of every step that is not a wait. */
    automatedSteps: z.number(),
    countedSteps: z.number(),
    /** How many processes have a runs-per-month number, and how many people steps have minutes. */
    processesWithRuns: z.number(),
    peopleSteps: z.number(),
    peopleStepsWithMinutes: z.number(),
    futureVersions: z.number(),
    processes: z.array(
      z.object({
        id: z.string(),
        name: z.string(),
        runsPerMonth: z.number().nullable(),
        /** Null until the process has runs per month and at least one step has minutes. */
        hours: z.number().nullable(),
        /** What the newest not-live version would cost, when there is one and it can be worked out. */
        futureHours: z.number().nullable(),
        futureName: z.string(),
      }),
    ),
    roles: z.array(z.object({ id: z.string(), name: z.string(), hours: z.number(), saved: z.number() })),
    ready: z.array(
      z.object({
        stepId: z.string(),
        title: z.string(),
        processId: z.string(),
        processName: z.string(),
        who: z.string(),
        apps: z.array(app),
        minutes: z.number().nullable(),
        hours: z.number().nullable(),
      }),
    ),
  }),
  execute: async () => {
    const [typeRes, elementRes, versionRes, stepRes] = await Promise.all([
      zite.elementTypes.findAll({ limit: 500 }),
      zite.elements.findAll({ limit: 2000 }),
      zite.processVersions.findAll({ limit: 2000 }),
      zite.steps.findAll({ limit: 2000 }),
    ]);

    const empty = {
      processCount: 0, automatedSteps: 0, countedSteps: 0, processesWithRuns: 0,
      peopleSteps: 0, peopleStepsWithMinutes: 0, futureVersions: 0, processes: [], roles: [], ready: [],
    };
    const processType = typeRes.records.find((t) => t.key === 'process');
    if (!processType) return empty;
    const typeById = new Map(typeRes.records.map((t) => [t.id, t]));
    const elementById = new Map(elementRes.records.map((e) => [e.id, e]));
    const classOf = (id: string | null) => {
      const el = id ? elementById.get(id) : undefined;
      const t = el ? one(el.type) : null;
      return (t ? typeById.get(t)?.actorClass : undefined) ?? 'Unassigned';
    };
    const describeApp = (id: string) => {
      const el = elementById.get(id)!;
      const type = typeById.get(one(el.type) ?? '');
      return { id, name: el.name ?? '', icon: el.icon ?? '', image: el.image ?? '', typeIcon: type?.icon ?? '', color: type?.color ?? '' };
    };
    const stepsOf = (versionId: string) =>
      stepRes.records.filter((s) => one(s.version) === versionId).sort((a, b) => (a.sequence ?? 0) - (b.sequence ?? 0));
    // A step someone on the team does. Waiting costs no one time, a sub-process step's time is counted in
    // that process, and a client's or prospect's time is theirs, not the team's.
    const isPeopleStep = (s: (typeof stepRes.records)[number]) => {
      const performer = one(s.performedBy);
      return (
        classOf(performer) === 'Human' &&
        elementById.get(performer!)?.party !== 'External' &&
        s.stepType !== 'Wait' &&
        !one(s.subProcess)
      );
    };
    const hoursOf = (minutes: number, runs: number | null) => (runs ? (minutes * runs) / 60 : 0);

    // Per role: hours now, and in processes that have a future version, hours now and hours then.
    type RoleTally = { hours: number; compared: number; future: number };
    const roleHours = new Map<string, RoleTally>();
    const tally = (id: string) => {
      const r = roleHours.get(id) ?? { hours: 0, compared: 0, future: 0 };
      roleHours.set(id, r);
      return r;
    };
    let automatedSteps = 0, countedSteps = 0, peopleSteps = 0, peopleStepsWithMinutes = 0, futureVersions = 0;
    const ready: {
      stepId: string; title: string; processId: string; processName: string; who: string;
      apps: z.infer<typeof app>[]; minutes: number | null; hours: number | null;
    }[] = [];

    const processes = elementRes.records
      .filter((e) => one(e.type) === processType.id)
      .map((p) => {
        const versions = versionRes.records.filter((v) => one(v.process) === p.id);
        const live =
          versions.find((v) => v.state === 'Current') ??
          versions.filter((v) => v.state !== 'Archived').sort((a, b) => (b.lastEdited ?? '').localeCompare(a.lastEdited ?? ''))[0];
        const future = versions
          .filter((v) => v.state === 'Future' && v.id !== live?.id)
          .sort((a, b) => (b.lastEdited ?? '').localeCompare(a.lastEdited ?? ''))[0];
        if (future) futureVersions += 1;
        const runs = p.runsPerMonth && p.runsPerMonth > 0 ? p.runsPerMonth : null;

        let minutes = 0, timed = 0;
        for (const s of live ? stepsOf(live.id) : []) {
          const performer = one(s.performedBy);
          if (s.stepType !== 'Wait') {
            countedSteps += 1;
            if (classOf(performer) === 'System') automatedSteps += 1;
          }
          if (!isPeopleStep(s)) continue;
          peopleSteps += 1;
          const m = s.minutesPerRun && s.minutesPerRun > 0 ? s.minutesPerRun : null;
          if (m) {
            peopleStepsWithMinutes += 1;
            timed += 1;
            minutes += m;
            tally(performer!).hours += hoursOf(m, runs);
          }
          const apps = many(s.uses).filter((u) => classOf(u) === 'System');
          if ((s.stepType ?? 'Task') === 'Task' && apps.length >= 2) {
            ready.push({
              stepId: s.id,
              title: s.title ?? '',
              processId: p.id,
              processName: p.name ?? '',
              who: elementById.get(performer!)?.name ?? '',
              apps: apps.map(describeApp),
              minutes: m,
              hours: m && runs ? hoursOf(m, runs) : null,
            });
          }
        }

        let futureHours: number | null = null;
        if (future && runs && timed) {
          let fm = 0;
          for (const s of stepsOf(future.id)) {
            if (!isPeopleStep(s) || !s.minutesPerRun) continue;
            fm += s.minutesPerRun;
            tally(one(s.performedBy)!).future += hoursOf(s.minutesPerRun, runs);
          }
          futureHours = hoursOf(fm, runs);
          for (const s of live ? stepsOf(live.id) : []) {
            if (isPeopleStep(s) && s.minutesPerRun) tally(one(s.performedBy)!).compared += hoursOf(s.minutesPerRun, runs);
          }
        }

        return {
          id: p.id,
          name: p.name ?? '',
          runsPerMonth: runs,
          hours: runs && timed ? hoursOf(minutes, runs) : null,
          futureHours,
          futureName: future?.name ?? '',
        };
      });

    const roles = [...roleHours]
      .map(([id, r]) => ({ id, name: elementById.get(id)?.name ?? '', hours: r.hours, saved: Math.max(0, r.compared - r.future) }))
      .filter((r) => r.hours > 0);

    return {
      processCount: processes.length,
      automatedSteps,
      countedSteps,
      processesWithRuns: processes.filter((p) => p.runsPerMonth).length,
      peopleSteps,
      peopleStepsWithMinutes,
      futureVersions,
      processes: processes.sort((a, b) => (b.hours ?? -1) - (a.hours ?? -1) || a.name.localeCompare(b.name)),
      roles: roles.sort((a, b) => b.hours - a.hours),
      ready: ready.sort((a, b) => (b.hours ?? -1) - (a.hours ?? -1) || b.apps.length - a.apps.length),
    };
  },
});
