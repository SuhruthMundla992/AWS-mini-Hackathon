# Course Translator — API & module contract (shared by all agents)

This is the single source of truth both dev agents build against. Do not change a signature
without updating this file. Reviewers check code against this contract.

## Already built (do NOT rewrite; import and use)

- `src/skills.data.js` — `SKILLS[]`, `SKILL_BY_ID`, `ROLES` (keys: swe, ml, data, systems, frontend, embedded), `CASE_SENSITIVE`.
- `src/skills.js`
  - `extractSkills(text) -> [{id,name,phrase,category,roles,evidence,required}]`
  - `skillDemand(postings) -> Map<id,{count,postingIds[]}>`
  - `findSkill(nameOrAlias) -> skill|null`
  - `listSkills() -> SKILLS`
- `src/catalog.js`
  - `listSchools() -> [{schoolId,school,courseCount,source,fetchedAt}]`
  - `getSchool(id)`, `listCourses(id)`
  - `resolveCourses(schoolId, codes[]) -> {found: course[], unmatched: string[]}`
  - `parseCodeInput(str) -> string[]`
  - `normCode(str)`
  - course shape: `{code, normCode, title, dept, credits, description, schoolId}`
- Shared library (import via relative path from `src/`):
  - `../../shared/src/text.js` (htmlToText, splitLines, splitSentences, normalizeLine, similarity, truncate, escapeRegex, sha256)
  - `../../shared/src/fetchers.js` (fetchGreenhouse/Lever/Ashby, fetchBoard, fetchCompanyPostings, FetchError)
  - `../../shared/src/registry.js` (resolveCompany, listCompanies) — NOTE companies.json may be empty; demand builder must carry its own company list.

## UPDATE (company-specific redesign) — current contract

The flow is now school → level-grouped course checkboxes → company → employment (intern/fulltime)
→ role function. Demand is counted LIVE from the chosen company's postings.

New/changed endpoints:
- `GET /api/courses?schoolId=ID -> {school, schoolId, levels:[{level, label, courses:[{code,title}]}]}`
- `GET /api/companies -> {companies:[{id,name}]}`
- `GET /api/filters -> {roles:{id:label}, employment:{intern,fulltime}, companies:[{id,name}]}`
- `POST /api/translate {schoolId, codes:[string], companyId, role, employment} -> TranslateResult` (now async; scrapes live)

New modules:
- `src/companies.js` — `listCompanies()`, `getCompany(id)`; 10 verified public-board companies.
- `src/jobs.js` — `companyDemand({companyId, role, employment})` (live fetch + filter + count; falls back to market index if a board is unreachable; `EMPLOYMENT_TYPES`), plus role/employment classifiers.
- `src/catalog.js` adds `courseLevel(code)` and `listCoursesByLevel(schoolId)`.

Updated TranslateResult:
```
{
  school:{schoolId,school,source},
  company:{id,name},
  role, roleLabel, employment,
  courses:[{code,title,found,skills:[{id,name,phrase,category,evidence,demand:{count,totalPostings,pct}}]}],
  unmatched:[],
  scope:{label, totalPostings, totalScanned, source:'live'|'market', fellBack:null|'employment'|'role'|'market'},
  resumeLines:{coursework:{text,latex}, skills:{text,latex}},
  meta:{source, llmUsed:false}
}
```
`translate()` accepts a test-only `_demand` seam to inject a companyDemand() result and avoid network in tests.

---

## Modules Dev A owns (backend engine + API) — original (superseded by the UPDATE above)

- `src/demand.js`
  - `getDemandIndex(role) -> {role, totalPostings, generatedAt, counts: {skillId: {count, pct, postingIds[]}}}` — reads `data/demand.json` if present; else returns a bundled fallback shipped at `seed/demand.fallback.json` (so the tool works offline with honest numbers). Never throws.
  - `rankSkillsByDemand(skills[], role) -> same skills each annotated with {demand:{count,totalPostings,pct}}` sorted desc by pct then name.
- `src/translate.js`
  - `translate({schoolId, codes, role}) -> TranslateResult` (see below). Pure (no network): mapping from catalog text via extractSkills, ranking via demand.js. Caps per-course skills to top 4 by demand. Dedupes skills across courses for the Skills line.
- `src/resume.js`
  - `buildResumeLines(result) -> {coursework:{text,latex}, skills:{text,latex}}`. Coursework line = "Relevant Coursework: CSCE 313 (Introduction to Computer Systems), ...". Skills line = demand-ordered unique skill phrases. LaTeX variants escape `#`,`&`,`_`,`%`.
- `src/assignment.js` (P1)
  - `upgradeAssignment({text, course?}) -> {bullet, usedSkills[], note}`. Uses ONLY words/skills present in `text`. Adds no tools or metrics the student didn't write. Deterministic template; optional LLM rephrase via `../../shared/src/llm.js` only if present/enabled, else template.
- `src/server.js` — Express app on `process.env.PORT || 3002`.
  - `export function createApp()` returning the express app (so tests can import without listening), and start the server only when run directly (`if (import.meta.url === ...)`).
  - Routes:
    - `GET /api/health -> {ok:true}`
    - `GET /api/schools -> {schools:[...]}`
    - `GET /api/roles -> {roles: ROLES}`
    - `POST /api/translate {schoolId, codes (string or string[]), role} -> TranslateResult`
    - `POST /api/assignment {text, courseCode?, schoolId?} -> {bullet, usedSkills, note}`
    - `POST /api/flag {schoolId, courseCode, skillId, reason} -> {ok:true}` (append JSONL to `data/flags.jsonl`)
    - static `public/`
  - In-memory rate limit on POST routes (reuse `../../shared/src/rateLimit.js` if it exists, else a tiny local limiter): 30 req / 60s / ip.
  - JSON body limit 256kb. Validate inputs; 400 on bad input with `{error}`.
- `scripts/build-demand.js` — fetch live postings for a curated company list (carry the list in-file; ~15 verified companies across greenhouse/lever/ashby), classify each posting into roles by title keywords, count skills via `skillDemand`, write `data/demand.json` {generatedAt, roles:{role:{totalPostings, counts}}}. Also (re)write `seed/demand.fallback.json` so offline mode has real numbers committed.
- `scripts/scrape-catalog.js` — given a catalog URL + a dept code, extract `{code,title,description}` into `seed/catalogs/<id>.json`. Document usage in README. Best-effort; TAMU already seeded.

### TranslateResult shape
```
{
  school: {schoolId, school, source},
  role: 'swe',
  roleLabel: 'Software Engineer',
  courses: [
    { code, title, found: true,
      skills: [ {id,name,phrase,category,evidence, demand:{count,totalPostings,pct}} ] }  // top 4
  ],
  unmatched: ['CSCE 999'],
  resumeLines: { coursework:{text,latex}, skills:{text,latex} },
  meta: { demandGeneratedAt, llmUsed:false }
}
```

## Module Dev B owns (frontend + docs)

- `public/index.html` + `public/app.js` + `public/styles.css`
  - Single-page flow: school `<select>` (from GET /api/schools), course codes `<textarea>`, role `<select>` (from GET /api/roles), "Translate" button.
  - Renders per-course cards: course title, each skill as a chip with its demand % and a disclosure showing the catalog evidence sentence. A "flag" link per skill (POST /api/flag).
  - Two copy-to-clipboard blocks: Relevant Coursework and Skills (toggle plain text / LaTeX).
  - P1: an "Assignment → bullet" box (POST /api/assignment).
  - Mobile-first, responsive, keyboard navigable, labelled inputs, good contrast (WCAG AA), visible focus states, aria-live for results, no external CDNs.
  - Plain-language privacy note: nothing is stored; no account.
- `README.md` — setup (`npm install`), run (`npm start` → http://localhost:3002), `npm test`, `npm run build-demand`, how to add a school with the scraper, env vars.
- `DECISIONS.md` — reasoning log (why deterministic mapping, offline-first demand, honesty on catalog data, cut features).

## Tests (reviewers own in Wave 2)
`test/*.test.js` with `node --test`, no network. Cover catalog resolve, skill extraction false-positives, translate end-to-end on the sample, resume line generation (text+LaTeX escaping), and all API routes via `createApp()` on an ephemeral port. Add `test/evals/course-skills.labeled.json` for mapping accuracy.
