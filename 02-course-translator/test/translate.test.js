// Translate end-to-end (no network): mapping + ranking against an INJECTED company-demand
// index (the `_demand` test seam), so the pure logic is exercised without a live fetch.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { translate } from '../src/translate.js';

// Synthetic company-demand index shaped like jobs.companyDemand()'s return value.
// Pick counts so a clear ordering is testable for the systems role.
const DEMAND = {
  company: { id: 'acme', name: 'Acme' },
  totalPostings: 100,
  totalScanned: 100,
  source: 'live',
  fellBack: null,
  scopeLabel: 'intern Systems / Backend roles at Acme',
  counts: {
    concurrency: { count: 40, pct: 40, postingIds: ['a'] },
    networking: { count: 30, pct: 30, postingIds: ['b'] },
    'systems-programming': { count: 20, pct: 20, postingIds: ['c'] },
    security: { count: 10, pct: 10, postingIds: ['d'] },
    'data-structures': { count: 25, pct: 25, postingIds: ['e'] },
    algorithms: { count: 15, pct: 15, postingIds: ['f'] },
    'machine-learning': { count: 12, pct: 12, postingIds: ['g'] },
  },
};

const BASE = {
  schoolId: 'tamu',
  codes: ['CSCE 313', 'CSCE 221', 'CSCE 421'],
  companyId: 'acme',
  role: 'systems',
  employment: 'intern',
  _demand: DEMAND,
};

test('happy path: all courses found, each 1..4 skills sorted by demand pct desc', async () => {
  const r = await translate(BASE);
  assert.equal(r.courses.length, 3);
  assert.deepEqual(r.unmatched, []);
  for (const c of r.courses) {
    assert.equal(c.found, true);
    assert.ok(c.skills.length >= 1 && c.skills.length <= 4, `${c.code} has 1..4 skills`);
    for (let i = 1; i < c.skills.length; i++) {
      assert.ok(c.skills[i - 1].demand.pct >= c.skills[i].demand.pct, `${c.code} sorted by pct desc`);
    }
    for (const s of c.skills) {
      for (const k of ['id', 'name', 'phrase', 'category', 'evidence', 'demand']) assert.ok(k in s, `skill has ${k}`);
      for (const k of ['count', 'totalPostings', 'pct']) assert.ok(k in s.demand, `demand has ${k}`);
    }
  }
});

test('TranslateResult matches the API_CONTRACT shape', async () => {
  const r = await translate(BASE);
  for (const k of ['school', 'company', 'role', 'roleLabel', 'employment', 'courses', 'unmatched', 'scope', 'resumeLines', 'meta']) {
    assert.ok(k in r, `result has ${k}`);
  }
  assert.equal(r.school.schoolId, 'tamu');
  assert.equal(r.company.name, 'Acme');
  assert.equal(r.role, 'systems');
  assert.equal(r.roleLabel, 'Systems / Backend');
  assert.equal(r.employment, 'intern');
  for (const k of ['label', 'totalPostings', 'totalScanned', 'source', 'fellBack']) assert.ok(k in r.scope, `scope has ${k}`);
  for (const k of ['coursework', 'skills']) {
    assert.ok('text' in r.resumeLines[k] && 'latex' in r.resumeLines[k], `resumeLines.${k} has text+latex`);
  }
  assert.equal(r.meta.llmUsed, false);
});

test('an unknown code lands in unmatched', async () => {
  const r = await translate({ ...BASE, codes: ['CSCE 313', 'CSCE 999'] });
  assert.deepEqual(r.unmatched, ['CSCE 999']);
  assert.deepEqual(r.courses.map((c) => c.code), ['CSCE 313']);
});

test('ranking reflects the injected company demand (concurrency > security on CSCE 313)', async () => {
  const r = await translate(BASE);
  const c313 = r.courses.find((c) => c.code === 'CSCE 313');
  const ids = c313.skills.map((s) => s.id);
  assert.ok(ids.indexOf('concurrency') < ids.indexOf('security'), 'higher-demand skill ranks first');
});

test('codes as a single string blob behaves identically to an array', async () => {
  const asArray = await translate(BASE);
  const asString = await translate({ ...BASE, codes: 'CSCE 313 CSCE 221 CSCE 421' });
  assert.deepEqual(asString.courses.map((c) => c.code), asArray.courses.map((c) => c.code));
  assert.equal(asString.resumeLines.skills.text, asArray.resumeLines.skills.text);
});

test('role omitted still returns skills (pct from counts, 0 when absent)', async () => {
  const r = await translate({ schoolId: 'tamu', codes: ['CSCE 313'], companyId: 'acme', _demand: DEMAND });
  assert.equal(r.role, '');
  assert.equal(r.roleLabel, null);
  assert.ok(r.courses[0].skills.length >= 1);
});

test('unknown role key degrades to the no-role behavior', async () => {
  const r = await translate({ ...BASE, role: 'astronaut' });
  assert.equal(r.role, '');
});

test('resumeLines are populated and demand-ordered', async () => {
  const r = await translate(BASE);
  assert.match(r.resumeLines.coursework.text, /^Relevant Coursework: /);
  assert.ok(r.resumeLines.coursework.text.includes('CSCE 313 (Introduction to Computer Systems)'));
  assert.match(r.resumeLines.skills.text, /^Skills: \S/);
  // Concurrency (40%) should appear before Security (10%) in the deduped skills line.
  const line = r.resumeLines.skills.text;
  assert.ok(line.indexOf('Concurrency') < line.indexOf('Computer security'), 'skills line demand-ordered');
});
