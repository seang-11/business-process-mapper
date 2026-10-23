import type { ElementRef, ProcessConnection, ProcessStep } from '@/types';
import { appsOf, type Outline, type OutlineItem } from '@/lib/walkthrough';

const isApp = (e: ElementRef | null | undefined): boolean => e?.actorClass === 'System';

export const AUTOMATED_ROLE = 'automated';
export const UNASSIGNED_ROLE = 'unassigned';

/** Whose lane a step is in: a person or role by id, or one shared key for apps. */
export function roleKeyOf(step: ProcessStep): string {
  const p = step.performedBy;
  if (!p) return UNASSIGNED_ROLE;
  return isApp(p) ? AUTOMATED_ROLE : p.id;
}

export interface RoleOption {
  key: string;
  name: string;
  ref: ElementRef | null;
  stepCount: number;
  /** The tools involved in this role's steps. */
  apps: ElementRef[];
  automated: boolean;
}

/** Everyone who does something in the process, humans first. */
export function rolesOf(outline: Outline): RoleOption[] {
  const map = new Map<string, RoleOption>();
  for (const it of outline.items) {
    const s = it.step;
    const key = roleKeyOf(s);
    let role = map.get(key);
    if (!role) {
      const special = key === AUTOMATED_ROLE || key === UNASSIGNED_ROLE;
      role = {
        key,
        name: key === AUTOMATED_ROLE ? 'Automated' : key === UNASSIGNED_ROLE ? 'Unassigned' : s.performedBy!.name,
        ref: special ? null : s.performedBy,
        stepCount: 0,
        apps: [],
        automated: key === AUTOMATED_ROLE,
      };
      map.set(key, role);
    }
    role.stepCount += 1;
    for (const a of appsOf(s)) if (!role.apps.some((x) => x.id === a.id)) role.apps.push(a);
  }
  const weight = (r: RoleOption) => (r.key === AUTOMATED_ROLE ? 1 : r.key === UNASSIGNED_ROLE ? 2 : 0);
  return [...map.values()].sort((a, b) => weight(a) - weight(b));
}

/** Where a step's work goes next. */
export interface Hop {
  stepId: string;
  title: string;
  who: string;
  automated: boolean;
  label: string;
}

export interface LessonStep {
  item: OutlineItem;
  title: string;
  /** What has to happen before this step starts. */
  trigger: string;
  does: { id: string; text: string; app: ElementRef | null }[];
  apps: ElementRef[];
  receives: ElementRef[];
  produces: ElementRef[];
  goesTo: Hop[];
}

export interface Colleague {
  key: string;
  name: string;
  ref: ElementRef | null;
  /** They hand work to this role. */
  gives: boolean;
  /** This role hands work to them. */
  gets: boolean;
}

export interface Lesson {
  role: RoleOption;
  steps: LessonStep[];
  totalSteps: number;
  tools: ElementRef[];
  worksWith: Colleague[];
}

const whoName = (s: ProcessStep) => s.performedBy?.name ?? 'Nobody yet';
const titleOf = (s: ProcessStep) => s.walkthroughLine.trim() || s.title;

export function buildLesson(
  role: RoleOption,
  outline: Outline,
  connections: ProcessConnection[],
): Lesson {
  const edges = connections.filter((c) => outline.byId.has(c.fromStepId) && outline.byId.has(c.toStepId));
  const mine = outline.items.filter((it) => roleKeyOf(it.step) === role.key);
  const colleagues = new Map<string, Colleague>();

  const note = (step: ProcessStep, direction: 'gives' | 'gets') => {
    const key = roleKeyOf(step);
    if (key === role.key) return;
    const c = colleagues.get(key) ?? {
      key,
      name: key === AUTOMATED_ROLE ? whoName(step) : key === UNASSIGNED_ROLE ? 'Nobody yet' : whoName(step),
      ref: step.performedBy,
      gives: false,
      gets: false,
    };
    c[direction] = true;
    colleagues.set(key, c);
  };

  const steps: LessonStep[] = mine.map((it) => {
    const s = it.step;

    const incoming = edges.filter((c) => c.toStepId === s.id);
    const parts = [
      ...new Set(
        incoming.map((c) => {
          const from = outline.byId.get(c.fromStepId)!.step;
          note(from, 'gives');
          if (from.stepType === 'Wait') return `the wait "${from.title}" ends`;
          if (from.stepType === 'Decision') {
            return `${whoName(from)} decides "${from.title}"${c.label ? ` and the answer is ${c.label.toLowerCase()}` : ''}`;
          }
          return `${whoName(from)} finishes "${from.title}"`;
        }),
      ),
    ];
    const trigger = parts.length ? `Starts when ${parts.join(' or ')}.` : 'This is where the process starts.';

    const goesTo: Hop[] = edges
      .filter((c) => c.fromStepId === s.id)
      .map((c) => {
        const to = outline.byId.get(c.toStepId)!.step;
        note(to, 'gets');
        return {
          stepId: to.id,
          title: titleOf(to),
          who: whoName(to),
          automated: isApp(to.performedBy),
          label: c.label,
        };
      });

    const apps = appsOf(s);
    const appById = new Map(apps.map((a) => [a.id, a]));
    const does = s.checklist.map((c) => ({
      id: c.id,
      text: c.text,
      app: (c.appId && appById.get(c.appId)) || null,
    }));

    return {
      item: it,
      title: titleOf(s),
      trigger,
      does,
      apps,
      receives: it.needs,
      produces: s.produces,
      goesTo,
    };
  });

  return {
    role,
    steps,
    totalSteps: outline.items.length,
    tools: role.apps,
    worksWith: [...colleagues.values()],
  };
}

/** One line in the story of the process. */
export interface StoryStep {
  id: string;
  /** Position in the whole process, matching the bar at the top. */
  number: number;
  text: string;
  kind: 'do' | 'choice' | 'wait';
}

/**
 * A stretch of the process where one role has the work. A new stage starts
 * whenever the work passes to someone else, or goes down another branch.
 */
export interface Stage {
  id: string;
  roleKey: string;
  roleName: string;
  automated: boolean;
  /** "If employee": the path this stage belongs to, when the process splits. */
  branch: string | null;
  steps: StoryStep[];
  tools: ElementRef[];
}

/** The whole process as a short story, stage by stage, with who has the work at each point. */
export function buildStory(outline: Outline): Stage[] {
  const stages: Stage[] = [];
  for (const it of outline.items) {
    const s = it.step;
    const key = roleKeyOf(s);
    const branch = it.branch?.label ?? null;

    let stage = stages[stages.length - 1];
    if (!stage || stage.roleKey !== key || stage.branch !== branch) {
      stage = {
        id: `${stages.length}-${key}`,
        roleKey: key,
        roleName:
          key === AUTOMATED_ROLE ? 'Happens automatically' : key === UNASSIGNED_ROLE ? 'Nobody yet' : s.performedBy!.name,
        automated: key === AUTOMATED_ROLE,
        branch,
        steps: [],
        tools: [],
      };
      stages.push(stage);
    }

    stage.steps.push({
      id: s.id,
      number: it.number,
      text: titleOf(s),
      kind: s.stepType === 'Decision' ? 'choice' : s.stepType === 'Wait' ? 'wait' : 'do',
    });
    for (const a of appsOf(s)) if (!stage.tools.some((t) => t.id === a.id)) stage.tools.push(a);
  }
  return stages;
}
