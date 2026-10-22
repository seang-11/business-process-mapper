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

export interface Brief {
  headline: string;
  summary: string;
  plan: { label: string; text: string }[];
  leaving: string[];
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

const listOf = (titles: string[]) => {
  const q = titles.map((t) => `"${t}"`);
  if (q.length <= 1) return q.join('');
  return `${q.slice(0, -1).join(', ')} and ${q[q.length - 1]}`;
};

/** The one-page handover: what the role owns, how to get someone up to speed, what to confirm on the way out. */
export function buildBrief(lesson: Lesson, processName: string): Brief {
  const { role, steps, tools, totalSteps } = lesson;
  const n = steps.length;
  const titles = steps.map((s) => s.title);
  const toolNames = tools.map((t) => t.name);

  const first = steps[0]?.trigger ?? '';
  const firstLine = first.startsWith('Starts when')
    ? `Your first step starts when${first.slice('Starts when'.length)}`
    : first
    ? 'Your first step is where the process starts.'
    : '';

  const summary = role.automated
    ? `${plural(n, 'step')} of ${totalSteps} in ${processName} run automatically${
        toolNames.length ? `, in ${toolNames.join(', ')}` : ''
      }. ${firstLine}`.trim()
    : `You own ${n} of ${plural(totalSteps, 'step')} in ${processName}: ${listOf(titles)}. ${firstLine}`.trim();

  const half = Math.ceil(n / 2);
  const early = titles.slice(0, half);
  const late = titles.slice(half);

  const plan = role.automated
    ? [
        {
          label: 'Week 1',
          text: `Read ${processName} end to end. Open ${toolNames.length ? toolNames.join(', ') : 'each tool'} and review recent runs of every trigger.`,
        },
        {
          label: 'Week 2',
          text: `Make one small change to ${listOf(early)} with the person who built it.`,
        },
        {
          label: 'Week 3 to 4',
          text: late.length
            ? `Own ${listOf(late)} and any failed runs, with the builder on call.`
            : 'Own changes and failed runs, with the builder on call.',
        },
      ]
    : [
        {
          label: 'Week 1',
          text: `Read ${processName} end to end, then your ${plural(n, 'step')}. Get access to ${
            toolNames.length ? toolNames.join(', ') : 'the tools you need'
          }. Watch one full run from start to finish.`,
        },
        { label: 'Week 2', text: `Do ${listOf(early)} with the person handing over beside you.` },
        {
          label: 'Week 3 to 4',
          text: late.length
            ? `Run ${listOf(late)} yourself, with the previous owner reviewing.`
            : 'Run it on your own, with the previous owner reviewing.',
        },
      ];

  const leaving = role.automated
    ? [
        'Anything only the builder knows about how the agents work',
        `Logins, API keys and connections to transfer${toolNames.length ? `: ${toolNames.join(', ')}` : ''}`,
        'Runs that are failing or half done',
      ]
    : [
        'Anything only you know about these steps',
        `Accounts and logins to transfer${toolNames.length ? `: ${toolNames.join(', ')}` : ''}`,
        'Work in progress that needs a new owner',
      ];

  return {
    headline: `${role.name} in ${processName}`,
    summary,
    plan,
    leaving,
  };
}
