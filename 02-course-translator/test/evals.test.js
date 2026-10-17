// Mapping-accuracy eval: run extractSkills over hand-labeled TAMU courses and assert
// recall >= 0.90 per the PRD target. Precision is computed and reported (not gated),
// because a course description legitimately mentions skills beyond the core label set.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { extractSkills } from '../src/skills.js';
import { getSchool } from '../src/catalog.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const labeled = JSON.parse(readFileSync(join(HERE, 'evals', 'course-skills.labeled.json'), 'utf8'));

test('extractSkills meets the labeled recall target (>= 0.90)', () => {
  const school = getSchool(labeled.schoolId);
  assert.ok(school, `school ${labeled.schoolId} is seeded`);

  let labeledTotal = 0;
  let recalled = 0;
  let tp = 0;
  let emitted = 0;
  const perCourseMisses = [];

  for (const [code, expected] of Object.entries(labeled.labels)) {
    const course = school.byCode.get(code);
    assert.ok(course, `course ${code} present in catalog`);
    const got = new Set(extractSkills(course.description).map((s) => s.id));

    for (const id of expected) {
      labeledTotal++;
      if (got.has(id)) recalled++;
      else perCourseMisses.push(`${code} missing ${id}`);
    }
    for (const id of got) {
      emitted++;
      if (expected.includes(id)) tp++;
    }
  }

  const recall = recalled / labeledTotal;
  const precision = tp / emitted;
  // Surfaced in the test runner output so the numbers are visible on every run.
  console.log(`[eval] recall=${recall.toFixed(3)} (${recalled}/${labeledTotal}) precision=${precision.toFixed(3)} (${tp}/${emitted})`);
  if (perCourseMisses.length) console.log('[eval] misses:', perCourseMisses.join('; '));

  assert.ok(recall >= 0.9, `recall ${recall.toFixed(3)} must be >= 0.90`);
});
