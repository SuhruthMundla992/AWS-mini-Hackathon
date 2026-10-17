// P1: turn a student's assignment description into one honest, project-style resume bullet.
//
// Trust rule (non-negotiable): the bullet may use ONLY skills/words the student actually
// wrote. We detect skills with extractSkills over the student's own text and never invent
// tools, metrics, or outcomes they didn't mention. Deterministic strong-verb template;
// identical input always yields identical output.
import { extractSkills } from './skills.js';
import { truncate, sha256 } from '../../shared/src/text.js';

// Strong, honest action verbs. Chosen deterministically from the text hash so the wording
// is stable per input but not monotonous across different assignments.
const STRONG_VERBS = ['Built', 'Implemented', 'Developed', 'Engineered', 'Designed', 'Programmed'];

function pickVerb(seed) {
  const h = sha256(seed);
  // Use the first hex digit as a stable index.
  const n = parseInt(h.slice(0, 8), 16);
  return STRONG_VERBS[n % STRONG_VERBS.length];
}

/** Join phrases into "a, b, and c" (Oxford comma), honest about 0/1/2 cases. */
function joinPhrases(list) {
  const a = list.filter(Boolean);
  if (a.length === 0) return '';
  if (a.length === 1) return a[0];
  if (a.length === 2) return `${a[0]} and ${a[1]}`;
  return `${a.slice(0, -1).join(', ')}, and ${a[a.length - 1]}`;
}

/** Normalize a course argument (object or code string) into {code, title}. */
function courseContext(course) {
  if (!course) return null;
  if (typeof course === 'string') return { code: course.trim(), title: null };
  return { code: course.code || null, title: course.title || null };
}

/**
 * @param {{text:string, course?:string|{code,title}}} input
 * @returns {{bullet:string, usedSkills:Array<{id,name,phrase}>, note:string}}
 */
export function upgradeAssignment({ text, course } = {}) {
  const src = String(text || '').trim();
  if (!src) {
    return { bullet: '', usedSkills: [], note: 'No assignment text provided.' };
  }

  const extracted = extractSkills(src);
  const usedSkills = extracted.map((s) => ({ id: s.id, name: s.name, phrase: s.phrase }));
  const ctx = courseContext(course);
  const verb = pickVerb(src);

  // Project framing from the course context when available (metadata, not invented facts).
  const projectNoun = ctx?.title ? `${ctx.title} project` : ctx?.code ? `${ctx.code} project` : 'course project';
  const article = /^[aeiou]/i.test(projectNoun) ? 'an' : 'a';

  let bullet;
  let note;
  if (usedSkills.length > 0) {
    const phrases = joinPhrases(usedSkills.map((s) => s.phrase));
    bullet = `${verb} ${article} ${projectNoun} applying ${phrases}.`;
    note =
      `Used only skills found in your text: ${usedSkills.map((s) => s.phrase).join(', ')}. ` +
      'No tools, metrics, or outcomes were added beyond what you wrote.';
  } else {
    // No canonical skill matched — stay honest: paraphrase the student's own summary line,
    // add nothing. Keep it short.
    const firstLine = src.split('\n').map((l) => l.trim()).find(Boolean) || src;
    bullet = `${verb} ${article} ${projectNoun}: ${truncate(firstLine, 140)}`;
    note =
      'No recognizable technical skills were detected in your text, so the bullet restates ' +
      'your own words without adding anything new. Add concrete technologies you used to strengthen it.';
  }

  return { bullet, usedSkills, note };
}
