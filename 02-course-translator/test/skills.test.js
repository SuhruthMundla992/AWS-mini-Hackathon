// Skill extraction: recall on real catalog text, evidence integrity, false-positive guards,
// and demand counting over a tiny inline postings fixture (NO network).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractSkills, skillDemand, findSkill } from '../src/skills.js';
import { getSchool } from '../src/catalog.js';

const tamu = getSchool('tamu');
const desc = (code) => tamu.byCode.get(code).description;

function ids(text) {
  return extractSkills(text).map((s) => s.id);
}

test('CSCE 313 surfaces systems-programming, networking, concurrency, security', () => {
  const got = ids(desc('CSCE 313'));
  for (const id of ['systems-programming', 'networking', 'concurrency', 'security']) {
    assert.ok(got.includes(id), `CSCE 313 should map to ${id}, got [${got}]`);
  }
});

test('CSCE 421 surfaces machine-learning, deep-learning, statistics, optimization', () => {
  const got = ids(desc('CSCE 421'));
  for (const id of ['machine-learning', 'deep-learning', 'statistics', 'optimization']) {
    assert.ok(got.includes(id), `CSCE 421 should map to ${id}, got [${got}]`);
  }
});

test('every emitted skill carries evidence that actually occurs in the source', () => {
  for (const code of ['CSCE 313', 'CSCE 221', 'CSCE 421', 'CSCE 463']) {
    const text = desc(code);
    for (const s of extractSkills(text)) {
      assert.ok(typeof s.evidence === 'string' && s.evidence.length > 0, `${code}/${s.id} evidence non-empty`);
      assert.ok(text.includes(s.evidence), `${code}/${s.id} evidence must be a substring of the description`);
    }
  }
});

test('false-positive guard: generic English prose matches no ambiguous short tokens', () => {
  const got = ids('We are a good company in our area; you can see');
  for (const id of ['go', 'c', 'r-lang', 'artificial-intelligence', 'machine-learning', 'operating-systems']) {
    assert.ok(!got.includes(id), `generic prose must not match ${id} (got [${got}])`);
  }
});

test('false-positive guard: "html and css" never yields ML', () => {
  const got = ids('html and css');
  assert.ok(!got.includes('machine-learning'), `"html" must not trigger ML (got [${got}])`);
});

test('"C++ developer" yields cpp', () => {
  const got = ids('C++ developer');
  assert.ok(got.includes('cpp'), `expected cpp, got [${got}]`);
});

test('skillDemand counts skills across a 3-posting fixture', () => {
  const postings = [
    { id: 'p1', descriptionText: 'We build distributed systems in Go. Experience with Python a plus.' },
    { id: 'p2', descriptionText: 'Backend role: Python, SQL, and concurrency with multithreading.' },
    { id: 'p3', descriptionText: 'Data scientist using Python and machine learning models.' },
  ];
  const counts = skillDemand(postings);
  assert.equal(counts.get('python').count, 3);
  assert.equal(counts.get('go').count, 1);
  assert.equal(counts.get('concurrency').count, 1);
  assert.equal(counts.get('machine-learning').count, 1);
  // Each skill is counted at most once per posting, and postingIds are recorded.
  assert.deepEqual(counts.get('python').postingIds, ['p1', 'p2', 'p3']);
  assert.equal(counts.has('rust'), false);
});

test('findSkill resolves by id and by alias', () => {
  assert.equal(findSkill('concurrency')?.id, 'concurrency');
  assert.equal(findSkill('multithreading')?.id, 'concurrency');
  assert.equal(findSkill('nothing-here-xyz'), null);
});
