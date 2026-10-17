// Assignment -> honest bullet: uses only the student's own skills, deterministic, graceful.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { upgradeAssignment } from '../src/assignment.js';

const SAMPLE = 'Built a multithreaded file server in C that handled concurrent client requests over TCP sockets.';

test('bullet uses the student\'s own skills and adds nothing', () => {
  const out = upgradeAssignment({ text: SAMPLE });
  assert.ok(out.usedSkills.length > 0, 'usedSkills non-empty');
  const usedIds = out.usedSkills.map((s) => s.id);
  assert.ok(usedIds.includes('concurrency'), 'detected concurrency');
  assert.ok(usedIds.includes('networking'), 'detected networking');
  // The bullet surfaces the employer phrases for those skills.
  assert.ok(/Concurrency & multithreading/.test(out.bullet), 'bullet mentions concurrency phrase');
  assert.ok(/Computer networking/.test(out.bullet), 'bullet mentions networking phrase');
  assert.match(out.note, /No tools, metrics, or outcomes were added/);
});

test('deterministic: same input twice yields an identical bullet', () => {
  const a = upgradeAssignment({ text: SAMPLE });
  const b = upgradeAssignment({ text: SAMPLE });
  assert.equal(a.bullet, b.bullet);
  assert.deepEqual(a.usedSkills, b.usedSkills);
});

test('empty text degrades gracefully', () => {
  const out = upgradeAssignment({ text: '' });
  assert.equal(out.bullet, '');
  assert.deepEqual(out.usedSkills, []);
  assert.match(out.note, /No assignment text provided/);
  // Missing argument entirely is also safe.
  assert.equal(upgradeAssignment().bullet, '');
});

test('text with no known skills falls back honestly with empty usedSkills', () => {
  const out = upgradeAssignment({ text: 'we organized a weekly reading group and shared handwritten notes.' });
  assert.deepEqual(out.usedSkills, []);
  assert.ok(out.bullet.length > 0, 'still produces a bullet');
  assert.match(out.note, /No recognizable technical skills were detected/);
});

test('course context frames the bullet without inventing facts', () => {
  const out = upgradeAssignment({ text: SAMPLE, course: { code: 'CSCE 313', title: 'Introduction to Computer Systems' } });
  assert.ok(out.bullet.includes('Introduction to Computer Systems project'));
});
