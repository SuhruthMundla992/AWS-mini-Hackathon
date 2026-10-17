# Workspace conventions (all tracks)

Every tool agent follows this so the six tools look and run the same way.

## Layout

```
AWS_Mini_hackathon/
  PRDS_SOURCE.md          # original PRDs (do not edit)
  CONVENTIONS.md          # this file
  shared/                 # shared plumbing library (built first)
  01-posting-decoder/
  02-course-translator/
  03-open-window/
  04-booth-pitch/
  05-stack-match/
  06-deep-dive-drill/
```

Each tool folder contains:
- `PRD_ELABORATED.md` — the fleshed-out PRD written BEFORE coding, with a running
  "Development log & reasoning" section appended to while building.
- `README.md` — setup, run, test commands.
- `package.json`, `src/`, `public/` (static UI), `test/`, `evals/`.

## Stack

- Node.js 22, plain ES modules (`"type": "module"`), no TypeScript build step.
- Server: Express 4 (pinned exact version). One server per tool, serves `public/` as static UI.
- UI: a single static `public/index.html` + `app.js` + `styles.css`. No framework, no bundler.
  Must be mobile friendly, keyboard navigable, good contrast, labelled inputs.
- Tests: built-in `node --test` (no Jest/Vitest). Use `supertest` for endpoints only if needed;
  otherwise start the app on an ephemeral port and use global `fetch`.
- Exact pinned dependency versions only. No paid dependencies.

## Ports

| Tool | Port |
|---|---|
| 01 Posting Decoder | 3001 |
| 02 Course Translator | 3002 |
| 03 Open Window | 3003 |
| 04 Booth Pitch | 3004 |
| 05 Stack Match | 3005 |
| 06 Deep Dive Drill | 3006 |

Read port from `process.env.PORT` with the default above.

## Shared library

Import the shared plumbing with a relative path, e.g.
`import { fetchBoard, extractSkills } from '../../shared/src/index.js';`
Do not copy or fork it. If a change is truly needed, keep it backwards compatible and note it
in `shared/ISSUES.md`.

## LLM

- Provider: Amazon Bedrock (Converse API) through `shared/src/llm.js`.
- No AWS credentials are present on the dev machine, so every LLM step MUST have a
  deterministic offline fallback (rules/templates) that produces valid output. The app must
  fully work offline-from-LLM; Bedrock only improves wording/splitting when available.
  Set `LLM_MODE=bedrock` to enable Bedrock; default is `offline`.
- Every LLM output is validated against a schema; invalid output falls back to the
  deterministic path. Log prompt version + model id with each output.
- Numbers shown to users come from data/code, never from the LLM.

## Data

- Live data from public ATS boards (Greenhouse, Lever, Ashby) is reachable from this machine.
- Tests must NOT hit the network: use fixtures in `shared/fixtures/` or the tool's own `test/fixtures/`.
- Local persistence: JSON files under the tool's `data/` folder (gitignored). No external DB.

## Privacy & safety

- No account needed for first use. Resumes are processed in memory and never stored unless
  the user explicitly opts in.
- Basic in-memory rate limit on public POST endpoints.
- Every tool UI includes a short plain-language privacy note.
