// Resume line generation: coursework format, deduped+ordered skills, LaTeX escaping.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildResumeLines, escapeLatex } from '../src/resume.js';

// A hand-built TranslateResult-like object so the test does not depend on demand data.
function result() {
  return {
    courses: [
      {
        code: 'CSCE 313',
        title: 'Introduction to Computer Systems',
        found: true,
        skills: [
          { id: 'networking', name: 'Computer networks', phrase: 'Computer networking', demand: { pct: 30, count: 30 } },
          { id: 'concurrency', name: 'Concurrency', phrase: 'Concurrency & multithreading', demand: { pct: 10, count: 10 } },
        ],
      },
      {
        code: 'CSCE 463',
        title: 'Computer Networks',
        found: true,
        skills: [
          // duplicate id with a lower pct — the higher-pct occurrence should win and dedupe.
          { id: 'networking', name: 'Computer networks', phrase: 'Computer networking', demand: { pct: 20, count: 20 } },
          { id: 'security', name: 'Security', phrase: 'Computer security', demand: { pct: 25, count: 25 } },
        ],
      },
    ],
  };
}

test('coursework line matches the required format', () => {
  const { coursework } = buildResumeLines(result());
  assert.equal(
    coursework.text,
    'Relevant Coursework: CSCE 313 (Introduction to Computer Systems), CSCE 463 (Computer Networks)',
  );
});

test('skills line is deduped and demand-ordered', () => {
  const { skills } = buildResumeLines(result());
  // networking (30) > security (25) > concurrency (10); networking appears once.
  assert.equal(skills.text, 'Skills: Computer networking, Computer security, Concurrency & multithreading');
  assert.equal((skills.text.match(/Computer networking/g) || []).length, 1);
});

test('escapeLatex escapes the LaTeX special characters that appear in our data', () => {
  assert.equal(escapeLatex('C++ & Co_%#{}'), 'C++ \\& Co\\_\\%\\#\\{\\}');
  assert.equal(escapeLatex(null), '');
  assert.equal(escapeLatex(undefined), '');
});

test('LaTeX variant differs from text when special chars are present', () => {
  const r = {
    courses: [
      {
        code: 'ECEN 350',
        title: 'Design & Analysis',
        found: true,
        skills: [{ id: 'x', name: 'X', phrase: 'A & B', demand: { pct: 1, count: 1 } }],
      },
    ],
  };
  const { coursework, skills } = buildResumeLines(r);
  assert.notEqual(coursework.text, coursework.latex);
  assert.ok(coursework.latex.includes('Design \\& Analysis'));
  assert.notEqual(skills.text, skills.latex);
  assert.ok(skills.latex.includes('A \\& B'));
});

test('no special chars -> text and latex coincide', () => {
  const r = {
    courses: [{ code: 'CSCE 221', title: 'Data Structures', found: true, skills: [{ id: 'y', name: 'Y', phrase: 'Algorithms', demand: { pct: 1, count: 1 } }] }],
  };
  const { coursework } = buildResumeLines(r);
  assert.equal(coursework.text, coursework.latex);
});
