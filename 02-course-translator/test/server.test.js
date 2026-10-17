// API routes via createApp() on an ephemeral port, exercised with the global fetch client.
// No network beyond localhost. The /api/flag test restores data/flags.jsonl afterward.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApp } from '../src/server.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const FLAGS_PATH = join(HERE, '..', 'data', 'flags.jsonl');

let server;
let base;

// Preserve any pre-existing flags file so the suite leaves the workspace untouched.
const flagsExisted = existsSync(FLAGS_PATH);
const flagsBefore = flagsExisted ? readFileSync(FLAGS_PATH) : null;

function listen(app) {
  return new Promise((resolve) => {
    const srv = app.listen(0, () => {
      const { port } = srv.address();
      resolve({ srv, url: `http://127.0.0.1:${port}` });
    });
  });
}

function close(srv) {
  return new Promise((resolve) => srv.close(resolve));
}

before(async () => {
  const started = await listen(createApp());
  server = started.srv;
  base = started.url;
});

after(async () => {
  if (server) await close(server);
  // Restore flags.jsonl to its pre-suite state.
  if (flagsExisted) writeFileSync(FLAGS_PATH, flagsBefore);
  else if (existsSync(FLAGS_PATH)) rmSync(FLAGS_PATH);
});

test('GET /api/health -> {ok:true}', async () => {
  const res = await fetch(`${base}/api/health`);
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { ok: true });
});

test('GET /api/schools includes tamu', async () => {
  const res = await fetch(`${base}/api/schools`);
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.ok(Array.isArray(body.schools));
  assert.ok(body.schools.some((s) => s.schoolId === 'tamu'));
});

test('GET /api/roles returns the six roles', async () => {
  const res = await fetch(`${base}/api/roles`);
  assert.equal(res.status, 200);
  const { roles } = await res.json();
  assert.deepEqual(
    Object.keys(roles).sort(),
    ['data', 'embedded', 'frontend', 'ml', 'swe', 'systems'].sort(),
  );
});

test('GET /api/courses?schoolId=tamu groups courses by level', async () => {
  const res = await fetch(`${base}/api/courses?schoolId=tamu`);
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.schoolId, 'tamu');
  assert.ok(Array.isArray(body.levels) && body.levels.length > 0);
  const lvl = body.levels[0];
  for (const k of ['level', 'label', 'courses']) assert.ok(k in lvl, `level has ${k}`);
  // CSCE 313 should be in the level-3 bucket.
  const l3 = body.levels.find((x) => x.level === 3);
  assert.ok(l3 && l3.courses.some((c) => c.code === 'CSCE 313'));
});

test('GET /api/courses with bad schoolId -> 400', async () => {
  const res = await fetch(`${base}/api/courses?schoolId=nope`);
  assert.equal(res.status, 400);
});

test('GET /api/companies returns the curated list', async () => {
  const res = await fetch(`${base}/api/companies`);
  assert.equal(res.status, 200);
  const { companies } = await res.json();
  assert.ok(Array.isArray(companies) && companies.length >= 10);
  assert.ok(companies.some((c) => c.id === 'stripe'));
  for (const c of companies) assert.ok(c.id && c.name);
});

test('GET /api/filters returns roles, employment, companies', async () => {
  const res = await fetch(`${base}/api/filters`);
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.ok(body.roles && body.employment && Array.isArray(body.companies));
  assert.deepEqual(Object.keys(body.employment).sort(), ['fulltime', 'intern']);
});

test('POST /api/translate missing schoolId -> 400', async () => {
  const res = await fetch(`${base}/api/translate`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ codes: ['CSCE 313'], companyId: 'stripe', role: 'systems' }),
  });
  assert.equal(res.status, 400);
  assert.ok((await res.json()).error);
});

test('POST /api/translate missing companyId -> 400', async () => {
  const res = await fetch(`${base}/api/translate`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ schoolId: 'tamu', codes: ['CSCE 313'], role: 'systems' }),
  });
  assert.equal(res.status, 400);
  assert.ok((await res.json()).error);
});

test('POST /api/translate bad employment -> 400', async () => {
  const res = await fetch(`${base}/api/translate`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ schoolId: 'tamu', codes: ['CSCE 313'], companyId: 'stripe', employment: 'contractor' }),
  });
  assert.equal(res.status, 400);
});

test('malformed JSON body -> 400', async () => {
  const res = await fetch(`${base}/api/translate`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: '{ this is not json',
  });
  assert.equal(res.status, 400);
  assert.ok((await res.json()).error);
});

test('POST /api/assignment happy path -> 200', async () => {
  const res = await fetch(`${base}/api/assignment`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ text: 'Built a multithreaded server in C over TCP sockets.' }),
  });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.ok(body.bullet.length > 0);
  assert.ok(Array.isArray(body.usedSkills));
});

test('POST /api/flag valid -> {ok:true}', async () => {
  const res = await fetch(`${base}/api/flag`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ schoolId: 'tamu', courseCode: 'CSCE 313', skillId: 'networking', reason: 'test' }),
  });
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { ok: true });
});

test('POST /api/flag missing fields -> 400', async () => {
  const res = await fetch(`${base}/api/flag`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ schoolId: 'tamu' }),
  });
  assert.equal(res.status, 400);
  assert.ok((await res.json()).error);
});

test('rate limit: 31 rapid POSTs yield at least one 429', async () => {
  // Dedicated app so the shared limiter counter is isolated from the other tests.
  const { srv, url } = await listen(createApp());
  try {
    // Bodies omit companyId on purpose: the rate limiter runs BEFORE handler validation,
    // so each request is cheap (400 or 429) and never triggers a live board fetch.
    const reqs = [];
    for (let i = 0; i < 31; i++) {
      reqs.push(
        fetch(`${url}/api/translate`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ schoolId: 'tamu', codes: 'CSCE 313' }),
        }),
      );
    }
    const statuses = (await Promise.all(reqs)).map((r) => r.status);
    assert.ok(statuses.includes(429), `expected a 429 among [${statuses}]`);
  } finally {
    await close(srv);
  }
});
