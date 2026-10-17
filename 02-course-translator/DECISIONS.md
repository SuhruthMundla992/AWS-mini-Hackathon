# Decisions — Course Translator frontend & UX

A log of the UX and trust decisions behind the UI (`public/`) and docs. Backend decisions
live in Dev A's notes; this file covers what the student sees and why.

## Trust is a visible feature, not a footnote

- **Catalog evidence shown inline.** Every skill chip has a "Why this skill?" disclosure
  that reveals the exact catalog sentence the skill was matched from (`skill.evidence`).
  This is the core trust mechanic from the PRD ("numbers traceable to sources"), so it is a
  `<details>` element one tap away under each skill — not buried in a tooltip or a separate
  page. Rendered as a quoted sentence with a left border so it reads as a citation.
- **Demand badges are sourced from postings, not the LLM.** Each chip shows
  `in NN% of {role} postings`, pulled straight from `skill.demand.pct`. The badge's hover
  title shows the raw `count / totalPostings` so a weak signal is honest and visible, and
  low percentages (<10%) get a muted "weak signal" styling rather than being hidden. The
  footer states plainly that percentages are counted from real postings, never guessed by AI.
- **Unmatched codes are shown, not swallowed.** Codes the catalog doesn't have appear in a
  clearly labelled notice ("We don't have these in our catalog yet: …") so the student never
  wonders where a course went. Honesty over a tidy-looking result.

## Resume output

- **Two panels, each with a plain-text / LaTeX toggle.** The toggle is a two-button group
  with `aria-pressed`, driven entirely by `result.resumeLines` (`{coursework,skills}` each
  with `{text,latex}`). The frontend does no formatting of its own — it renders exactly what
  the API returns so text/LaTeX escaping stays the backend's single responsibility.
- **Copy-to-clipboard with graceful fallback.** Uses the async Clipboard API, falling back
  to a hidden-textarea `execCommand('copy')` for non-secure contexts. Button flips to
  "Copied" briefly so the action is confirmed without a disruptive alert.

## P1: assignment → bullet

- Reuses the school + first course code already entered above as optional context
  (`schoolId`, `courseCode`) so the student doesn't retype anything.
- Surfaces the API's `note` verbatim ("uses only your words") to reinforce that we add no
  tools or metrics the student didn't write.

## Flagging

- A per-skill "Flag" button posts to `/api/flag` with `{schoolId, courseCode, skillId, reason}`.
  Kept lightweight: a prompt for an optional reason, then an inline "Flagged ✓" confirmation.
  No moderation UI (matches the PRD's "partial" crowd-corrections scope).

## Accessibility choices

- Semantic landmarks (`header`/`main`/`footer`/`section`), a skip link, and one `<h1>` with a
  logical heading order.
- Every input has a programmatic `<label for>` plus `aria-describedby` helper text.
- Results use `role="status"`/`aria-live="polite"` for non-intrusive announcements; on success
  focus moves to the results heading (`tabindex="-1"`) so keyboard and screen-reader users land
  on the output.
- Visible 3px focus outlines on every interactive element; targets are ≥44px tall.
- Color palette chosen for WCAG AA contrast on its backgrounds; `prefers-reduced-motion`
  disables the loading spinner animation.
- Mobile-first CSS; layout works down to 360px and the output panels go two-up at ≥640px.

## Robustness

- All network calls go through small `apiGet`/`apiPost` helpers that parse JSON defensively and
  surface the API's `{error}` message (and a friendly 429 rate-limit message). A failed load of
  schools/roles degrades to a disabled-looking option instead of crashing the page.
- Rendering tolerates missing fields (no skills, no evidence, missing demand) so a partial API
  response never throws.

## Deliberately cut (and why)

- **Accounts, logins, saved history, dashboards.** None of them help a student paste one line,
  and they'd force data storage that contradicts the privacy promise. The footer states nothing
  is stored and no account is needed.
- **Career-center export (PRD P2).** Doesn't serve the student's one moment; out of scope.
- **No frameworks, bundlers, CDNs, or external fonts** per CONVENTIONS. Plain ES in one
  `app.js`, system font stack, so the page loads with zero third-party requests.

## Assumptions about the API

- `GET /api/roles` returns `{roles:{roleId:label}}` (an object, matching `ROLES` in
  `skills.data.js`), so the role `<select>` is built from `Object.entries`.
- `TranslateResult.courses[].found` may be `false`; such a course renders as a "no skills
  matched yet" card rather than being dropped.
- `resumeLines` always provides both `text` and `latex` for `coursework` and `skills`; the UI
  shows "(nothing to show yet)" if a field is empty rather than erroring.
- `/api/assignment` returns `{bullet, usedSkills, note}`; only `bullet` and `note` are shown.
