// Live public ATS board fetchers (Greenhouse, Lever, Ashby) + URL parsing + normalization.
// Every fetcher returns NormalizedPosting[] (see README.md for the exact shape).
import { htmlToText, sha256, decodeEntities } from './text.js';
import { TTLCache } from './cache.js';
import { findCompanyByBoard, resolveCompany } from './registry.js';

export const BOARD_TYPES = ['greenhouse', 'lever', 'ashby'];
const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_BOARD_TTL_MS = 10 * 60 * 1000;
const USER_AGENT = 'careertools-shared/1.0 (+student career tools hackathon)';

/** Error thrown by fetchers. `code`: 'NOT_FOUND' | 'HTTP_ERROR' | 'TIMEOUT' | 'NETWORK' | 'BAD_RESPONSE' | 'UNKNOWN_BOARD' | 'BAD_URL'. */
export class FetchError extends Error {
  constructor(message, { code, status, url } = {}) {
    super(message);
    this.name = 'FetchError';
    this.code = code;
    this.status = status;
    this.url = url;
  }
}

const boardCache = new TTLCache({
  name: 'boards',
  ttlMs: DEFAULT_BOARD_TTL_MS,
  disk: process.env.CAREERTOOLS_BOARD_DISK_CACHE === '1',
  maxEntries: 1000,
});

/** Clear the in-memory board cache (useful in long-running pollers or tests). */
export function clearBoardCache() {
  boardCache.clear();
}

/**
 * GET JSON with a timeout and one retry on timeout / network error / 429 / 5xx.
 * 404 is not retried and throws FetchError{code:'NOT_FOUND'}.
 */
export async function fetchJson(url, { timeoutMs = DEFAULT_TIMEOUT_MS, retries = 1 } = {}) {
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    if (attempt > 0) await new Promise((r) => setTimeout(r, 400 * attempt));
    try {
      const res = await fetch(url, {
        headers: { accept: 'application/json', 'user-agent': USER_AGENT },
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (res.status === 404) throw new FetchError(`Not found: ${url}`, { code: 'NOT_FOUND', status: 404, url });
      if (!res.ok) {
        const err = new FetchError(`HTTP ${res.status} for ${url}`, { code: 'HTTP_ERROR', status: res.status, url });
        if (res.status === 429 || res.status >= 500) { lastErr = err; continue; }
        throw err;
      }
      try {
        return await res.json();
      } catch {
        throw new FetchError(`Invalid JSON from ${url}`, { code: 'BAD_RESPONSE', status: res.status, url });
      }
    } catch (e) {
      if (e instanceof FetchError) throw e; // 404 / non-retryable HTTP / bad JSON
      const timeout = e?.name === 'TimeoutError' || e?.name === 'AbortError';
      lastErr = new FetchError(`${timeout ? 'Timeout' : 'Network error'} for ${url}: ${e?.message || e}`, {
        code: timeout ? 'TIMEOUT' : 'NETWORK', url,
      });
    }
  }
  throw lastErr;
}

function toIso(v) {
  if (v === null || v === undefined || v === '') return null;
  const d = new Date(typeof v === 'number' ? v : String(v));
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function titleCase(slug) {
  return String(slug || '')
    .replace(/[-_]+/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function companyMeta(type, boardSlug, override) {
  const reg = findCompanyByBoard(type, boardSlug);
  return {
    company: override || reg?.name || null,
    companySlug: reg?.slug || String(boardSlug).toLowerCase(),
  };
}

function finish(p) {
  p.descriptionHash = sha256(p.descriptionText || '');
  return p;
}

/** Normalize one raw Greenhouse job (from /jobs?content=true). */
export function normalizeGreenhouseJob(job, boardSlug, { company } = {}) {
  const meta = companyMeta('greenhouse', boardSlug, company);
  const depts = (job.departments || []).map((d) => d?.name).filter(Boolean);
  return finish({
    id: String(job.id),
    source: 'greenhouse',
    boardSlug: String(boardSlug),
    company: meta.company || job.company_name || titleCase(boardSlug),
    companySlug: meta.companySlug,
    title: (job.title || '').trim(),
    location: job.location?.name?.trim() || null,
    department: depts[0] || null,
    team: depts[1] || null,
    employmentType: null,
    url: job.absolute_url || `https://job-boards.greenhouse.io/${boardSlug}/jobs/${job.id}`,
    applyUrl: job.absolute_url || `https://job-boards.greenhouse.io/${boardSlug}/jobs/${job.id}`,
    updatedAt: toIso(job.updated_at),
    createdAt: toIso(job.first_published),
    descriptionText: htmlToText(job.content || ''),
  });
}

/** Normalize one raw Lever posting (from /v0/postings/{slug}?mode=json). */
export function normalizeLeverPosting(p, boardSlug, { company } = {}) {
  const meta = companyMeta('lever', boardSlug, company);
  const parts = [htmlToText(p.description || p.descriptionPlain || '')];
  for (const list of p.lists || []) {
    const header = decodeEntities(list.text || '').trim();
    const body = htmlToText(`<ul>${list.content || ''}</ul>`);
    parts.push([header, body].filter(Boolean).join('\n'));
  }
  if (p.additional || p.additionalPlain) parts.push(htmlToText(p.additional || p.additionalPlain));
  const created = toIso(p.createdAt);
  const cats = p.categories || {};
  return finish({
    id: String(p.id),
    source: 'lever',
    boardSlug: String(boardSlug),
    company: meta.company || titleCase(boardSlug),
    companySlug: meta.companySlug,
    title: (p.text || '').trim(),
    location: cats.location || (cats.allLocations || [])[0] || null,
    department: cats.department || null,
    team: cats.team || null,
    employmentType: cats.commitment || null,
    url: p.hostedUrl || `https://jobs.lever.co/${boardSlug}/${p.id}`,
    applyUrl: p.applyUrl || `https://jobs.lever.co/${boardSlug}/${p.id}/apply`,
    // Lever exposes no "updated" timestamp; createdAt is the best available signal.
    updatedAt: created,
    createdAt: created,
    descriptionText: parts.filter(Boolean).join('\n\n').trim(),
  });
}

/** Normalize one raw Ashby job (from /posting-api/job-board/{name}). */
export function normalizeAshbyJob(j, boardSlug, { company } = {}) {
  const meta = companyMeta('ashby', boardSlug, company);
  const published = toIso(j.publishedAt);
  return finish({
    id: String(j.id),
    source: 'ashby',
    boardSlug: String(boardSlug),
    company: meta.company || titleCase(boardSlug),
    companySlug: meta.companySlug,
    title: (j.title || '').trim(),
    location: j.location || j.address?.postalAddress?.addressLocality || null,
    department: j.department || null,
    team: j.team || null,
    employmentType: j.employmentType || null,
    url: j.jobUrl || `https://jobs.ashbyhq.com/${boardSlug}/${j.id}`,
    applyUrl: j.applyUrl || `https://jobs.ashbyhq.com/${boardSlug}/${j.id}/application`,
    // Ashby exposes only publishedAt.
    updatedAt: toIso(j.updatedAt) || published,
    createdAt: published,
    descriptionText: j.descriptionHtml ? htmlToText(j.descriptionHtml) : (j.descriptionPlain || '').trim(),
  });
}

async function cached(key, opts, loader) {
  if (!opts.noCache) {
    const hit = boardCache.get(key);
    if (hit) return hit;
  }
  const value = await loader();
  boardCache.set(key, value);
  return value;
}

/**
 * Fetch all postings from a Greenhouse board.
 * @param {string} token board token, e.g. "stripe"
 * @param {FetchOptions} [opts]
 * @returns {Promise<NormalizedPosting[]>}
 */
export async function fetchGreenhouse(token, opts = {}) {
  const slug = String(token).trim();
  return cached(`greenhouse:${slug.toLowerCase()}`, opts, async () => {
    const url = `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(slug)}/jobs?content=true`;
    const data = await fetchJson(url, opts);
    if (!data || !Array.isArray(data.jobs)) throw new FetchError(`Unexpected Greenhouse payload for ${slug}`, { code: 'BAD_RESPONSE', url });
    return data.jobs.map((j) => normalizeGreenhouseJob(j, slug, opts));
  });
}

/**
 * Fetch all postings from a Lever board.
 * @param {string} slug e.g. "palantir"
 */
export async function fetchLever(slug, opts = {}) {
  const s = String(slug).trim();
  return cached(`lever:${s.toLowerCase()}`, opts, async () => {
    const url = `https://api.lever.co/v0/postings/${encodeURIComponent(s)}?mode=json`;
    const data = await fetchJson(url, opts);
    if (!Array.isArray(data)) throw new FetchError(`Unexpected Lever payload for ${s}`, { code: 'BAD_RESPONSE', url });
    return data.map((p) => normalizeLeverPosting(p, s, opts));
  });
}

/**
 * Fetch all listed postings from an Ashby board.
 * @param {string} name e.g. "openai"
 */
export async function fetchAshby(name, opts = {}) {
  const s = String(name).trim();
  return cached(`ashby:${s.toLowerCase()}`, opts, async () => {
    const url = `https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(s)}?includeCompensation=false`;
    const data = await fetchJson(url, opts);
    if (!data || !Array.isArray(data.jobs)) throw new FetchError(`Unexpected Ashby payload for ${s}`, { code: 'BAD_RESPONSE', url });
    return data.jobs.filter((j) => j.isListed !== false).map((j) => normalizeAshbyJob(j, s, opts));
  });
}

/**
 * Dispatch to the right fetcher.
 * @param {{type:'greenhouse'|'lever'|'ashby', slug:string, company?:string}} board
 * @param {FetchOptions} [opts]
 */
export async function fetchBoard(board, opts = {}) {
  const { type, slug } = board || {};
  if (!slug) throw new FetchError('fetchBoard: missing slug', { code: 'UNKNOWN_BOARD' });
  const o = { ...opts, company: board.company ?? opts.company };
  switch (type) {
    case 'greenhouse': return fetchGreenhouse(slug, o);
    case 'lever': return fetchLever(slug, o);
    case 'ashby': return fetchAshby(slug, o);
    default: throw new FetchError(`fetchBoard: unsupported board type "${type}"`, { code: 'UNKNOWN_BOARD' });
  }
}

/**
 * Fetch every board of a registry company (or a {boards:[...]} object) and concatenate.
 * Boards that fail are reported in `errors` instead of throwing.
 * @param {string|{boards:{type,slug}[], name?:string}} company
 * @returns {Promise<{company: object|null, postings: NormalizedPosting[], errors: {board, message, code}[]}>}
 */
export async function fetchCompanyPostings(company, opts = {}) {
  const entry = typeof company === 'string' ? resolveCompany(company) : company;
  if (!entry) return { company: null, postings: [], errors: [{ board: null, message: `Unknown company: ${company}`, code: 'UNKNOWN_BOARD' }] };
  const results = await Promise.allSettled((entry.boards || []).map((b) => fetchBoard({ ...b, company: entry.name }, opts)));
  const postings = [];
  const errors = [];
  results.forEach((r, i) => {
    if (r.status === 'fulfilled') postings.push(...r.value);
    else errors.push({ board: entry.boards[i], message: r.reason?.message || String(r.reason), code: r.reason?.code });
  });
  return { company: entry, postings, errors };
}

/**
 * Parse a public posting URL.
 * Returns null if the URL is not a recognized Greenhouse/Lever/Ashby posting URL.
 * For company-hosted Greenhouse links ("https://stripe.com/jobs/search?gh_jid=123") slug is null
 * (jobId is still set) and `host` is provided so callers can try resolveCompany().
 * @param {string} url
 * @returns {{type:'greenhouse'|'lever'|'ashby', slug:string|null, jobId:string|null, host?:string} | null}
 */
export function parsePostingUrl(url) {
  let u;
  try {
    u = new URL(String(url).trim());
  } catch {
    return null;
  }
  const host = u.hostname.toLowerCase().replace(/^www\./, '');
  const segs = u.pathname.split('/').filter(Boolean).map((s) => {
    try { return decodeURIComponent(s); } catch { return s; }
  });

  // Greenhouse: boards.greenhouse.io, job-boards.greenhouse.io, job-boards.eu.greenhouse.io, boards.eu.greenhouse.io
  if (/(^|\.)greenhouse\.io$/.test(host)) {
    // Embedded form: /embed/job_app?for=stripe&token=123  or /embed/job_board?for=stripe
    if (segs[0] === 'embed') {
      const slug = u.searchParams.get('for');
      const jobId = u.searchParams.get('token') || u.searchParams.get('gh_jid');
      return { type: 'greenhouse', slug: slug || null, jobId: jobId || null };
    }
    // /v1/boards/{token}/jobs/{id} (API URLs pasted by power users)
    if (segs[0] === 'v1' && segs[1] === 'boards' && segs[2]) {
      return { type: 'greenhouse', slug: segs[2], jobId: segs[3] === 'jobs' && segs[4] ? segs[4] : null };
    }
    if (segs[0]) {
      const i = segs.indexOf('jobs');
      const jobId = i >= 0 && /^\d+$/.test(segs[i + 1] || '') ? segs[i + 1] : u.searchParams.get('gh_jid');
      return { type: 'greenhouse', slug: segs[0], jobId: jobId || null };
    }
    return null;
  }

  // Lever: jobs.lever.co/{slug}/{uuid}[/apply], jobs.eu.lever.co
  if (/(^|\.)lever\.co$/.test(host) && host.startsWith('jobs.')) {
    if (!segs[0]) return null;
    return { type: 'lever', slug: segs[0], jobId: segs[1] && segs[1] !== 'apply' ? segs[1] : null };
  }

  // Ashby: jobs.ashbyhq.com/{name}/{uuid}[/application]
  if (host === 'jobs.ashbyhq.com') {
    if (!segs[0]) return null;
    return { type: 'ashby', slug: segs[0], jobId: segs[1] && segs[1] !== 'application' ? segs[1] : null };
  }

  // Company-hosted Greenhouse embed: any URL with ?gh_jid=
  const ghJid = u.searchParams.get('gh_jid');
  if (ghJid) return { type: 'greenhouse', slug: null, jobId: ghJid, host };

  // Company-hosted Ashby embed: ?ashby_jid=
  const ashbyJid = u.searchParams.get('ashby_jid');
  if (ashbyJid) return { type: 'ashby', slug: null, jobId: ashbyJid, host };

  return null;
}

function hostCompanyGuess(host, type) {
  if (!host) return null;
  // "stripe.com" -> "stripe", "careers.datadoghq.com" -> "datadoghq" -> registry fuzzy.
  const labels = host.split('.').filter((l) => !['www', 'jobs', 'careers', 'boards', 'com', 'io', 'co', 'ai', 'org', 'net', 'dev'].includes(l));
  for (const label of labels.reverse()) {
    const c = resolveCompany(label);
    const b = c?.boards?.find((x) => x.type === type);
    if (b) return b.slug;
  }
  return null;
}

/**
 * Fetch one normalized posting by its public URL.
 * Throws FetchError{code:'BAD_URL'} if the URL is unrecognized, {code:'UNKNOWN_BOARD'} if the
 * board can't be determined (e.g. gh_jid on an unknown company domain).
 * Resolves to null when the board was fetched but the job id isn't on it (posting closed).
 * @param {string} url
 * @returns {Promise<NormalizedPosting|null>}
 */
export async function fetchPostingByUrl(url, opts = {}) {
  const parsed = parsePostingUrl(url);
  if (!parsed) throw new FetchError(`Not a Greenhouse, Lever, or Ashby posting URL: ${url}`, { code: 'BAD_URL', url });
  let slug = parsed.slug;
  if (!slug) slug = hostCompanyGuess(parsed.host, parsed.type);
  if (!slug) throw new FetchError(`Could not determine the job board for ${url}`, { code: 'UNKNOWN_BOARD', url });
  if (!parsed.jobId) throw new FetchError(`URL has no job id: ${url}`, { code: 'BAD_URL', url });
  const postings = await fetchBoard({ type: parsed.type, slug }, opts);
  const id = String(parsed.jobId).toLowerCase();
  return postings.find((p) => p.id.toLowerCase() === id) || null;
}

/**
 * Build a NormalizedPosting from pasted plain text (fallback when no URL works).
 * @param {string} text
 * @param {{company?:string, title?:string, url?:string}} [meta]
 */
export function postingFromText(text, meta = {}) {
  const descriptionText = String(text || '').replace(/\r\n/g, '\n').trim();
  const firstLine = descriptionText.split('\n').find((l) => l.trim()) || '';
  const reg = meta.company ? resolveCompany(meta.company) : null;
  const descriptionHash = sha256(descriptionText);
  return {
    id: 'text-' + descriptionHash.slice(0, 16),
    source: 'text',
    boardSlug: null,
    company: reg?.name || meta.company || null,
    companySlug: reg?.slug || (meta.company ? String(meta.company).toLowerCase().replace(/[^a-z0-9]+/g, '-') : null),
    title: meta.title || firstLine.slice(0, 120),
    location: null,
    department: null,
    team: null,
    employmentType: null,
    url: meta.url || null,
    applyUrl: meta.url || null,
    updatedAt: null,
    createdAt: null,
    descriptionText,
    descriptionHash,
  };
}

/**
 * @typedef {Object} FetchOptions
 * @property {number} [timeoutMs=10000]
 * @property {number} [retries=1]
 * @property {boolean} [noCache=false] bypass the board cache (still writes the fresh result)
 * @property {string} [company] display name override
 */
