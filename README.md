# Niche Career Tools — Hackathon

Six focused tools, each doing one job for one moment in a student's job search. See
`PRDS_SOURCE.md` for the full product briefs and `CONVENTIONS.md` for the shared build rules.

## What's here

| Path | What it is | Status |
|------|------------|--------|
| `02-course-translator/` | **Course Translator** — turn the courses you've taken into the exact skills a specific company's live job postings ask for, backed by your school's public catalog. | Built, tested (52 tests), running |
| `shared/` | Shared plumbing: public ATS board fetchers (Greenhouse/Lever/Ashby), text utils, company registry, TTL cache. | Partial (used by Course Translator) |
| `PRDS_SOURCE.md` | All six product briefs, transcribed from the hackathon PDF. | — |
| `CONVENTIONS.md` | Stack, layout, ports, LLM strategy, privacy rules every tool follows. | — |

The remaining five tools (Posting Decoder, Open Window, Booth Pitch, Stack Match, Deep Dive
Drill) are specced in `PRDS_SOURCE.md` and not yet built.

## Course Translator (the built tool)

```bash
cd 02-course-translator
npm install
npm start          # http://localhost:3002  (landing page -> app)
npm test           # 52 tests, no network
```

Flow: pick your school → check courses (grouped by level) → pick a company, internship vs
full-time, and a role → the app scans that company's **live** postings and shows the skills
your courses prove that those postings ask for, ranked by real demand. Every skill links to
the catalog sentence it came from; every percentage is counted from real postings, never from
an LLM. You can also tailor your resume's Coursework/Skills (paste LaTeX to edit in place, or
upload a PDF/DOCX for a clean LaTeX version). No account, nothing stored.

See `02-course-translator/README.md` and `02-course-translator/PRD_ELABORATED.md` for details
and the full build log.
