// The core: given a school + selected courses + a company + employment type + role, show the
// skills from those courses that THIS company's matching live postings actually ask for —
// ranked by that company's real demand, each backed by a catalog sentence.
//
// Mapping (course -> skills) is deterministic from catalog text (extractSkills).
// Ranking (which skills matter) is counted from the company's live postings (jobs.js).
// No number comes from the LLM.
import { ROLES } from './skills.data.js';
import { extractSkills } from './skills.js';
import { getSchool, resolveCourses, parseCodeInput } from './catalog.js';
import { companyDemand } from './jobs.js';
import { getCompany } from './companies.js';
import { buildResumeLines } from './resume.js';

const PER_COURSE_CAP = 4;

/** Accept codes as a string blob ("CSCE 313, CSCE 221") or an array of code strings. */
function toCodeList(codes) {
  if (Array.isArray(codes)) return codes.flatMap((c) => parseCodeInput(String(c)));
  return parseCodeInput(String(codes || ''));
}

/** Short, honest explanation of why a skill ties to this company — built only from real data. */
function whyCompany(skill, entry, scope) {
  const company = scope.companyName;
  const scopeLabel = scope.label || 'postings';
  if (!entry || !entry.count) {
    return `None of ${company}'s current ${scopeLabel} mention ${skill.phrase} yet — it's a weaker match for this exact search.`;
  }
  const titles = (entry.samples || []).map((s) => s.title).filter(Boolean);
  const unique = [...new Set(titles)].slice(0, 2);
  const eg = unique.length ? ` — e.g. ${unique.map((t) => `“${t}”`).join(', ')}` : '';
  return `${company} asks for ${skill.phrase} in ${entry.count} of ${scope.totalPostings} ${scopeLabel}${eg}.`;
}

/** Annotate skills with a company-demand index + evidence, sort by pct desc, count desc, name asc. */
function rankByCounts(skills, counts, totalPostings, scope) {
  const annotated = (skills || []).map((s) => {
    const entry = counts[s.id];
    const count = entry?.count || 0;
    const pct = totalPostings > 0 ? Math.round((count / totalPostings) * 100) : 0;
    return {
      ...s,
      demand: { count, totalPostings, pct, samples: entry?.samples || [] },
      whyCompany: whyCompany(s, entry, scope),
    };
  });
  annotated.sort((a, b) => {
    if (b.demand.pct !== a.demand.pct) return b.demand.pct - a.demand.pct;
    if (b.demand.count !== a.demand.count) return b.demand.count - a.demand.count;
    return String(a.name).localeCompare(String(b.name));
  });
  return annotated;
}

/**
 * @param {{schoolId:string, codes:string|string[], companyId:string, role?:string, employment?:string, _demand?:object}} input
 *   _demand: test-only seam — a pre-computed companyDemand() result to avoid network in tests.
 * @returns {Promise<TranslateResult>}
 */
export async function translate({ schoolId, codes, companyId, role, employment, _demand } = {}) {
  const roleKey = ROLES[role] ? role : '';
  const roleLabel = roleKey ? ROLES[roleKey] : null;

  const codeList = toCodeList(codes);
  const school = getSchool(schoolId);
  const { found, unmatched } = resolveCourses(schoolId, codeList);

  // Company-specific demand from live postings (async). jobs.js never throws for a known
  // company; it falls back to market data if the board is unreachable. Tests may inject
  // `_demand` to exercise the pure mapping/ranking logic without touching the network.
  const demand = _demand || (await companyDemand({ companyId, role: roleKey, employment }));

  const courses = found.map((course) => {
    const extracted = extractSkills(course.description || '');

    // Role relevance filter (same as before): keep skills relevant to the role, but if that
    // leaves fewer than two, keep the full set so the card is still useful.
    let candidates = extracted;
    if (roleKey) {
      const relevant = extracted.filter(
        (s) => Array.isArray(s.roles) && (s.roles.includes(roleKey) || s.roles.includes('any')),
      );
      candidates = relevant.length >= 2 ? relevant : extracted;
    }

    const scopeInfo = { companyName: demand.company?.name || 'This company', label: demand.scopeLabel, totalPostings: demand.totalPostings };
    const ranked = rankByCounts(candidates, demand.counts, demand.totalPostings, scopeInfo).slice(0, PER_COURSE_CAP);
    const skills = ranked.map((s) => ({
      id: s.id,
      name: s.name,
      phrase: s.phrase,
      category: s.category,
      evidence: s.evidence,
      demand: s.demand,
      whyCompany: s.whyCompany,
    }));
    return { code: course.code, title: course.title, found: true, skills };
  });

  const company = getCompany(companyId);
  const result = {
    school: {
      schoolId: school?.schoolId || String(schoolId || '').toLowerCase(),
      school: school?.school || null,
      source: school?.source || null,
    },
    company: { id: company?.id || companyId || null, name: demand.company?.name || company?.name || null },
    role: roleKey,
    roleLabel,
    employment: employment || null,
    courses,
    unmatched,
    scope: {
      label: demand.scopeLabel,
      totalPostings: demand.totalPostings,
      totalScanned: demand.totalScanned,
      source: demand.source,
      fellBack: demand.fellBack,
      postings: demand.postings || [],
    },
    resumeLines: { coursework: { text: '', latex: '' }, skills: { text: '', latex: '' } },
    meta: { source: demand.source, llmUsed: false },
  };

  result.resumeLines = buildResumeLines(result);
  return result;
}

/**
 * @typedef {Object} TranslateResult
 * @property {{schoolId,school,source}} school
 * @property {{id,name}} company
 * @property {string} role
 * @property {string|null} roleLabel
 * @property {string|null} employment
 * @property {Array<{code,title,found,skills:Array}>} courses
 * @property {string[]} unmatched
 * @property {{label,totalPostings,totalScanned,source,fellBack}} scope
 * @property {{coursework:{text,latex}, skills:{text,latex}}} resumeLines
 * @property {{source:string, llmUsed:boolean}} meta
 */
