// Curated list of ~10 recognizable tech companies that expose a PUBLIC ATS board
// (Greenhouse / Lever / Ashby — no key, no login). Verified reachable via
// scripts/probe-companies.js on 2026-10-16; companies on Workday (Nvidia, DoorDash,
// Snowflake, Netflix, Plaid) have no public board API and are intentionally excluded.
//
// Each entry: { id, name, boards:[{type, slug}] }. A company can have multiple boards.
export const COMPANIES = [
  { id: 'stripe', name: 'Stripe', boards: [{ type: 'greenhouse', slug: 'stripe' }] },
  { id: 'databricks', name: 'Databricks', boards: [{ type: 'greenhouse', slug: 'databricks' }] },
  { id: 'palantir', name: 'Palantir', boards: [{ type: 'lever', slug: 'palantir' }] },
  { id: 'coinbase', name: 'Coinbase', boards: [{ type: 'greenhouse', slug: 'coinbase' }] },
  { id: 'lyft', name: 'Lyft', boards: [{ type: 'greenhouse', slug: 'lyft' }] },
  { id: 'pinterest', name: 'Pinterest', boards: [{ type: 'greenhouse', slug: 'pinterest' }] },
  { id: 'figma', name: 'Figma', boards: [{ type: 'greenhouse', slug: 'figma' }] },
  { id: 'datadog', name: 'Datadog', boards: [{ type: 'greenhouse', slug: 'datadog' }] },
  { id: 'ramp', name: 'Ramp', boards: [{ type: 'ashby', slug: 'ramp' }] },
  { id: 'openai', name: 'OpenAI', boards: [{ type: 'ashby', slug: 'openai' }] },
];

const BY_ID = new Map(COMPANIES.map((c) => [c.id, c]));

/** Public list for the dropdown: {id, name} only (boards are an internal detail). */
export function listCompanies() {
  return COMPANIES.map(({ id, name }) => ({ id, name }));
}

/** Full entry (with boards) or null. */
export function getCompany(id) {
  return BY_ID.get(String(id || '').toLowerCase().trim()) || null;
}
