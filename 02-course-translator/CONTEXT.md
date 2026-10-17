# Course Translator — Context

## 1. What this is

Course Translator is a no-account, offline-first Node 22 + Express tool (port 3002, per CONVENTIONS.md) that serves one moment: an early-career student (freshman–junior with coursework but no job history) picks their school, types course codes like `CSCE 313, CSCE 221 MATH 304`, and picks a target role, and in under 60 seconds walks away with recruiter- and ATS-searchable skill lines they can paste into a resume. It turns invisible course codes into the employer language recruiters and ATS keyword filters actually search for — and does so trustworthily: every skill is backed by a real public catalog sentence and every demand number is counted from real live postings, never produced by an LLM.

## 2. Data flow, end to end

Input → catalog lookup → deterministic skill extraction (with evidence) → demand ranking from real postings → resume lines out.

1. **Input.** `{schoolId, codes, role}`. `codes` is a string or string[]; `catalog.parseCodeInput` splits a free-text blob on commas/semicolons/newlines/double-spaces and even single-spaced runs like `CSCE 313 CSCE 221` into code pairs. `role` is one of six keys in `ROLES` (swe, ml, data, systems, frontend, embedded).
2. **Catalog lookup.** `catalog.resolveCourses(schoolId, codes)` normalizes each code via `normCode` (uppercase, collapse to `CSCE 313`, inserting a space in `CSCE313`) and looks it up in the per-school `byCode` map loaded from `seed/catalogs/<school>.json`. Returns `{found: course[], unmatched: string[]}`. Courses carry real `description` text.
3. **Deterministic skill extraction (with evidence).** `skills.extractSkills(course.description)` matches canonical skills from `skills.data.js` against the catalog text. A skill is emitted ONLY if one of its aliases literally appears in the text. Matching discipline: alphabetic aliases (len ≥ 3) match case-insensitively on word boundaries; ambiguous short tokens in `CASE_SENSITIVE` (C, R, Go, AI, ML, CV, NLP, OS, OOP, C++, C#) must appear as an exact-case standalone token (so "can" never matches "C", "html" never matches "ML"); symbol tokens (c++, c#) match literally. For each matched skill it records the sentence that carried the match (via `splitSentences` from shared text.js) as `evidence`, de-duped by id (first evidence wins). This is pure and offline — no LLM, no network.
4. **Demand ranking from real postings.** Demand numbers come from counting real postings, never the LLM. `scripts/build-demand.js` fetches live postings for a curated ~19-company list via the shared fetchers (`fetchGreenhouse`/`fetchLever`/`fetchAshby`), classifies postings into roles by title keywords, counts skills per posting with `skills.skillDemand(postings)` (which reuses the same alias matchers over `posting.descriptionText`), and writes `data/demand.json` plus a committed `seed/demand.fallback.json` so offline mode has real, honest numbers. `demand.getDemandIndex(role)` reads the cache or the bundled fallback and never throws; `demand.rankSkillsByDemand(skills, role)` annotates each skill with `{count, totalPostings, pct}` and sorts desc by pct then name.
5. **Translate (the core).** `translate.translate({schoolId, codes, role})` is pure/no-network: catalog resolve → extractSkills per course → rank via demand.js → cap each course to its **top 4 skills by demand** → dedupe skills across courses for the Skills line.
6. **Resume lines out.** `resume.buildResumeLines(result)` produces `coursework:{text,latex}` (e.g. "Relevant Coursework: CSCE 313 (Introduction to Computer Systems), …") and `skills:{text,latex}` (demand-ordered unique employer phrases). LaTeX variants escape `#`, `&`, `_`, `%`, `{`, `}`.
7. **(P1) Assignment upgrade.** `assignment.upgradeAssignment({text, course?})` turns a pasted assignment description into one honest project bullet using ONLY the student's own words/skills — adding no tools or metrics they didn't write.

**Where the LLM is / is NOT allowed.** The LLM (Amazon Bedrock Converse via a future `shared/src/llm.js`, offline-first per CONVENTIONS.md, default `LLM_MODE=offline`) may ONLY do cosmetic rephrasing of an already-evidence-justified skill phrase and the assignment-bullet wording, using only facts already present; every LLM output would be schema-validated with a deterministic template fallback. The LLM is NEVER allowed to invent skills, decide what a course "probably covers," or produce any number shown to the user. All counts/percentages come from data/code. Today the tool runs fully template/deterministic since `shared/src/llm.js` is not built yet.

## 3. Component map

Tool modules (`02-course-translator/src/`):
- `skills.data.js` — The canonical taxonomy: `SKILLS[]` (each `{id, name, phrase, category, aliases[], roles[]}`), `SKILL_BY_ID`, `ROLES` (6 keys), `CASE_SENSITIVE`. `phrase` is the employer-language output; `aliases` are what gets matched in catalog text.
- `skills.js` — Matcher: `extractSkills(text)`, `skillDemand(postings)`, `findSkill(nameOrAlias)`, `listSkills()`. Pre-compiles one tester per alias. Depends on `skills.data.js` and shared `text.js`.
- `catalog.js` — Loads `seed/catalogs/*.json`: `listSchools()`, `getSchool(id)`, `listCourses(id)`, `resolveCourses(schoolId, codes)`, `parseCodeInput(str)`, `normCode(str)`, `_reset()`.
- `demand.js` — `getDemandIndex(role)`, `rankSkillsByDemand(skills, role)`. Reads `data/demand.json` else `seed/demand.fallback.json`. Never throws.
- `translate.js` — `translate({schoolId, codes, role}) -> TranslateResult`. Depends on catalog.js, skills.js, demand.js, resume.js.
- `resume.js` — `buildResumeLines(result)` + `escapeLatex`.
- `assignment.js` — `upgradeAssignment({text, course?})` (P1).
- `server.js` — `createApp()` Express app on `PORT||3002`; routes `/api/health`, `/api/schools`, `/api/roles`, `POST /api/translate`, `POST /api/assignment`, `POST /api/flag`, static `public/`. In-memory rate limit 30/60s/ip, 256kb JSON limit, 400 on bad input.
- `scripts/build-demand.js`, `scripts/scrape-catalog.js`.

Frontend + docs: `public/index.html`, `public/app.js`, `public/styles.css`, `README.md`, `DECISIONS.md`. Single-page flow with per-course cards, skill chips + demand %, a `<details>` disclosure of the catalog evidence sentence, a flag link, two copy blocks (Coursework / Skills, plain-text ↔ LaTeX toggle), a P1 assignment box; mobile-first, keyboard navigable, WCAG AA, aria-live results, no CDNs, plain-language privacy note.

Shared library (`../../shared/src/`) — imported by relative path:
- **Present and used:** `text.js`, `fetchers.js`, `registry.js`, `cache.js`.
- **Referenced but NOT yet present:** `shared/src/index.js` (barrel), `shared/src/skills.js` (skill mapping lives inside this tool instead so it is self-contained), `shared/src/llm.js` (Bedrock wrapper), `shared/src/rateLimit.js` (server.js ships its own tiny limiter instead). Code degrades gracefully when these are absent.

## 4. Trust / honesty rules (constrain the implementation)

- **Evidence required per skill.** A skill is emitted only if an alias literally appears in the catalog text, and the matched sentence is carried as `evidence` and shown in the UI. Enforced structurally in `extractSkills`.
- **Numbers from data, never the LLM.** Demand counts/percentages come from counting real live postings; the count and sample size (`totalPostings`) are shown so a weak signal is visible.
- **Offline-first.** The tool fully works with no AWS credentials: deterministic matching + a committed `seed/demand.fallback.json`. Tests never hit the network.
- **Catalog data honesty.** Seeded catalogs are verbatim real public catalog text with `source` URL and `fetchedAt`; the tool reports how many courses are loaded rather than padding to a target.
- **Privacy.** No account; processed in memory, nothing stored; in-memory rate limit on POST routes; plain-language privacy note in UI.

## 5. Current state vs. DoD gap

**Built and smoke-passing:** full backend engine (demand/translate/resume/assignment/server), scripts, `seed/demand.fallback.json` (generated from 4,800 real postings across 18 boards), the frontend, and docs. The only seeded catalog is Texas A&M (`seed/catalogs/tamu.json`, 41 real CSCE courses).

**Known gap vs PRD DoD:** DoD asks for 5 schools and 150+ CS/engineering courses. Currently only TAMU is seeded (41 courses). The path to close it is `scripts/scrape-catalog.js` pulling real public catalog descriptions (UT Austin uses placeholder course numbers in its catalog, so it needs care), seeding only verifiable real text and documenting any shortfall rather than inventing descriptions. Evidence-per-skill and no-account are already satisfied by design.

## 6. Glossary

- **ATS** — Applicant Tracking System: the keyword filter that screens a resume before a human sees it; the reason course codes must become searchable skill words.
- **Canonical skill id** — the stable kebab-case identifier of a skill in `skills.data.js` (e.g. `concurrency`), decoupled from its many `aliases` and its output `phrase`.
- **Demand %** — the share of role-relevant live postings that mention a skill (`count` / `totalPostings`), computed from real postings; never from an LLM.
- **Employer phrase** — the recruiter-searchable wording the tool outputs for a skill (the `phrase` field), as opposed to the academic course wording.
