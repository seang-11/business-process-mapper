/** An element as it appears attached to a step — enough to render a node without a second lookup. */
export interface ElementRef {
  id: string;
  name: string;
  typeName: string;
  /** An uploaded picture, which beats the icon. */
  image: string;
  /** The element's own icon, if it has one. */
  icon: string;
  /** Its type's icon, used when it doesn't. */
  typeIcon: string;
  color: string;
  actorClass: string;
  party: string;
}

export interface ChecklistItem {
  id: string;
  text: string;
  /** The app this item is done in, if any: one of the step's apps. */
  appId?: string;
}

export interface ProcessStep {
  id: string;
  title: string;
  description: string;
  stepType: string;
  sequence: number;
  /** Exactly one actor. Lanes depend on this being singular. */
  performedBy: ElementRef | null;
  uses: ElementRef[];
  produces: ElementRef[];
  subProcessId: string | null;
  subProcessName: string;
  checklist: ChecklistItem[];
  /** Optional wording for the walkthrough; the title is used when empty. */
  walkthroughLine: string;
}

export interface ProcessConnection {
  id: string;
  fromStepId: string;
  toStepId: string;
  label: string;
  condition: string;
}

/** Loops are derived from back-edges in the graph rather than stored. */
export interface ProcessLoop {
  id: string;
  name: string;
  stepIds: string[];
  reentryStepId: string;
}

export interface ProcessGraph {
  steps: ProcessStep[];
  connections: ProcessConnection[];
}

export interface ElementType {
  id: string;
  name: string;
  /** Stable machine name. Logic keys off this, never off `name` or `id`. */
  key: string;
  /** 'Individual' | 'Position' | 'Group' for human types; '' otherwise. */
  humanKind: string;
  description: string;
  icon: string;
  color: string;
  categories: string[];
  actorClass: string;
  builtIn: boolean;
  sortOrder: number;
}

export interface ElementSummary {
  id: string;
  name: string;
  description: string;
  /** The element's own icon: a lucide name or `logo:<brand>`. Empty = automatic. */
  icon: string;
  /** An uploaded picture, which beats the icon. */
  image: string;
  typeId: string | null;
  typeName: string;
  typeKey: string;
  typeHumanKind: string;
  typeIcon: string;
  typeColor: string;
  categories: string[];
  actorClass: string;
  party: string;
  status: string;
  ownerId: string | null;
  ownerName: string;
  /** Steps that touch this element in any capacity. */
  usageCount: number;
  /** Other elements naming this one as their owner. */
  ownsCount: number;
}
