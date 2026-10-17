# Niche Career Tools Hackathon: Ideas + PRDs (source, transcribed from the PDF)

Oct 16, 2026 · @Suhruth

## Overview

Six tools, each doing one job for one moment in a student's search. None of them tries to be a full career platform. Each one takes a single input, gives a single output, and does it better than a general tool could.

**The rule for every track.** If a feature doesn't serve the one moment, cut it. A student should get value in under 2 minutes, with no account needed for the first use.

| # | Tool | The one moment it fixes | Input | Output |
|---|------|------------------------|-------|--------|
| 1 | Posting Decoder | "Am I even qualified for this?" while reading a posting | One posting URL | Real must-haves vs wishlist, and an apply-or-skip call |
| 2 | Course Translator | Resume lists "CSCE 313" and recruiters have no idea what that means | Course codes + school | Recruiter-searchable skill lines per course |
| 3 | Open Window | Missing internship deadlines because postings open early and close fast | Target companies | Predicted open dates + alert the day they go live |
| 4 | Booth Pitch | Freezing at a career fair booth | Company name + your resume | A 30-second pitch and 2 smart questions for that booth |
| 5 | Stack Match | "What should I build to get noticed by company X?" | One company | That company's real stack from its postings + one scoped project idea |
| 6 | Deep Dive Drill | "Walk me through this project" in interviews | One project | Likely follow-up questions + graded practice |

Each PRD below is self-contained. Hand one PRD (plus the Shared Plumbing section) to one agent.

---

## PRD 1: Posting Decoder

Paste one job posting. Posting Decoder tells you which requirements are real and which are copy-paste wishlist, then gives an apply-or-skip call against your resume.

**Problem.** Students skip jobs they'd get because a posting lists 14 "requirements." Many of those lines are boilerplate the company reuses on every posting. Nobody tells students which lines actually matter.

**Key insight.** Compare the posting to the same company's other postings and to similar roles market-wide. A line that appears on every posting at that company is boilerplate. A line unique to this team is the real signal.

**Users.** Students reading a specific posting and deciding whether to apply.

User stories
1. I paste a posting URL and see each requirement tagged: Core, Team-specific, or Boilerplate.
2. I see why: "This line appears on 92% of this company's engineering postings."
3. I upload my resume once and get: "You hit 4 of 5 core skills. Apply."
4. I see the one gap that matters most for this posting, and nothing else.

| Priority | Feature | Detail |
|---|---|---|
| P0 | Posting fetch + parse | Greenhouse, Lever, Ashby URLs first; plain-text paste as fallback |
| P0 | Requirement splitter | LLM breaks the posting into atomic requirements with required vs preferred tags |
| P0 | Boilerplate score | Fuzzy-match each line against the same company's other live postings; share of postings it appears on |
| P0 | Market rarity score | How often the skill appears in similar roles market-wide |
| P0 | Apply verdict | Apply / Stretch / Skip with one-sentence reason, based on core requirements only |
| P1 | Browser extension | Badge on Greenhouse/Lever/Ashby pages, one click to decode |
| P2 | "Years of experience" reality check | Compare stated YOE to the seniority of similar roles |

AI design
- Boilerplate and rarity scores are computed, not guessed. The LLM only splits text and writes the explanation.
- Verdict prompt gets the scored requirements + parsed resume. It must quote the resume line it used for each match.
- Never tells a student they "will" or "won't" get the job. Verdict is about whether applying is worth the time.

Success metrics
- Requirement split accuracy of 90%+ vs a human on 50 postings.
- Boilerplate tags agree with a human reviewer 85%+ of the time.
- Decode time under 8 seconds.

Definition of done
- Works on any public Greenhouse, Lever, or Ashby posting with no login.
- Every tag shows its evidence (percent and sample postings).
- Resume is optional and never stored unless the student opts in.

---

## PRD 2: Course Translator

Enter your school and course codes. Course Translator turns each course into the exact skill words recruiters and ATS filters search for, ranked by how often those words show up in current postings.

**Problem.** Early students have coursework, not job history. They list "CSCE 313, CSCE 221" on a resume. A recruiter at Meta has no idea that means systems programming, threads, and sockets in C++. The skills are real, but invisible.

**Key insight.** Course catalogs are public. Syllabi and catalog descriptions map cleanly to skills. Postings tell you which of those skill words employers actually use.

**Users.** Freshmen through juniors with thin experience sections.

User stories
1. I pick my school, type my course codes, and pick a target role.
2. For each course I get 2 to 4 skill phrases in employer language, ranked by current demand for my target role.
3. I get a ready-to-paste "Relevant Coursework" line and a "Skills" line.
4. If I paste my actual assignments (e.g. "built a shell in C"), it upgrades the line into a project-style bullet.

| Priority | Feature | Detail |
|---|---|---|
| P0 | Catalog ingestion | Scrape or upload course catalog descriptions; start with 5 schools (TAMU, UT Austin, and 3 others) |
| P0 | Course to skill mapping | LLM extracts skills from the catalog text, mapped to canonical skill IDs |
| P0 | Demand ranking | Rank each course's skills by share of postings for the target role |
| P0 | Resume line generator | Coursework line + skills line, plain text and LaTeX |
| P1 | Assignment upgrade | Paste an assignment description, get one honest project bullet |
| P1 | Crowd corrections | Students flag wrong mappings; corrections reviewed before going live |
| P2 | Career center export | Department-level "what our courses teach in employer terms" report |

AI design
- Mappings are precomputed per course and cached, so a student lookup is instant and consistent.
- Only map skills the catalog text or syllabus supports. No guessing that a course "probably" covers Docker.
- Bullet upgrade uses the student's own description and adds no tools or metrics they didn't mention.

Success metrics
- 90% of mapped skills judged accurate by a TA or student who took the course (sample of 40 courses).
- Time from school pick to copyable line under 60 seconds.

Definition of done
- 5 schools fully loaded, at least 150 CS and engineering courses mapped.
- Every skill shows the catalog sentence it came from.
- Works without an account.

---

## PRD 3: Open Window

Pick the companies you want. Open Window predicts when each one will open its internship postings, then pings you the hour they go live, with the posting already decoded.

**Problem.** Big tech internship postings open as early as July and some close after a few weeks or once they have enough applicants. Students who apply in week one have a real edge. Most students find out late, from a friend or a Discord.

**Key insight.** Public ATS boards (Greenhouse, Lever, Ashby) are pollable. Watch them every hour, keep history, and you can learn each company's yearly pattern.

**Users.** Students targeting a specific list of companies for next summer.

User stories
1. I add companies to a watchlist and pick role types (SWE intern, ML intern, hardware intern).
2. I see each company's predicted open window: "Usually opens Aug 1 to Aug 15 based on 2 prior seasons."
3. I get an alert (email, SMS, or Discord) within 1 hour of a matching posting going live.
4. I see when a posting disappears, so I know a window closed.

| Priority | Feature | Detail |
|---|---|---|
| P0 | Hourly board poller | Poll ~500 company boards, diff against last snapshot, store first-seen and last-seen times |
| P0 | Intern classifier | Title + description classifier for intern / new grad / co-op and role family |
| P0 | Watchlist + alerts | Email and Discord webhook first; SMS as P1 |
| P0 | Open window predictor | From history: median open date and spread per company and role type |
| P1 | Closed detector | Posting gone for 48+ hours = window closed; shown on the company card |
| P1 | Seed history | Backfill from public community repos of past internship listings where licensing allows |
| P2 | Workday support | Many large companies use Workday, which has no clean public board API; add carefully later |

AI design
- Mostly not an LLM problem, and that's fine. The classifier can be a small LLM call per new posting, cached forever.
- Prediction is plain statistics. Show the sample size so students know when a guess is weak.

Success metrics
- Alert latency under 60 minutes for 95% of new postings on watched boards.
- Intern classifier precision of 95%+ (a false alert costs trust).

Definition of done
- Runs unattended for 14 days with no missed polls.
- Every alert links straight to the apply page.
- One-click unsubscribe, no more than one digest per day unless the student opts into instant alerts.

---

## PRD 4: Booth Pitch

Pick a company at your career fair. Booth Pitch writes a 30-second pitch linking your strongest project to what that company is hiring for right now, plus 2 questions that show you did your homework. Then it lets you rehearse it out loud.

**Problem.** Career fairs give you about a minute per booth. Students either recite a generic intro or freeze. Recruiters remember the student who connected their work to the team's actual needs.

**Key insight.** The company's current open postings tell you exactly what they need. Match one of your projects to one of those needs and the pitch writes itself.

**Users.** Students prepping the night before or the morning of a career fair.

User stories
1. I upload my resume once and pick my school's career fair (or type company names).
2. For each company I get a 30-second pitch (about 75 words) that names one current opening and ties my best-fit project to it.
3. I get 2 specific questions to ask, based on their postings and recent public news.
4. I practice the pitch out loud and get timing and filler-word feedback.
5. I export a one-page cheat sheet for all my booths, sorted by my fit.

| Priority | Feature | Detail |
|---|---|---|
| P0 | Fair company list | Import from Handshake export or paste names; resolve each to its job board |
| P0 | Best-fit opening | Pick the posting at that company closest to the student's profile |
| P0 | Pitch generator | 70 to 85 words: who I am, one project, why it fits this opening, ask |
| P0 | Smart questions | 2 questions grounded in postings or cited news; no questions answerable from their homepage |
| P1 | Voice rehearsal | Browser speech-to-text; flags over 35 seconds, filler words, and missing the ask |
| P1 | Cheat sheet PDF | One line per booth: opening, pitch hook, questions |
| P2 | Follow-up email | Post-fair thank-you draft referencing what was discussed (student types notes) |

AI design
- Pitch can only cite projects and facts from the resume. Unverifiable claims are blocked.
- Questions must cite a source (posting text or a news URL). Drop any question without one.
- Tone presets: confident, friendly, technical. Short sentences that sound natural spoken aloud.

Success metrics
- 80% of test students say the pitch sounds like them after at most one edit.
- Pitch length lands in 25 to 35 seconds spoken for 90% of outputs.

Definition of done
- Works for a 40-company fair list in under 3 minutes total.
- Cheat sheet prints cleanly on one page per 10 companies.

---

## PRD 5: Stack Match

Name one company. Stack Match reads all of that company's engineering postings, figures out its real tech stack, and gives you one project you can build in 2 to 4 weeks that uses that stack and solves a problem close to their product.

**Problem.** Students build the same todo apps and weather dashboards. Recruiters at a specific company see nothing that connects to their world. Students don't know what a company actually runs on, or what kind of project would make an engineer there nod.

**Key insight.** A company's postings, taken together, describe its stack better than its marketing does. 40 postings mentioning Go, Kafka, and Kubernetes is a strong signal.

**Users.** Students with one or two dream companies and a few free weeks.

User stories
1. I type "Nvidia" and see its stack ranked by how many engineering postings mention each tool.
2. I filter by team or role type (e.g. intern only, or "systems").
3. I tell it my current skills and hours per week, and get one project idea with scope, milestones, and a stretch goal.
4. I get a one-line "why this matters to them" I can use in a cover letter or at a booth.

| Priority | Feature | Detail |
|---|---|---|
| P0 | Company postings pull | All engineering postings from the company's board(s) |
| P0 | Stack extraction | Tools, languages, frameworks, infra; counted per posting, grouped by team |
| P0 | Stack card | Ranked list with counts and sample posting links |
| P0 | Project generator | One project: problem, stack used, 3 to 4 milestones, "done" criteria, stretch goal, sized to the student's hours |
| P1 | Overlap view | Which parts of the stack the student already knows |
| P1 | Starter repo | Generate a README and folder skeleton for the project |
| P2 | Compare companies | Stack overlap across 2 to 3 target companies so one project serves all |

AI design
- Stack counts come from extraction + SQL. The LLM writes the project idea only from the top stack items and the student's skills.
- Project generator must avoid using the company's private data, logos, or claiming affiliation. Use public datasets.
- Sizing check: total milestone hours must fit the student's budget within 15%.

Success metrics
- Stack card matches what an engineer at the company would call accurate for 4 of 5 test companies.
- 60% of test students say they'd actually build the suggested project.

Definition of done
- Works for any company with a public Greenhouse, Lever, or Ashby board.
- Every stack item links to at least 2 postings that mention it.
- Project idea includes a public dataset or API that actually exists (link checked).

---

## PRD 6: Deep Dive Drill

Pick one project from your resume. Deep Dive Drill reads its code, then grills you the way an interviewer would: why this design, what breaks at scale, what you'd change. It only does this one question type, and does it well.

**Problem.** "Walk me through a project" is in almost every internship interview. Students built the thing but can't explain tradeoffs, or fall apart on the third follow-up. General mock interview tools ask generic questions that don't touch the actual code.

**Key insight.** The best follow-up questions come from the code itself: the database choice, the missing tests, the hardcoded config. Read the repo and you can ask what a sharp interviewer would ask.

**Users.** Students with an interview coming up who will be asked about a specific project.

User stories
1. I paste a GitHub repo link (or a write-up if no code) and say which role I'm interviewing for.
2. It asks me to give my 60-second overview first, then asks 3 to 5 follow-ups that get harder.
3. Questions reference my real code: "You poll the API every 5 seconds in sync.py. Why not webhooks?"
4. After each answer I get one strength, one fix, and the key point I missed.
5. I get a "weak spots" list to review before the interview.

| Priority | Feature | Detail |
|---|---|---|
| P0 | Repo reader | Clone, map structure, pick 10 to 15 "decision points" (data store, concurrency, error handling, tests, deploy) |
| P0 | Question ladder | Overview, then why, then what-if-scale, then what-would-you-change; each cites a file |
| P0 | Answer grading | 1 to 4 on accuracy, tradeoff reasoning, clarity; each score quotes the answer |
| P0 | Weak spots list | Topics the student fumbled, with a short explainer for each |
| P1 | Voice mode | Speak answers; pacing and filler feedback |
| P1 | Role tuning | Backend, ML, embedded, etc. shift which decision points get asked |
| P2 | Team project mode | Ask the student which parts they wrote and only quiz on those |

AI design
- Separate passes: repo analyzer builds a decision-point sheet with file citations; interviewer only asks about the sheet; grader is a separate prompt with a fixed rubric.
- Grader calibration on 30 human-scored answers, target within 1 point on 85%.
- Repo code is deleted after the sheet is built.

Success metrics
- 90% of questions reference a real file or function in the repo.
- Students rate questions as "realistic" 4+ out of 5 on average.
- Weak-spot topics improve on a second session for 60% of returning students.

Definition of done
- Works on public repos in Python, JS/TS, Java, C/C++, and Go.
- A full drill runs in under 15 minutes.
- Rubric and calibration set are in the repo.

---

## Shared plumbing

Four of the six tools need the same thing: clean postings with skills pulled out. Build that once as a small library, not a platform. Each tool stays standalone and can ship on its own.

What's in it
- **Board fetchers** for public ATS job boards: Greenhouse (`boards-api.greenhouse.io/v1/boards/{token}/jobs?content=true`), Lever (`api.lever.co/v0/postings/{slug}?mode=json`), and Ashby (`api.ashbyhq.com/posting-api/job-board/{name}`). All public, no key.
- **Skill extractor**: one LLM call per posting returning required and preferred skills as canonical IDs, cached by description hash.
- **Resume parser**: PDF/DOCX to JSON (education, projects, skills, experience).
- **Company registry**: company name to board type + slug, seeded with ~500 companies.

| Tool | Fetchers | Skill extractor | Resume parser | Registry |
|---|---|---|---|---|
| Posting Decoder | Yes | Yes | Optional | Yes |
| Course Translator | For demand ranking | Yes | No | No |
| Open Window | Yes, hourly | No | No | Yes |
| Booth Pitch | Yes | Yes | Yes | Yes |
| Stack Match | Yes | Yes | Optional | Yes |
| Deep Dive Drill | No | No | No | No |

Lightcast's free Skills API went nonprofit-only in April 2026, so seed the skills list from O*NET and ESCO instead. For broader coverage beyond ATS boards, JSearch has a free tier.

## Running it with agents

Build the shared plumbing first, then run all six tools in parallel.

Kickoff rules (apply to every track):
- Use the shared plumbing library for postings, skills, and resumes. Don't fork it; open an issue if you need a change.
- Ship P0 first, end to end, before any P1. Stay narrow: if a feature doesn't serve this tool's one moment, don't build it.
- Numbers shown to users come from data, never from the LLM.
- Write tests for every endpoint and an eval set for every LLM step.
- Keep a DECISIONS.md log and a README with setup steps.
- Stop and ask before adding a paid dependency.

## Production-ready checklist (every track)
- Auth on every non-public route; users can export and delete their data
- LLM calls have timeouts, retries, cost caps, and structured-output validation
- Prompt and model versions logged with every output
- Eval suite runs in CI and blocks merges on regressions
- Rate limiting and abuse protection on public endpoints
- Error tracking (Sentry) and basic analytics
- Accessibility pass (keyboard nav, contrast, alt text)
- Privacy note in plain language: what's stored, for how long, who sees it

## Judging rubric
| Criterion | Weight | What great looks like |
|---|---|---|
| Real data, real signal | 25% | Live postings, numbers traceable to sources |
| Student impact | 25% | A student leaves with a concrete next action |
| Trustworthiness | 20% | No invented facts, clear evidence, honest limits |
| Product polish | 15% | Fast, clean, works on mobile |
| Technical depth | 15% | Good evals, sensible architecture, tests |
