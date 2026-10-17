// Load seeded course catalogs and resolve course codes to catalog entries.
// Catalogs are committed real data under seed/catalogs/<school>.json.
import { readdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const CATALOG_DIR = join(HERE, '..', 'seed', 'catalogs');

let _schools = null;

/** Normalize a course code for matching: uppercase, collapse spaces ("csce313" -> "CSCE 313"). */
export function normCode(code) {
  const raw = String(code || '').toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim();
  // Insert a space between a trailing letter-run and digit-run if the user typed "CSCE313".
  const m = raw.replace(/\s+/g, '').match(/^([A-Z]+)(\d+[A-Z]?)$/);
  if (m) return `${m[1]} ${m[2]}`;
  return raw.replace(/\s+/g, ' ');
}

function load() {
  if (_schools) return _schools;
  _schools = new Map();
  let files = [];
  try {
    files = readdirSync(CATALOG_DIR).filter((f) => f.endsWith('.json'));
  } catch {
    files = [];
  }
  for (const file of files) {
    try {
      const data = JSON.parse(readFileSync(join(CATALOG_DIR, file), 'utf8'));
      const byCode = new Map();
      for (const c of data.courses || []) {
        const nc = normCode(c.code);
        byCode.set(nc, { ...c, normCode: nc, schoolId: data.schoolId });
      }
      _schools.set(data.schoolId, {
        schoolId: data.schoolId,
        school: data.school,
        source: data.source,
        fetchedAt: data.fetchedAt,
        courseCount: byCode.size,
        byCode,
      });
    } catch {
      /* skip malformed catalog */
    }
  }
  return _schools;
}

/** List schools for the dropdown: [{schoolId, school, courseCount, source}]. */
export function listSchools() {
  return [...load().values()]
    .map(({ byCode, ...meta }) => meta)
    .sort((a, b) => a.school.localeCompare(b.school));
}

/** Get a school record or null. */
export function getSchool(schoolId) {
  return load().get(String(schoolId || '').toLowerCase()) || null;
}

/** All courses for a school (for an optional "browse" view). */
export function listCourses(schoolId) {
  const s = getSchool(schoolId);
  return s ? [...s.byCode.values()] : [];
}

/** The level of a course from its number: 313 -> 3, 120 -> 1, 101 -> 1. 0 if no number. */
export function courseLevel(code) {
  const m = String(code || '').match(/(\d{3,})/);
  if (!m) return 0;
  return Math.floor(parseInt(m[1], 10) / 100);
}

/**
 * Courses for a school grouped by level, for the level-separated dropdown.
 * @returns {{school:string|null, schoolId:string, levels:[{level:number,label:string,courses:[{code,title}]}]}}
 */
export function listCoursesByLevel(schoolId) {
  const s = getSchool(schoolId);
  if (!s) return { school: null, schoolId: String(schoolId || '').toLowerCase(), levels: [] };
  const buckets = new Map();
  for (const c of s.byCode.values()) {
    const lvl = courseLevel(c.code);
    if (!buckets.has(lvl)) buckets.set(lvl, []);
    buckets.get(lvl).push({ code: c.code, title: c.title });
  }
  const levels = [...buckets.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([level, courses]) => ({
      level,
      label: level > 0 ? `Level ${level} (${level}00-level)` : 'Other',
      courses: courses.sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true })),
    }));
  return { school: s.school, schoolId: s.schoolId, levels };
}

/**
 * Resolve a list of raw course-code strings against a school.
 * @returns {{found: object[], unmatched: string[]}}
 */
export function resolveCourses(schoolId, codes) {
  const s = getSchool(schoolId);
  const found = [];
  const unmatched = [];
  if (!s) return { found, unmatched: codes.map((c) => String(c).trim()).filter(Boolean) };
  for (const raw of codes) {
    const code = String(raw || '').trim();
    if (!code) continue;
    const course = s.byCode.get(normCode(code));
    if (course) found.push(course);
    else unmatched.push(code);
  }
  return { found, unmatched };
}

/** Split a free-text blob of codes ("CSCE 313, CSCE 221\nMATH 304") into tokens. */
export function parseCodeInput(input) {
  return String(input || '')
    .split(/[,;\n]+|\s{2,}/)
    .map((s) => s.trim())
    .filter(Boolean)
    // Also split single-spaced runs like "CSCE 313 CSCE 221" into pairs.
    .flatMap((chunk) => {
      const parts = chunk.split(/\s+/);
      if (parts.length <= 2) return [chunk];
      const out = [];
      for (let i = 0; i < parts.length; i += 2) out.push(parts.slice(i, i + 2).join(' '));
      return out;
    });
}

export function _reset() { _schools = null; }
