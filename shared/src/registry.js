// Company registry: company name -> public ATS board(s).
// Data lives in shared/data/companies.json and is produced by scripts/verify-registry.js,
// which only keeps boards that answered HTTP 200 with at least one job.
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
export const COMPANIES_PATH = join(HERE, '..', 'data', 'companies.json');

let _data = null;
let _index = null;

const SUFFIXES = /\b(inc|incorporated|llc|ltd|limited|corp|corporation|co|company|plc|gmbh|technologies|technology|labs|hq|the)\b/g;

/** Normalize a company name for lookup: lowercase, drop punctuation and legal suffixes. */
export function normalizeCompanyName(name) {
  return String(name || '')
    .toLowerCase()
    .normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .replace(/&/g, ' and ')
    .replace(/\.(com|io|ai|co|dev|app)\b/g, ' $1')
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(SUFFIXES, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function compact(s) {
  return normalizeCompanyName(s).replace(/ /g, '');
}

function load() {
  if (_data) return _data;
  try {
    _data = JSON.parse(readFileSync(COMPANIES_PATH, 'utf8'));
  } catch {
    _data = { companies: [] };
  }
  _index = new Map();
  const add = (key, c) => {
    const k = compact(key);
    if (k && !_index.has(k)) _index.set(k, c);
  };
  // Pass 1: names and slugs win over aliases/board slugs.
  for (const c of _data.companies) { add(c.name, c); add(c.slug, c); }
  for (const c of _data.companies) {
    for (const a of c.aliases || []) add(a, c);
    for (const b of c.boards || []) add(b.slug, c);
  }
  return _data;
}

function levenshtein(a, b) {
  if (a === b) return 0;
  const m = a.length, n = b.length;
  if (!m) return n;
  if (!n) return m;
  let prev = Array.from({ length: n + 1 }, (_, i) => i);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[n];
}

/**
 * Resolve a free-text company name to a registry entry.
 * Order: exact (name/slug/alias/board slug, normalized) -> prefix -> edit distance <= 1 (len >= 5).
 * @param {string} name
 * @returns {{name:string, slug:string, boards:{type:string, slug:string, jobCount?:number}[], aliases:string[]} | null}
 */
export function resolveCompany(name) {
  load();
  const k = compact(name);
  if (!k) return null;
  if (_index.has(k)) return _index.get(k);
  // Conservative prefix match: "scale" -> "scaleai" (<= 3 extra chars), or the input is a
  // longer phrase starting with a known name ("stripe payments" -> "stripe").
  // "meta" must NOT resolve to "metabase", hence the small length budget.
  if (k.length >= 4) {
    const candidates = [];
    for (const [key, c] of _index) {
      const extendsInput = key.startsWith(k) && key.length - k.length <= 3;
      const inputExtends = k.startsWith(key) && key.length >= 5;
      if (extendsInput || inputExtends) candidates.push([key, c]);
    }
    if (candidates.length) {
      candidates.sort((a, b) => Math.abs(a[0].length - k.length) - Math.abs(b[0].length - k.length));
      return candidates[0][1];
    }
  }
  if (k.length >= 5) {
    let best = null, bestD = 2;
    for (const [key, c] of _index) {
      if (Math.abs(key.length - k.length) > 1) continue;
      const d = levenshtein(k, key);
      if (d < bestD) { best = c; bestD = d; }
    }
    if (best) return best;
  }
  return null;
}

/** All registry entries (array, sorted by name). */
export function listCompanies() {
  return [...load().companies].sort((a, b) => a.name.localeCompare(b.name));
}

/** Registry entry owning a given board, or null. */
export function findCompanyByBoard(type, slug) {
  const s = String(slug || '').toLowerCase();
  return load().companies.find((c) => (c.boards || []).some((b) => b.type === type && b.slug.toLowerCase() === s)) || null;
}

/** Registry metadata ({generatedAt, verifiedCount, candidateCount}). */
export function registryInfo() {
  const d = load();
  return { generatedAt: d.generatedAt || null, verifiedCount: d.companies.length, candidateCount: d.candidateCount ?? null };
}

/** For tests: reset the in-memory index (e.g. after rewriting companies.json). */
export function _resetRegistry() {
  _data = null;
  _index = null;
}
