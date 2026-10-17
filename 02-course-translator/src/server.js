// Express app for Course Translator. Offline-first, no DB. Serves the static UI in public/
// and the JSON API defined in API_CONTRACT.md. Start only when run directly so tests can
// import createApp() without binding a port.
import express from 'express';
import { mkdirSync, appendFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { ROLES } from './skills.data.js';
import { listSchools, getSchool, resolveCourses, listCoursesByLevel } from './catalog.js';
import { listCompanies } from './companies.js';
import { EMPLOYMENT_TYPES } from './jobs.js';
import { translate } from './translate.js';
import { upgradeAssignment } from './assignment.js';
import { extractResumeText, tailorResume } from './resume_edit.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = join(HERE, '..', 'public');
const DATA_DIR = join(HERE, '..', 'data');
const FLAGS_PATH = join(DATA_DIR, 'flags.jsonl');

// Large enough for a base64-encoded resume upload (PDF/DOCX) on /api/resume; small routes
// are still guarded by validation + the rate limiter.
const JSON_LIMIT = '8mb';
const RATE_LIMIT_MAX = 30;
const RATE_LIMIT_WINDOW_MS = 60 * 1000;

/** Tiny in-memory sliding-window rate limiter: max requests per window per ip. */
function createRateLimiter({ max = RATE_LIMIT_MAX, windowMs = RATE_LIMIT_WINDOW_MS } = {}) {
  const hits = new Map(); // ip -> number[] (timestamps)
  return function rateLimit(req, res, next) {
    const ip = req.ip || req.socket?.remoteAddress || 'unknown';
    const now = Date.now();
    const arr = (hits.get(ip) || []).filter((t) => now - t < windowMs);
    if (arr.length >= max) {
      const retryMs = windowMs - (now - arr[0]);
      res.set('Retry-After', String(Math.ceil(retryMs / 1000)));
      return res.status(429).json({ error: 'Too many requests. Please slow down.' });
    }
    arr.push(now);
    hits.set(ip, arr);
    next();
  };
}

function isNonEmptyString(v) {
  return typeof v === 'string' && v.trim().length > 0;
}

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', true);
  app.use(express.json({ limit: JSON_LIMIT }));

  // Reject malformed JSON / oversized bodies cleanly as 400 instead of a stack trace.
  app.use((err, req, res, next) => {
    if (err) {
      const status = err.type === 'entity.too.large' ? 413 : 400;
      return res.status(status).json({ error: status === 413 ? 'Request body too large.' : 'Invalid JSON body.' });
    }
    next();
  });

  const postLimiter = createRateLimiter();

  // ---- read endpoints ----
  app.get('/api/health', (req, res) => res.json({ ok: true }));

  app.get('/api/schools', (req, res) => {
    res.json({ schools: listSchools() });
  });

  app.get('/api/roles', (req, res) => {
    res.json({ roles: ROLES });
  });

  // Courses for a school, grouped by level for the dropdown.
  app.get('/api/courses', (req, res) => {
    const schoolId = req.query.schoolId;
    if (!isNonEmptyString(schoolId) || !getSchool(schoolId)) {
      return res.status(400).json({ error: 'A valid schoolId query parameter is required.' });
    }
    res.json(listCoursesByLevel(schoolId));
  });

  // Companies the student can target (public ATS boards only).
  app.get('/api/companies', (req, res) => {
    res.json({ companies: listCompanies() });
  });

  // Everything the form's selectors need in one call.
  app.get('/api/filters', (req, res) => {
    res.json({ roles: ROLES, employment: EMPLOYMENT_TYPES, companies: listCompanies() });
  });

  // ---- write endpoints (rate limited) ----
  app.post('/api/translate', postLimiter, async (req, res) => {
    const { schoolId, codes, companyId, role, employment } = req.body || {};
    if (!isNonEmptyString(schoolId)) {
      return res.status(400).json({ error: 'schoolId is required.' });
    }
    const codesOk = isNonEmptyString(codes) || (Array.isArray(codes) && codes.length > 0);
    if (!codesOk) {
      return res.status(400).json({ error: 'Select at least one course.' });
    }
    if (!isNonEmptyString(companyId)) {
      return res.status(400).json({ error: 'companyId is required.' });
    }
    if (role != null && typeof role !== 'string') {
      return res.status(400).json({ error: 'role must be a string.' });
    }
    if (employment != null && !['intern', 'fulltime', ''].includes(employment)) {
      return res.status(400).json({ error: 'employment must be "intern" or "fulltime".' });
    }
    try {
      const result = await translate({ schoolId, codes, companyId, role, employment });
      res.json(result);
    } catch (e) {
      if (e && e.code === 'UNKNOWN_COMPANY') {
        return res.status(400).json({ error: 'Unknown company.' });
      }
      res.status(500).json({ error: 'Translation failed.' });
    }
  });

  // Resume tailoring: scan the company, then edit/generate LaTeX with the tailored lines.
  // Larger body limit here because an uploaded file arrives base64-encoded.
  app.post('/api/resume', postLimiter, async (req, res) => {
    const { schoolId, codes, companyId, role, employment, resumeText, fileBase64, filename } = req.body || {};
    if (!isNonEmptyString(schoolId)) return res.status(400).json({ error: 'schoolId is required.' });
    const codesOk = isNonEmptyString(codes) || (Array.isArray(codes) && codes.length > 0);
    if (!codesOk) return res.status(400).json({ error: 'Select at least one course.' });
    if (!isNonEmptyString(companyId)) return res.status(400).json({ error: 'companyId is required.' });
    if (!isNonEmptyString(resumeText) && !isNonEmptyString(fileBase64)) {
      return res.status(400).json({ error: 'Paste your resume text/LaTeX or upload a file.' });
    }
    try {
      const { text: extracted, kind, error: extractError } = await extractResumeText({ text: resumeText, fileBase64, filename });
      if (extractError) return res.status(422).json({ error: extractError });
      if (!extracted.trim()) return res.status(422).json({ error: 'Your resume appears to be empty or unreadable.' });

      const result = await translate({ schoolId, codes, companyId, role, employment });
      const foundCourses = result.courses.filter((c) => c.found);
      const courseworkInject = foundCourses.map((c) => c.title).join(', ');
      const skillsInject = (result.resumeLines.skills.text || '').replace(/^Skills:\s*/, '');

      const tailored = tailorResume({
        resumeText: extracted,
        courseworkInject,
        skillsInject,
        companyName: result.company?.name,
      });

      res.json({
        inputKind: kind,
        inputFormat: tailored.inputFormat,
        latex: tailored.latex,
        changed: tailored.changed,
        notes: tailored.notes,
        injected: { coursework: courseworkInject, skills: skillsInject },
        company: result.company,
        scope: { label: result.scope.label, totalPostings: result.scope.totalPostings, source: result.scope.source, fellBack: result.scope.fellBack },
      });
    } catch (e) {
      if (e && e.code === 'UNKNOWN_COMPANY') return res.status(400).json({ error: 'Unknown company.' });
      res.status(500).json({ error: 'Resume tailoring failed.' });
    }
  });

  app.post('/api/assignment', postLimiter, (req, res) => {
    const { text, courseCode, schoolId } = req.body || {};
    if (!isNonEmptyString(text)) {
      return res.status(400).json({ error: 'text is required.' });
    }
    // Resolve course context when a code (+ optional school) is supplied, for nicer framing.
    let course = null;
    if (isNonEmptyString(courseCode)) {
      if (isNonEmptyString(schoolId) && getSchool(schoolId)) {
        const { found } = resolveCourses(schoolId, [courseCode]);
        course = found[0] || { code: courseCode.trim() };
      } else {
        course = { code: courseCode.trim() };
      }
    }
    try {
      const out = upgradeAssignment({ text, course });
      res.json(out);
    } catch (e) {
      res.status(500).json({ error: 'Assignment upgrade failed.' });
    }
  });

  app.post('/api/flag', postLimiter, (req, res) => {
    const { schoolId, courseCode, skillId, reason } = req.body || {};
    if (!isNonEmptyString(schoolId) || !isNonEmptyString(courseCode) || !isNonEmptyString(skillId)) {
      return res.status(400).json({ error: 'schoolId, courseCode, and skillId are required.' });
    }
    const entry = {
      ts: new Date().toISOString(),
      schoolId: schoolId.trim(),
      courseCode: courseCode.trim(),
      skillId: skillId.trim(),
      reason: isNonEmptyString(reason) ? reason.trim().slice(0, 1000) : null,
    };
    try {
      mkdirSync(DATA_DIR, { recursive: true });
      appendFileSync(FLAGS_PATH, JSON.stringify(entry) + '\n');
      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ error: 'Could not record flag.' });
    }
  });

  // ---- static UI (filled by Dev B; .gitkeep keeps the mount valid when empty) ----
  app.use(express.static(PUBLIC_DIR));

  return app;
}

// Start only when run directly.
const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  const app = createApp();
  const port = process.env.PORT || 3002;
  app.listen(port, () => {
    // eslint-disable-next-line no-console
    console.log(`Course Translator listening on http://localhost:${port}`);
  });
}

export default createApp;
