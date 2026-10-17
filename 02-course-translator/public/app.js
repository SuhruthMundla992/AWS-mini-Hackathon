/* Course Translator — frontend (vanilla, dependency-free).
 *
 * Flow: pick school -> check courses (grouped by level) -> pick company -> pick employment
 * (intern/full-time) -> pick role function -> get the skills from those courses that THIS
 * company's matching live postings ask for.
 *
 * API (see API_CONTRACT.md):
 *   GET  /api/schools    -> { schools:[{schoolId, school, courseCount, source, fetchedAt}] }
 *   GET  /api/courses?schoolId=ID -> { school, schoolId, levels:[{level,label,courses:[{code,title}]}] }
 *   GET  /api/filters    -> { roles:{id:label}, employment:{id:label}, companies:[{id,name}] }
 *   POST /api/translate  { schoolId, codes:[codes], companyId, role, employment } -> TranslateResult
 *   POST /api/assignment { text, courseCode?, schoolId? } -> { bullet, usedSkills, note }
 *   POST /api/flag       { schoolId, courseCode, skillId, reason } -> { ok:true }
 */

'use strict';

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null) continue;
    if (k === 'class') node.className = v;
    else if (k === 'text') node.textContent = v;
    else if (k === 'html') node.innerHTML = v;
    else if (k.startsWith('data-') || k.startsWith('aria-')) node.setAttribute(k, v);
    else if (k in node) node[k] = v;
    else node.setAttribute(k, v);
  }
  for (const c of [].concat(children)) {
    if (c == null) continue;
    node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
  }
  return node;
}

async function apiGet(path) {
  const res = await fetch(path, { headers: { Accept: 'application/json' } });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data && data.error ? data.error : `Request failed (${res.status})`);
  return data;
}

async function apiPost(path, body) {
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = data && data.error ? data.error : (res.status === 429
      ? 'You are going a little fast — please wait a moment and try again.'
      : `Request failed (${res.status})`);
    throw new Error(msg);
  }
  return data;
}

function setBusy(btn, busy) {
  const spinner = $('.spinner', btn);
  btn.setAttribute('aria-busy', busy ? 'true' : 'false');
  btn.disabled = busy;
  if (spinner) spinner.hidden = !busy;
}

function setStatus(node, msg, isError = false) {
  node.textContent = msg || '';
  node.classList.toggle('is-error', !!isError);
}

async function copyText(text, btn) {
  const done = () => {
    const original = btn.textContent;
    btn.textContent = 'Copied';
    btn.classList.add('copied');
    setTimeout(() => { btn.textContent = original; btn.classList.remove('copied'); }, 1600);
  };
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(text);
    } else {
      const ta = el('textarea', { value: text, style: 'position:fixed;left:-9999px;' });
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
    }
    done();
  } catch {
    btn.textContent = 'Press Ctrl/Cmd+C';
    setTimeout(() => { btn.textContent = 'Copy'; }, 2000);
  }
}

function formatDate(v) {
  if (!v) return '';
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? String(v) : d.toISOString().slice(0, 10);
}

/* ---------------- app state ---------------- */

const state = {
  resumeLines: null,
  formats: { coursework: 'text', skills: 'text' },
  bullet: '',
  resumeLatex: '',
  lastSelection: null,
};

/* ---------------- load selectors ---------------- */

async function loadSchools() {
  const sel = $('#school');
  try {
    const data = await apiGet('/api/schools');
    const schools = (data && data.schools) || [];
    sel.innerHTML = '';
    sel.appendChild(el('option', { value: '', text: schools.length ? 'Select a school…' : 'No schools available' }));
    for (const s of schools) {
      const count = Number.isFinite(s.courseCount) ? ` (${s.courseCount} courses)` : '';
      sel.appendChild(el('option', { value: s.schoolId, text: `${s.school}${count}` }));
    }
  } catch (err) {
    sel.innerHTML = '';
    sel.appendChild(el('option', { value: '', text: 'Could not load schools' }));
    console.error('loadSchools', err);
  }
}

async function loadFilters() {
  try {
    const data = await apiGet('/api/filters');
    // companies
    const companySel = $('#company');
    const companies = (data && data.companies) || [];
    companySel.innerHTML = '';
    companySel.appendChild(el('option', { value: '', text: companies.length ? 'Select a company…' : 'No companies available' }));
    for (const c of companies) companySel.appendChild(el('option', { value: c.id, text: c.name }));
    // roles
    const roleSel = $('#role');
    const roles = (data && data.roles) || {};
    roleSel.innerHTML = '';
    roleSel.appendChild(el('option', { value: '', text: 'Select a role function…' }));
    for (const [id, label] of Object.entries(roles)) roleSel.appendChild(el('option', { value: id, text: label }));
  } catch (err) {
    console.error('loadFilters', err);
    $('#company').innerHTML = '';
    $('#company').appendChild(el('option', { value: '', text: 'Could not load companies' }));
    $('#role').innerHTML = '';
    $('#role').appendChild(el('option', { value: '', text: 'Could not load roles' }));
  }
}

async function loadCourses(schoolId) {
  const picker = $('#courses-picker');
  picker.innerHTML = '';
  if (!schoolId) {
    picker.appendChild(el('p', { class: 'help muted', text: 'Choose a school to load its courses…' }));
    return;
  }
  picker.appendChild(el('p', { class: 'help muted', text: 'Loading courses…' }));
  try {
    const data = await apiGet(`/api/courses?schoolId=${encodeURIComponent(schoolId)}`);
    const levels = (data && data.levels) || [];
    picker.innerHTML = '';
    if (!levels.length) {
      picker.appendChild(el('p', { class: 'help muted', text: 'No courses found for this school.' }));
      return;
    }
    for (const lvl of levels) {
      const group = el('fieldset', { class: 'level-group' });
      group.appendChild(el('legend', { text: lvl.label }));
      const grid = el('div', { class: 'course-options' });
      for (const c of lvl.courses) {
        const id = `course-${c.code.replace(/\s+/g, '-')}`;
        const label = el('label', { class: 'course-option', for: id });
        label.appendChild(el('input', { type: 'checkbox', id, value: c.code, 'data-course': '1' }));
        label.appendChild(el('span', { class: 'course-option-code', text: c.code }));
        label.appendChild(el('span', { class: 'course-option-title', text: c.title }));
        grid.appendChild(label);
      }
      group.appendChild(grid);
      picker.appendChild(group);
    }
  } catch (err) {
    picker.innerHTML = '';
    picker.appendChild(el('p', { class: 'help muted', text: 'Could not load courses for this school.' }));
    console.error('loadCourses', err);
  }
}

function selectedCourses() {
  return $$('#courses-picker input[data-course]:checked').map((cb) => cb.value);
}

function selectedEmployment() {
  const checked = $('input[name="employment"]:checked');
  return checked ? checked.value : 'intern';
}

/* ---------------- render results ---------------- */

function renderResults(result) {
  const section = $('#results-section');
  section.hidden = false;

  // meta line
  const meta = $('#results-meta');
  const parts = [];
  if (result.company && result.company.name) parts.push(result.company.name);
  if (result.employment) parts.push(result.employment === 'intern' ? 'Internship' : 'Full-time');
  if (result.roleLabel) parts.push(result.roleLabel);
  const scanned = result.scope && Number.isFinite(result.scope.totalPostings) ? result.scope.totalPostings : null;
  let metaText = parts.join(' · ');
  if (scanned != null) metaText += ` — ${scanned} matching posting${scanned === 1 ? '' : 's'} scanned`;
  meta.textContent = metaText;

  // scope note: fallbacks / market source
  const note = $('#scope-note');
  const s = result.scope || {};
  let noteMsg = '';
  if (s.source === 'market') {
    noteMsg = `Couldn't reach ${result.company && result.company.name}'s live board, so these numbers come from recent market data for this role.`;
  } else if (s.fellBack === 'employment') {
    noteMsg = `No open ${result.employment === 'intern' ? 'internship' : 'full-time'} postings matched right now, so we ranked against all ${result.roleLabel || 'matching'} roles at ${result.company && result.company.name}.`;
  } else if (s.fellBack === 'role') {
    noteMsg = `No postings matched that role right now, so we ranked against all open roles at ${result.company && result.company.name}.`;
  }
  if (noteMsg) { note.hidden = false; note.textContent = noteMsg; } else { note.hidden = true; note.textContent = ''; }

  // resume lines
  state.resumeLines = result.resumeLines || { coursework: { text: '', latex: '' }, skills: { text: '', latex: '' } };
  renderOutput('coursework');
  renderOutput('skills');

  // unmatched
  const unmatched = $('#unmatched');
  const codes = Array.isArray(result.unmatched) ? result.unmatched : [];
  if (codes.length) {
    unmatched.hidden = false;
    unmatched.innerHTML = '';
    unmatched.appendChild(el('strong', { text: "We don't have these in our catalog yet: " }));
    codes.forEach((c, i) => {
      unmatched.appendChild(el('code', { text: c }));
      if (i < codes.length - 1) unmatched.appendChild(document.createTextNode(' '));
    });
  } else {
    unmatched.hidden = true;
    unmatched.innerHTML = '';
  }

  // course cards
  const container = $('#courses');
  container.innerHTML = '';
  const scopeLabel = (result.scope && result.scope.label) || 'matching postings';
  for (const course of (Array.isArray(result.courses) ? result.courses : [])) {
    container.appendChild(renderCourseCard(course, result.school, scopeLabel));
  }

  // scanned postings panel + reveal the resume-tailoring section
  renderPostings(result.scope);
  state.lastSelection = {
    schoolId: result.school && result.school.schoolId,
    companyId: result.company && result.company.id,
  };
  $('#resume-section').hidden = false;

  section.classList.remove('results-animate'); void section.offsetWidth; section.classList.add('results-animate');
  $('#results-heading').focus();
}

function renderCourseCard(course, school, scopeLabel) {
  const found = course.found !== false && Array.isArray(course.skills) && course.skills.length > 0;
  const card = el('article', { class: `course-card${found ? '' : ' not-found'}` });
  card.appendChild(el('h4', { text: course.title || course.code || 'Course' }));
  card.appendChild(el('p', { class: 'course-code', text: course.code || '' }));
  if (!found) {
    card.appendChild(el('p', { text: 'No catalog-backed skills matched this course yet.' }));
    return card;
  }
  const list = el('ul', { class: 'skill-list' });
  for (const skill of course.skills) list.appendChild(renderSkill(skill, course, school, scopeLabel));
  card.appendChild(list);
  return card;
}

function renderSkill(skill, course, school, scopeLabel) {
  const li = el('li', { class: 'skill' });
  const top = el('div', { class: 'skill-top' });
  top.appendChild(el('span', { class: 'chip', text: skill.phrase || skill.name || skill.id }));

  const demand = skill.demand || {};
  const pct = Number.isFinite(demand.pct) ? demand.pct : null;
  if (pct != null) {
    const badge = el('span', {
      class: `badge${pct < 10 ? ' badge-weak' : ''}`,
      text: pct > 0 ? `in ${pct}% of ${scopeLabel}` : `not seen in current ${scopeLabel}`,
    });
    if (Number.isFinite(demand.count) && Number.isFinite(demand.totalPostings)) {
      badge.title = `${demand.count} of ${demand.totalPostings} postings`;
    }
    top.appendChild(badge);
  }

  const flagBtn = el('button', {
    type: 'button', class: 'flag-btn', text: 'Flag',
    title: 'Report an incorrect mapping',
    'aria-label': `Flag the skill ${skill.phrase || skill.name} on ${course.code}`,
  });
  flagBtn.addEventListener('click', () => handleFlag(flagBtn, skill, course, school));
  top.appendChild(flagBtn);
  li.appendChild(top);

  // Why this ties to the company (grounded in real postings).
  if (skill.whyCompany) li.appendChild(el('p', { class: 'why', text: skill.whyCompany }));

  if (skill.evidence) {
    const details = el('details', { class: 'evidence' });
    details.appendChild(el('summary', { text: 'Why this skill? (catalog + postings)' }));
    details.appendChild(el('p', { class: 'evidence-text', text: `From the catalog: "${skill.evidence}"` }));
    const samples = (skill.demand && skill.demand.samples) || [];
    if (samples.length) {
      details.appendChild(el('p', { class: 'help', text: 'Appears in postings such as:' }));
      const ul = el('ul', { class: 'posting-list' });
      const seen = new Set();
      for (const p of samples) {
        if (!p.title || seen.has(p.title)) continue;
        seen.add(p.title);
        const li2 = el('li');
        li2.appendChild(p.url ? el('a', { href: p.url, target: '_blank', rel: 'noopener', text: p.title }) : el('span', { text: p.title }));
        ul.appendChild(li2);
      }
      details.appendChild(ul);
    }
    li.appendChild(details);
  }
  return li;
}

function renderPostings(scope) {
  const panel = $('#postings-panel');
  const grid = $('#postings-grid');
  grid.innerHTML = '';
  const postings = (scope && scope.postings) || [];
  if (!postings.length) { panel.hidden = true; return; }
  panel.hidden = false;
  const summary = $('summary', panel);
  if (summary) summary.innerHTML = `<strong>Postings we scanned (${postings.length})</strong>`;
  for (const p of postings) {
    const card = el('div', { class: 'posting-card' });
    const left = el('div');
    left.appendChild(p.url
      ? el('a', { class: 'pt', href: p.url, target: '_blank', rel: 'noopener', text: p.title || 'Posting' })
      : el('span', { class: 'pt', text: p.title || 'Posting' }));
    const metaBits = [p.team, p.location].filter(Boolean).join(' · ');
    if (metaBits) left.appendChild(el('p', { class: 'pm', text: metaBits }));
    card.appendChild(left);
    grid.appendChild(card);
  }
}

async function handleFlag(btn, skill, course, school) {
  const reason = window.prompt(
    `Flag "${skill.phrase || skill.name}" on ${course.code} as an incorrect mapping?\nOptionally add a short reason:`, ''
  );
  if (reason === null) return;
  btn.disabled = true;
  btn.textContent = 'Flagging…';
  try {
    await apiPost('/api/flag', {
      schoolId: (school && school.schoolId) || '',
      courseCode: course.code,
      skillId: skill.id,
      reason: reason || '',
    });
    btn.textContent = 'Flagged ✓';
  } catch (err) {
    btn.disabled = false;
    btn.textContent = 'Flag';
    alert(`Could not send the flag: ${err.message}`);
  }
}

/* ---------------- output panels ---------------- */

function renderOutput(panel) {
  const out = $(`#${panel}-output`);
  const lines = state.resumeLines && state.resumeLines[panel];
  const fmt = state.formats[panel];
  const text = lines ? (lines[fmt] || '') : '';
  out.textContent = text || '(nothing to show yet)';
}

function wireToggles() {
  $$('.toggle-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const panel = btn.getAttribute('data-panel');
      const format = btn.getAttribute('data-format');
      state.formats[panel] = format;
      $$(`.toggle-btn[data-panel="${panel}"]`).forEach((b) => {
        const active = b === btn;
        b.classList.toggle('is-active', active);
        b.setAttribute('aria-pressed', active ? 'true' : 'false');
      });
      renderOutput(panel);
    });
  });
}

function wireCopyButtons() {
  $$('.btn-copy').forEach((btn) => {
    if (btn.id === 'resume-download') return; // handled separately
    btn.addEventListener('click', () => {
      const which = btn.getAttribute('data-copy');
      let text = '';
      if (which === 'bullet') text = state.bullet || '';
      else if (which === 'resume') text = state.resumeLatex || '';
      else if (state.resumeLines && state.resumeLines[which]) text = state.resumeLines[which][state.formats[which]] || '';
      if (text) copyText(text, btn);
    });
  });
  const dl = $('#resume-download');
  if (dl) dl.addEventListener('click', () => {
    if (!state.resumeLatex) return;
    const blob = new Blob([state.resumeLatex], { type: 'application/x-tex' });
    const url = URL.createObjectURL(blob);
    const a = el('a', { href: url, download: 'resume-tailored.tex' });
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
}

function readFileAsDataURL(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(new Error('Could not read that file.'));
    r.readAsDataURL(file);
  });
}

async function handleResume(evt) {
  evt.preventDefault();
  const btn = $('#resume-btn');
  const status = $('#resume-status');
  const resultBox = $('#resume-result');

  const schoolId = $('#school').value;
  const codes = selectedCourses();
  const companyId = $('#company').value;
  const role = $('#role').value;
  const employment = selectedEmployment();
  const resumeText = $('#resume-text').value.trim();
  const file = $('#resume-file').files[0];

  if (!schoolId || !codes.length || !companyId || !role) {
    setStatus(status, 'First fill in your courses, company, and role above, then run a match.', true);
    return;
  }
  if (!resumeText && !file) { setStatus(status, 'Paste your resume or choose a file first.', true); return; }

  setBusy(btn, true);
  setStatus(status, 'Tailoring your resume…');
  try {
    const payload = { schoolId, codes, companyId, role, employment };
    if (file) {
      payload.fileBase64 = await readFileAsDataURL(file);
      payload.filename = file.name;
    } else {
      payload.resumeText = resumeText;
    }
    const data = await apiPost('/api/resume', payload);
    state.resumeLatex = data.latex || '';
    $('#resume-latex').textContent = state.resumeLatex || '(nothing returned)';

    // injected pills
    const inj = $('#resume-injected');
    inj.innerHTML = '';
    if (data.injected && data.injected.coursework) inj.appendChild(el('span', { class: 'pill', text: 'Coursework updated' }));
    if (data.injected && data.injected.skills) inj.appendChild(el('span', { class: 'pill', text: 'Skills updated' }));
    inj.appendChild(el('span', { class: 'pill', text: data.inputFormat === 'latex' ? 'Edited in place' : 'Converted to LaTeX' }));

    const notes = $('#resume-notes');
    notes.innerHTML = '';
    for (const n of (data.notes || [])) notes.appendChild(el('li', { text: n }));

    resultBox.hidden = false;
    setStatus(status, 'Done. Review the notes, then copy or download your .tex.');
  } catch (err) {
    setStatus(status, `Something went wrong: ${err.message}`, true);
    console.error('resume', err);
  } finally {
    setBusy(btn, false);
  }
}

/* ---------------- form handlers ---------------- */

async function handleTranslate(evt) {
  evt.preventDefault();
  const btn = $('#translate-btn');
  const status = $('#status');

  const schoolId = $('#school').value;
  const codes = selectedCourses();
  const companyId = $('#company').value;
  const role = $('#role').value;
  const employment = selectedEmployment();

  if (!schoolId) { setStatus(status, 'Please pick a school first.', true); $('#school').focus(); return; }
  if (!codes.length) { setStatus(status, 'Please check at least one course.', true); return; }
  if (!companyId) { setStatus(status, 'Please pick a target company.', true); $('#company').focus(); return; }
  if (!role) { setStatus(status, 'Please pick a role function.', true); $('#role').focus(); return; }

  setBusy(btn, true);
  setStatus(status, `Scanning ${$('#company').selectedOptions[0].textContent}'s live postings…`);
  try {
    const result = await apiPost('/api/translate', { schoolId, codes, companyId, role, employment });
    renderResults(result);
    const n = Array.isArray(result.courses) ? result.courses.filter((c) => c.found !== false).length : 0;
    setStatus(status, `Done. Matched ${n} course${n === 1 ? '' : 's'} against ${result.company && result.company.name}.`);
  } catch (err) {
    setStatus(status, `Something went wrong: ${err.message}`, true);
    console.error('translate', err);
  } finally {
    setBusy(btn, false);
  }
}

async function handleAssignment(evt) {
  evt.preventDefault();
  const btn = $('#assignment-btn');
  const status = $('#assignment-status');
  const resultBox = $('#assignment-result');

  const text = $('#assignment-text').value;
  if (!text.trim()) { setStatus(status, 'Please describe your assignment first.', true); $('#assignment-text').focus(); return; }

  const schoolId = $('#school').value || undefined;
  const firstCourse = selectedCourses()[0];
  const payload = { text };
  if (schoolId) payload.schoolId = schoolId;
  if (firstCourse) payload.courseCode = firstCourse;

  setBusy(btn, true);
  setStatus(status, 'Writing your bullet…');
  try {
    const data = await apiPost('/api/assignment', payload);
    state.bullet = data.bullet || '';
    $('#bullet-output').textContent = state.bullet || '(no bullet returned)';
    $('#bullet-note').textContent = data.note || 'Uses only your words — no invented tools or metrics.';
    resultBox.hidden = false;
    setStatus(status, 'Done.');
    $('#bullet-output').focus();
  } catch (err) {
    setStatus(status, `Something went wrong: ${err.message}`, true);
    console.error('assignment', err);
  } finally {
    setBusy(btn, false);
  }
}

/* ---------------- init ---------------- */

function init() {
  wireToggles();
  wireCopyButtons();
  $('#translate-form').addEventListener('submit', handleTranslate);
  $('#assignment-form').addEventListener('submit', handleAssignment);
  $('#resume-form').addEventListener('submit', handleResume);
  $('#school').addEventListener('change', (e) => loadCourses(e.target.value));
  loadSchools();
  loadFilters();
  loadCourses('');
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
else init();
