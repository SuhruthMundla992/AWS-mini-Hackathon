// Live company-specific skill demand.
//
// Flow: fetch the chosen company's public board(s) live, filter postings to the chosen
// employment type (intern vs full-time) and role function (SWE, ML, ...), then count how
// many of those postings mention each canonical skill. Those counts — real, from this
// company's live postings — are what rank the skills the student should put on a resume.
//
// Trust rule unchanged: numbers come from counting postings, never the LLM.
// Offline/robustness: board failures are tolerated; if nothing can be fetched at all we fall
// back to the committed market demand index so the tool still answers.
import { fetchBoard } from '../../shared/src/fetchers.js';
import { getCompany } from './companies.js';
import { skillHits } from './skills.js';
import { ROLES } from './skills.data.js';
import { getDemandIndex } from './demand.js';

const SAMPLE_CAP = 4; // sample postings kept per skill (for the "why" explanation)

const INTERN_RE = /\b(intern|internship|co-?op|co op)\b/i;

export const EMPLOYMENT_TYPES = {
  intern: 'Internship',
  fulltime: 'Full-time',
};

// Title-keyword role classifiers (same taxonomy as scripts/build-demand.js).
const ROLE_KEYWORDS = {
  swe: [/software\s+engineer/i, /\bswe\b/i, /software\s+developer/i, /full[-\s]?stack/i, /application\s+(developer|engineer)/i, /\bprogrammer\b/i, /\bsoftware\b/i],
  ml: [/machine\s+learning/i, /\bml\b/i, /\bai\b/i, /deep\s+learning/i, /applied\s+scientist/i, /research\s+scientist/i, /\bnlp\b/i, /computer\s+vision/i, /\bgenai\b/i, /generative\s+ai/i],
  data: [/data\s+engineer/i, /data\s+scientist/i, /data\s+analyst/i, /\banalytics\b/i, /business\s+intelligence/i, /data\s+platform/i],
  systems: [/back[-\s]?end/i, /\binfrastructure\b/i, /\bplatform\b/i, /\bsystems?\b/i, /\bdevops\b/i, /\bsre\b/i, /site\s+reliability/i, /\bdistributed\b/i, /\bcloud\b/i, /\bkernel\b/i, /\bnetwork(ing)?\b/i],
  frontend: [/front[-\s]?end/i, /\bui\b/i, /\bux\b/i, /\bweb\b/i, /\breact\b/i, /\bios\b/i, /\bandroid\b/i, /\bmobile\b/i],
  embedded: [/\bembedded\b/i, /\bfirmware\b/i, /\bhardware\b/i, /\bfpga\b/i, /\basic\b/i, /\belectrical\b/i, /\brtl\b/i, /\bsilicon\b/i, /\brobotics?\b/i],
};

function matchesRole(title, role) {
  if (!role || !ROLE_KEYWORDS[role]) return true; // no role filter
  return ROLE_KEYWORDS[role].some((re) => re.test(String(title || '')));
}

function matchesEmployment(title, employment) {
  const t = String(title || '');
  if (employment === 'intern') return INTERN_RE.test(t);
  if (employment === 'fulltime') return !INTERN_RE.test(t);
  return true; // any
}

function round(n) { return Math.round(n); }

function scopeLabel({ company, role, employment }) {
  const emp = employment === 'intern' ? 'intern' : employment === 'fulltime' ? 'full-time' : '';
  const roleLabel = role && ROLES[role] ? ROLES[role] : '';
  const bits = [emp, roleLabel].filter(Boolean).join(' ');
  return `${bits ? bits + ' ' : ''}roles at ${company?.name || 'this company'}`;
}

/**
 * Fetch + filter + count. Returns the company-specific demand index.
 * @param {{companyId:string, role?:string, employment?:string}} opts
 * @returns {Promise<{company, totalPostings, totalScanned, counts, scopeLabel, source, fellBack}>}
 *   counts: { [skillId]: {count, pct, postingIds[]} }
 *   source: 'live' | 'market'   fellBack: null | 'employment' | 'role' | 'all' | 'market'
 */
export async function companyDemand({ companyId, role, employment } = {}) {
  const company = getCompany(companyId);
  if (!company) {
    const err = new Error(`Unknown company: ${companyId}`);
    err.code = 'UNKNOWN_COMPANY';
    throw err;
  }

  // Fetch all boards; tolerate per-board failures.
  const results = await Promise.all(
    company.boards.map((b) => fetchBoard(b, { timeoutMs: 10_000, retries: 1 }).catch(() => [])),
  );
  const all = results.flat();

  // Could not fetch anything (network down / all boards failed): fall back to market index.
  if (all.length === 0) {
    const market = getDemandIndex(role);
    return {
      company: { id: company.id, name: company.name },
      totalPostings: market.totalPostings,
      totalScanned: 0,
      counts: market.counts,
      scopeLabel: `${role && ROLES[role] ? ROLES[role] + ' ' : ''}roles (market data — ${company.name}'s board was unreachable)`,
      source: 'market',
      fellBack: 'market',
    };
  }

  // Primary filter: role + employment.
  let used = all.filter((p) => matchesEmployment(p.title, employment) && matchesRole(p.title, role));
  let fellBack = null;

  // Graceful relaxation when the exact slice is empty (e.g. no intern SWE open right now).
  if (used.length === 0) {
    const roleOnly = all.filter((p) => matchesRole(p.title, role));
    if (roleOnly.length > 0) {
      used = roleOnly;
      fellBack = 'employment'; // relaxed the intern/full-time filter
    } else {
      used = all;
      fellBack = 'role'; // relaxed role too
    }
  }

  // Count skills over the filtered postings and keep sample postings (title + apply URL) for
  // each skill, so the UI can explain WHY a skill ties to this company with real evidence.
  const counts = {};
  for (const p of used) {
    const posting = { title: p.title, url: p.applyUrl || p.url, location: p.location || null };
    for (const id of skillHits(p.descriptionText || '')) {
      if (!counts[id]) counts[id] = { count: 0, pct: 0, samples: [] };
      counts[id].count++;
      if (counts[id].samples.length < SAMPLE_CAP) counts[id].samples.push(posting);
    }
  }
  for (const id of Object.keys(counts)) {
    counts[id].pct = used.length > 0 ? round((counts[id].count / used.length) * 100) : 0;
  }

  // A capped sample of the matched postings themselves, for the "actual postings" panel.
  const postings = used.slice(0, 30).map((p) => ({
    title: p.title,
    url: p.applyUrl || p.url,
    location: p.location || null,
    team: p.department || p.team || null,
  }));

  return {
    company: { id: company.id, name: company.name },
    totalPostings: used.length,
    totalScanned: all.length,
    counts,
    postings,
    scopeLabel: scopeLabel({ company, role, employment }),
    source: 'live',
    fellBack,
  };
}
