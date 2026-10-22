export interface Link {
  from: string;
  to: string;
}

/** Why one step can't be joined to another, or null when it can. Closing a loop is fine. */
export function connectProblem(links: Link[], from: string, to: string): string | null {
  if (from === to) return "A step can't connect to itself.";
  if (links.some((l) => l.from === from && l.to === to)) return 'Those two steps are already connected.';
  return null;
}

/** How many separate pieces the steps fall into when arrows are read either way round. */
function pieceCount(stepIds: string[], links: Link[]): number {
  const parent = new Map(stepIds.map((id) => [id, id]));
  const find = (x: string): string => {
    let r = x;
    while (parent.get(r) !== r) r = parent.get(r)!;
    return r;
  };
  for (const l of links) {
    if (parent.has(l.from) && parent.has(l.to)) parent.set(find(l.from), find(l.to));
  }
  return new Set(stepIds.map(find)).size;
}

/** True when taking one arrow away would cut the process into separate pieces. */
export function removalSplitsFlow(stepIds: string[], links: Link[], at: number): boolean {
  return pieceCount(stepIds, links.filter((_, i) => i !== at)) > pieceCount(stepIds, links);
}
