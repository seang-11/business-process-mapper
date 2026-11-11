// This app is a public showcase: the owner's personal name never leaves the server.
const swaps: [RegExp, string][] = [
  [/sean@prospectautomations\.com/gi, 'founder@example.com'],
  [/\bSean Grady\b/g, 'Founder'],
  [/\bGrady\b/g, ''],
  [/\bSean\b/g, 'Founder'],
];

function scrub<T>(v: T): T {
  if (typeof v === 'string') {
    let s: string = v;
    for (const [re, to] of swaps) s = s.replace(re, to);
    return s as T;
  }
  if (Array.isArray(v)) return v.map(scrub) as T;
  if (v && typeof v === 'object' && !(v instanceof Date)) {
    return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, scrub(x)])) as T;
  }
  return v;
}

/** Wraps an endpoint's execute so everything it returns has the owner's name replaced. */
export function scrubbed<F extends (...a: any[]) => Promise<any>>(f: F): F {
  return (async (...a: any[]) => scrub(await f(...a))) as F;
}
