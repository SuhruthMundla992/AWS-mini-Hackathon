// Skill matcher: given catalog text, find canonical skills whose name/alias actually
// appears in the text, and return the evidence sentence for each.
//
// Matching discipline (so we never claim a course "probably" covers something):
//   - A skill is emitted ONLY if one of its aliases appears in the text.
//   - Ambiguous short tokens (C, R, Go, AI, ML, CV, NLP, OS, OOP, C++, C#) must appear as
//     an EXACT-CASE standalone token, so "a good fit" never matches "Go", "can" never
//     matches "C", "html" never matches "ML".
//   - Longer alphabetic aliases match case-insensitively on word boundaries.
//   - Symbol aliases (c++, c#) match literally, case-insensitively.
import { SKILLS, SKILL_BY_ID, CASE_SENSITIVE } from './skills.data.js';
import { splitSentences, escapeRegex } from '../../shared/src/text.js';

// Pre-compile one matcher per alias.
const MATCHERS = [];
for (const skill of SKILLS) {
  for (const alias of skill.aliases) {
    MATCHERS.push({ skill, alias, test: buildTester(alias) });
  }
}

function buildTester(alias) {
  const hasSymbol = /[^a-z0-9 ]/i.test(alias);
  const caseSensitive = CASE_SENSITIVE.has(alias);

  if (caseSensitive) {
    // Exact case, standalone token. Allow trailing symbols for C++/C#, otherwise word boundary.
    const esc = escapeRegex(alias);
    // (^|non-word-char) alias (non-word-char|$). For symbol-containing (C++, C#) the symbol
    // itself is the right boundary, so just require a left boundary and a right non-alnum.
    const re = hasSymbol
      ? new RegExp(`(^|[^A-Za-z0-9+#])${esc}(?![A-Za-z0-9])`)
      : new RegExp(`(^|[^A-Za-z0-9+#])${esc}(?![A-Za-z0-9+#])`);
    return (text) => re.test(text);
  }

  if (hasSymbol) {
    const esc = escapeRegex(alias);
    const re = new RegExp(`(^|[^A-Za-z0-9])${esc}(?![A-Za-z0-9])`, 'i');
    return (text) => re.test(text);
  }

  // Plain alphabetic alias: case-insensitive, word boundaries.
  const re = new RegExp(`\\b${escapeRegex(alias)}\\b`, 'i');
  return (text) => re.test(text);
}

// Section/line cues that mark a skill as "preferred" rather than core/required. Not heavily
// used for catalog text (catalogs don't have preferred sections) but kept for reuse on postings.
const PREFERRED_CUE = /\b(preferred|nice to have|a plus|bonus|ideally|desirable)\b/i;

/**
 * Extract canonical skills from free text (a course catalog description).
 * @param {string} text
 * @returns {{id,name,phrase,category,roles,evidence,required}[]} de-duped by id, first evidence wins.
 */
export function extractSkills(text) {
  const src = String(text || '');
  if (!src.trim()) return [];
  const sentences = splitSentences(src).length ? splitSentences(src) : [src];
  const found = new Map();

  for (const { skill, test } of MATCHERS) {
    if (found.has(skill.id)) continue;
    if (!test(src)) continue;
    // Find the sentence that carries the match for evidence.
    const evidence = sentences.find((s) => test(s)) || sentences[0];
    found.set(skill.id, {
      id: skill.id,
      name: skill.name,
      phrase: skill.phrase,
      category: skill.category,
      roles: skill.roles,
      evidence: evidence.trim(),
      required: !PREFERRED_CUE.test(evidence),
    });
  }
  return [...found.values()];
}

/** Canonical skill ids whose alias appears in `text` (deduped). Used for per-posting hits. */
export function skillHits(text) {
  const src = String(text || '');
  const seen = new Set();
  for (const { skill, test } of MATCHERS) {
    if (seen.has(skill.id)) continue;
    if (test(src)) seen.add(skill.id);
  }
  return [...seen];
}

/** Count how many of the given postings mention each skill id. Returns Map id -> {count, postingIds}. */
export function skillDemand(postings) {
  const counts = new Map();
  for (const p of postings) {
    const text = p.descriptionText || '';
    const seen = new Set();
    for (const { skill, test } of MATCHERS) {
      if (seen.has(skill.id)) continue;
      if (test(text)) {
        seen.add(skill.id);
        const entry = counts.get(skill.id) || { count: 0, postingIds: [] };
        entry.count++;
        if (entry.postingIds.length < 5) entry.postingIds.push(p.id);
        counts.set(skill.id, entry);
      }
    }
  }
  return counts;
}

export function findSkill(nameOrAlias) {
  const q = String(nameOrAlias || '').trim();
  if (!q) return null;
  if (SKILL_BY_ID.has(q)) return SKILL_BY_ID.get(q);
  for (const { skill, test } of MATCHERS) if (test(q)) return skill;
  return null;
}

export function listSkills() {
  return SKILLS.slice();
}
