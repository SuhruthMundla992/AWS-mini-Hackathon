// Catalog: code normalization, free-text parsing, resolution against the real TAMU seed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  normCode,
  parseCodeInput,
  resolveCourses,
  listSchools,
  getSchool,
  courseLevel,
  listCoursesByLevel,
} from '../src/catalog.js';

test('normCode collapses, uppercases, and inserts a space', () => {
  assert.equal(normCode('csce313'), 'CSCE 313');
  assert.equal(normCode('CSCE 313'), 'CSCE 313');
  assert.equal(normCode('math 304'), 'MATH 304');
  // Extra robustness: lowercase with space, and odd punctuation.
  assert.equal(normCode('csce 313'), 'CSCE 313');
  assert.equal(normCode('CSCE-313'), 'CSCE 313');
});

test('parseCodeInput splits commas, newlines, and double spaces', () => {
  assert.deepEqual(parseCodeInput('CSCE 313, CSCE 221\nMATH 304'), [
    'CSCE 313',
    'CSCE 221',
    'MATH 304',
  ]);
});

test('parseCodeInput splits single-spaced runs into code pairs', () => {
  assert.deepEqual(parseCodeInput('CSCE 313 CSCE 221 CSCE 421'), [
    'CSCE 313',
    'CSCE 221',
    'CSCE 421',
  ]);
});

test('resolveCourses separates found from unmatched against tamu', () => {
  const { found, unmatched } = resolveCourses('tamu', ['CSCE 313', 'csce221', 'CSCE 999']);
  const codes = found.map((c) => c.code);
  assert.deepEqual(codes, ['CSCE 313', 'CSCE 221']);
  assert.deepEqual(unmatched, ['CSCE 999']);
  // Found courses carry real catalog fields.
  const c313 = found.find((c) => c.code === 'CSCE 313');
  assert.equal(c313.schoolId, 'tamu');
  assert.ok(c313.description.length > 0);
  assert.equal(c313.normCode, 'CSCE 313');
});

test('resolveCourses on unknown school returns everything unmatched', () => {
  const { found, unmatched } = resolveCourses('nope', ['CSCE 313']);
  assert.deepEqual(found, []);
  assert.deepEqual(unmatched, ['CSCE 313']);
});

test('listSchools exposes the dropdown shape', () => {
  const schools = listSchools();
  assert.ok(Array.isArray(schools));
  const tamu = schools.find((s) => s.schoolId === 'tamu');
  assert.ok(tamu, 'tamu present');
  for (const key of ['schoolId', 'school', 'courseCount', 'source', 'fetchedAt']) {
    assert.ok(key in tamu, `listSchools entry has ${key}`);
  }
  // byCode (the heavy internal map) must not leak into the public shape.
  assert.equal('byCode' in tamu, false);
  assert.ok(tamu.courseCount > 0);
});

test('courseLevel reads the leading hundreds digit', () => {
  assert.equal(courseLevel('CSCE 313'), 3);
  assert.equal(courseLevel('CSCE 120'), 1);
  assert.equal(courseLevel('CSCE 421'), 4);
  assert.equal(courseLevel('MATH 101'), 1);
  assert.equal(courseLevel('SEMINAR'), 0);
});

test('listCoursesByLevel groups and sorts tamu courses', () => {
  const { schoolId, levels } = listCoursesByLevel('tamu');
  assert.equal(schoolId, 'tamu');
  assert.ok(levels.length >= 3);
  // ascending level order
  for (let i = 1; i < levels.length; i++) assert.ok(levels[i - 1].level < levels[i].level);
  const l3 = levels.find((l) => l.level === 3);
  assert.ok(l3.courses.some((c) => c.code === 'CSCE 313'));
  // each course exposes only {code,title}
  for (const c of l3.courses) assert.deepEqual(Object.keys(c).sort(), ['code', 'title']);
});

test('listCoursesByLevel on unknown school is empty', () => {
  assert.deepEqual(listCoursesByLevel('nope').levels, []);
});

test('getSchool returns null for an unknown id', () => {
  assert.equal(getSchool('does-not-exist'), null);
  assert.equal(getSchool(''), null);
  assert.equal(getSchool(null), null);
  assert.ok(getSchool('tamu'));
  // Case-insensitive lookup.
  assert.ok(getSchool('TAMU'));
});
