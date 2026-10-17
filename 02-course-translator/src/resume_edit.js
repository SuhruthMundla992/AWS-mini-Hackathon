// Resume ingestion + LaTeX tailoring.
//
// Two honest paths:
//   1. The student pastes/uploads their LaTeX source  -> we EDIT IN PLACE: find the
//      "Relevant Coursework" list (and an inline Skills list if present) and swap in the
//      tailored content, leaving every other byte of their formatting untouched.
//   2. The student uploads a PDF/DOCX/plain-text resume -> we can't faithfully reproduce the
//      original visual layout in LaTeX, so we GENERATE a clean, compiling LaTeX resume from an
//      original minimal template, carrying their text across and inserting the tailored
//      Coursework/Skills. We say plainly that layout was normalized.
//
// Open-source extraction: pdf-parse (MIT) for PDF, mammoth (BSD) for DOCX. Both are optional —
// if a buffer can't be parsed we fall back to treating it as UTF-8 text and say so.
import { escapeLatex } from './resume.js';

/** Extract plain text (or raw LaTeX) from pasted text or an uploaded file (base64). */
export async function extractResumeText({ text, fileBase64, filename } = {}) {
  if (fileBase64) {
    const buffer = Buffer.from(String(fileBase64).replace(/^data:[^;]*;base64,/, ''), 'base64');
    const ext = (String(filename || '').match(/\.([a-z0-9]+)$/i)?.[1] || '').toLowerCase();
    if (ext === 'pdf') {
      try {
        const { default: pdfParse } = await import('pdf-parse/lib/pdf-parse.js');
        const data = await pdfParse(buffer);
        return { text: data.text || '', kind: 'pdf' };
      } catch (e) {
        return { text: '', kind: 'pdf', error: 'Could not read that PDF. Try pasting your resume text or LaTeX source instead.' };
      }
    }
    if (ext === 'docx') {
      try {
        const mammoth = (await import('mammoth')).default;
        const { value } = await mammoth.extractRawText({ buffer });
        return { text: value || '', kind: 'docx' };
      } catch (e) {
        return { text: '', kind: 'docx', error: 'Could not read that DOCX. Try pasting your resume text instead.' };
      }
    }
    // .tex / .txt / .md / unknown: treat as text.
    return { text: buffer.toString('utf8'), kind: ext || 'text' };
  }
  return { text: String(text || ''), kind: 'text' };
}

/** Is this LaTeX source rather than plain text / extracted PDF text? */
export function detectFormat(text) {
  const s = String(text || '');
  return /\\documentclass|\\begin\{document\}|\\section\*?\{|\\resumeSubheading|\\textbf\{/.test(s)
    ? 'latex'
    : 'text';
}

const COURSEWORK_PATTERNS = [
  // Jake-style:  \textbf{Relevant Coursework}{: Data Structures, Algorithms}
  /(\\textbf\s*\{\s*Relevant Coursework\s*\}\s*\{\s*:?\s*)([^}]*)(\})/i,
  // Inline:      Relevant Coursework: Data Structures, Algorithms   (to end of line)
  /(Relevant Coursework\s*:\s*)([^\n\\]*)/i,
  // Coursework (no "Relevant"):
  /(\\textbf\s*\{\s*Coursework\s*\}\s*\{\s*:?\s*)([^}]*)(\})/i,
  /(\bCoursework\s*:\s*)([^\n\\]*)/i,
];

const SKILLS_INLINE_PATTERNS = [
  /(\\textbf\s*\{\s*Relevant Coursework Skills\s*\}\s*\{\s*:?\s*)([^}]*)(\})/i,
  /(Relevant Skills\s*:\s*)([^\n\\]*)/i,
];

/**
 * Edit a LaTeX resume in place: replace the Coursework list, and the Skills list if an inline
 * one is present; otherwise insert a clearly-marked tailored line into the Skills section (or
 * before \end{document}). Returns the new source + what changed. Never corrupts: if nothing can
 * be matched, the original is returned unchanged with a note.
 */
export function editLatexResume(src, { courseworkInject, skillsInject, companyName } = {}) {
  let out = String(src || '');
  const changed = { coursework: false, skills: false };
  const notes = [];

  if (courseworkInject) {
    for (const re of COURSEWORK_PATTERNS) {
      const m = out.match(re);
      if (m) {
        const replacement = m[3] !== undefined
          ? `${m[1]}${courseworkInject}${m[3]}`
          : `${m[1]}${courseworkInject}`;
        out = out.slice(0, m.index) + replacement + out.slice(m.index + m[0].length);
        changed.coursework = true;
        notes.push('Replaced your Relevant Coursework list with the courses you selected.');
        break;
      }
    }
    if (!changed.coursework) {
      notes.push('Could not find a "Relevant Coursework" line to replace, so your coursework was left as-is. The tailored line is provided below to paste in.');
    }
  }

  if (skillsInject) {
    for (const re of SKILLS_INLINE_PATTERNS) {
      const m = out.match(re);
      if (m) {
        out = out.slice(0, m.index) + `${m[1]}${skillsInject}${m[3] ?? ''}` + out.slice(m.index + m[0].length);
        changed.skills = true;
        notes.push('Updated your inline skills list.');
        break;
      }
    }
    if (!changed.skills) {
      // Insert a tailored line into a Skills section header if we can find one; else before end.
      const secRe = /(\\section\*?\s*\{[^}]*Skills[^}]*\}[^\n]*\n)/i;
      const line = `\\textbf{Coursework skills tailored for ${companyName || 'this role'}}: ${skillsInject}\\\\\n`;
      const sm = out.match(secRe);
      if (sm) {
        const at = sm.index + sm[0].length;
        out = out.slice(0, at) + line + out.slice(at);
        changed.skills = true;
        notes.push(`Added a tailored skills line to your Skills section — review its formatting, since skills sections vary.`);
      } else {
        const endRe = /\\end\{document\}/;
        const em = out.match(endRe);
        const block = `\n% --- Course Translator: tailored skills for ${companyName || 'target role'} ---\n\\section*{Relevant Coursework Skills}\n${skillsInject}\n`;
        if (em) {
          out = out.slice(0, em.index) + block + out.slice(em.index);
          changed.skills = true;
          notes.push('No Skills section found, so a new "Relevant Coursework Skills" section was added before the end of your resume.');
        } else {
          notes.push('No place to insert skills was found; the tailored skills line is provided below to paste in.');
        }
      }
    }
  }

  return { latex: out, changed, notes };
}

/** A minimal, original, compiling LaTeX resume template (not copied from any third party). */
function latexTemplate({ name, bodyBlocks, courseworkInject, skillsInject }) {
  const esc = (s) => escapeLatex(s);
  const sections = [];
  sections.push(`\\section*{Relevant Coursework}\n${esc(courseworkInject || '')}`);
  if (skillsInject) sections.push(`\\section*{Skills}\n${esc(skillsInject)}`);
  if (bodyBlocks && bodyBlocks.trim()) sections.push(`\\section*{Resume (imported)}\n${bodyBlocks}`);
  return `\\documentclass[letterpaper,11pt]{article}
\\usepackage[margin=0.9in]{geometry}
\\usepackage{enumitem}
\\usepackage[hidelinks]{hyperref}
\\setlength{\\parindent}{0pt}
\\begin{document}

{\\LARGE \\textbf{${esc(name || 'Your Name')}}}\\\\[4pt]

${sections.join('\n\n')}

\\end{document}
`;
}

/** Convert extracted plain text into escaped LaTeX paragraphs (keeps content, normalizes layout). */
function plainTextToLatexBody(text) {
  return String(text || '')
    .split(/\n{2,}/)
    .map((para) => escapeLatex(para.trim().replace(/\n/g, ' \\\\ ')))
    .filter(Boolean)
    .join('\n\n');
}

/** Guess the candidate's name = first short, non-empty, no-digit/@ line. */
function guessName(text) {
  for (const raw of String(text || '').split('\n')) {
    const line = raw.trim();
    if (line && !/[@\d]/.test(line) && line.split(/\s+/).length <= 4 && line.length <= 40) return line;
  }
  return null;
}

/** Generate a clean LaTeX resume from non-LaTeX input, with tailored Coursework/Skills. */
export function generateLatexResume(plainText, { courseworkInject, skillsInject } = {}) {
  const name = guessName(plainText);
  const bodyBlocks = plainTextToLatexBody(plainText);
  const latex = latexTemplate({ name, bodyBlocks, courseworkInject, skillsInject });
  const notes = [
    'Your original file was converted to LaTeX. Exact visual layout from a PDF/DOCX cannot be preserved, so this is a clean, normalized version with your tailored Coursework and Skills.',
    'For an edit that keeps your exact formatting, paste your resume\'s LaTeX source instead — we\'ll change only the Coursework/Skills lines.',
  ];
  return { latex, notes };
}

/**
 * Orchestrator: given extracted resume content + the tailored strings, return edited/generated
 * LaTeX. `courseworkInject` and `skillsInject` are plain comma lists (no "Relevant Coursework:" prefix).
 */
export function tailorResume({ resumeText, courseworkInject, skillsInject, companyName }) {
  const format = detectFormat(resumeText);
  if (format === 'latex') {
    const { latex, changed, notes } = editLatexResume(resumeText, { courseworkInject, skillsInject, companyName });
    return { inputFormat: 'latex', latex, changed, notes };
  }
  const { latex, notes } = generateLatexResume(resumeText, { courseworkInject, skillsInject });
  return { inputFormat: 'text', latex, changed: { coursework: true, skills: !!skillsInject }, notes };
}
