// Per-role demand index: how many real postings mention each skill, by target role.
//
// Source of numbers (trust rule): counts come from counting live postings in
// scripts/build-demand.js, never from the LLM. This module only READS the committed
// index and annotates skills with it. It must never throw — a missing/corrupt file
// degrades to an empty index so the tool still works offline.
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const DATA_PATH = join(HERE, '..', 'data', 'demand.json');
const FALLBACK_PATH = join(HERE, '..', 'seed', 'demand.fallback.json');

// Cache the parsed index for the process; both files are small and regenerated out-of-band.
let _index = null;

function round(n) {
  return Math.round(n);
}

function loadRaw() {
  if (_index) return _index;
  // Prefer the regenerable data/ index; fall back to the committed seed so offline works.
  for (const path of [DATA_PATH, FALLBACK_PATH]) {
    try {
      const parsed = JSON.parse(readFileSync(path, 'utf8'));
      if (parsed && typeof parsed === 'object' && parsed.roles) {
        _index = parsed;
        return _index;
      }
    } catch {
      /* missing or corrupt: try the next source */
    }
  }
  // Nothing usable: honest empty index.
  _index = { generatedAt: null, roles: {} };
  return _index;
}

/** For tests / builders: drop the cached index so a freshly written file is picked up. */
export function _resetDemand() {
  _index = null;
}

/**
 * Demand index for a single role.
 * @param {string} role one of swe|ml|data|systems|frontend|embedded
 * @returns {{role:string, totalPostings:number, generatedAt:string|null, counts:Object}}
 *          counts: { [skillId]: {count, pct, postingIds[]} }. Never throws.
 */
export function getDemandIndex(role) {
  const raw = loadRaw();
  const r = String(role || '').trim();
  const bucket = (raw.roles && raw.roles[r]) || null;
  const totalPostings = bucket?.totalPostings || 0;
  const counts = bucket?.counts || {};
  return {
    role: r,
    totalPostings,
    generatedAt: raw.generatedAt || null,
    counts,
  };
}

/**
 * Annotate each skill with its demand for `role` and sort by demand desc, then name asc.
 * A skill absent from the index gets {count:0, totalPostings, pct:0} — never undefined.
 * Non-mutating: returns new skill objects.
 * @param {Array} skills skills from extractSkills (or any object with id/name)
 * @param {string} role
 */
export function rankSkillsByDemand(skills, role) {
  const { totalPostings, counts } = getDemandIndex(role);
  const annotated = (skills || []).map((s) => {
    const entry = counts[s.id];
    const count = entry?.count || 0;
    const pct = totalPostings > 0 ? round((count / totalPostings) * 100) : 0;
    return { ...s, demand: { count, totalPostings, pct } };
  });
  annotated.sort((a, b) => {
    if (b.demand.pct !== a.demand.pct) return b.demand.pct - a.demand.pct;
    if (b.demand.count !== a.demand.count) return b.demand.count - a.demand.count;
    return String(a.name).localeCompare(String(b.name));
  });
  return annotated;
}
