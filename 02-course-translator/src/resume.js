// Build the two copy-ready resume lines from a TranslateResult:
//   - Relevant Coursework: course codes + titles
//   - Skills: demand-ordered, de-duped employer phrases
// Each line comes in plain text and LaTeX variants. LaTeX escaping covers the characters
// that actually show up in course titles / skill phrases: # & _ % { }.

const LATEX_ESCAPE = /[#&_%{}]/g;

/** Escape the LaTeX special characters that appear in our data. */
export function escapeLatex(str) {
  return String(str == null ? '' : str).replace(LATEX_ESCAPE, (c) => `\\${c}`);
}

/**
 * De-dupe skills across all courses, keeping the highest-demand occurrence of each id.
 * Returns objects {id, phrase, name, demand} sorted by pct desc, count desc, then name asc.
 */
function dedupeSkills(courses) {
  const best = new Map();
  for (const course of courses || []) {
    for (const s of course.skills || []) {
      const prev = best.get(s.id);
      const pct = s.demand?.pct || 0;
      if (!prev || pct > (prev.demand?.pct || 0)) best.set(s.id, s);
    }
  }
  return [...best.values()].sort((a, b) => {
    const ap = a.demand?.pct || 0, bp = b.demand?.pct || 0;
    if (bp !== ap) return bp - ap;
    const ac = a.demand?.count || 0, bc = b.demand?.count || 0;
    if (bc !== ac) return bc - ac;
    return String(a.name).localeCompare(String(b.name));
  });
}

/**
 * @param {import('./translate.js').TranslateResult} result
 * @returns {{coursework:{text,latex}, skills:{text,latex}}}
 */
export function buildResumeLines(result) {
  const courses = (result?.courses || []).filter((c) => c.found);

  // Relevant Coursework line.
  const courseParts = courses.map((c) => ({ code: c.code, title: c.title }));
  const courseworkText =
    'Relevant Coursework: ' + courseParts.map((c) => `${c.code} (${c.title})`).join(', ');
  const courseworkLatex =
    'Relevant Coursework: ' +
    courseParts.map((c) => `${escapeLatex(c.code)} (${escapeLatex(c.title)})`).join(', ');

  // Skills line (demand-ordered, de-duped employer phrases).
  const skills = dedupeSkills(courses);
  const phrases = skills.map((s) => s.phrase);
  const skillsText = 'Skills: ' + phrases.join(', ');
  const skillsLatex = 'Skills: ' + phrases.map((p) => escapeLatex(p)).join(', ');

  return {
    coursework: { text: courseworkText, latex: courseworkLatex },
    skills: { text: skillsText, latex: skillsLatex },
  };
}
