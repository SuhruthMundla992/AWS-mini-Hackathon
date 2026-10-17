// Text utilities: HTML -> text, entity decoding, line splitting, fuzzy-match helpers, hashing.
// Pure functions, no I/O. Everything here is deterministic.
import { createHash } from 'node:crypto';

const NAMED_ENTITIES = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '–', mdash: '—',
  hellip: '…', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“', bull: '•', middot: '·',
  copy: '©', reg: '®', trade: '™', deg: '°', times: '×', laquo: '«', raquo: '»',
  eacute: 'é', egrave: 'è', aacute: 'á', agrave: 'à', iacute: 'í', oacute: 'ó', uacute: 'ú',
  ntilde: 'ñ', ccedil: 'ç', uuml: 'ü', ouml: 'ö', auml: 'ä', szlig: 'ß', euro: '€', pound: '£',
  zwj: '', zwnj: '', shy: '', ensp: ' ', emsp: ' ', thinsp: ' ', minus: '−', rarr: '→', larr: '←',
};

/** Decode HTML entities (named, decimal, hex). Single pass; call twice for double-encoded input. */
export function decodeEntities(str) {
  if (!str) return '';
  return String(str).replace(/&(#x[0-9a-f]+|#\d+|[a-z][a-z0-9]*);/gi, (m, code) => {
    if (code[0] === '#') {
      const n = code[1] === 'x' || code[1] === 'X' ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      if (!Number.isFinite(n) || n < 0 || n > 0x10ffff) return m;
      try { return String.fromCodePoint(n); } catch { return m; }
    }
    const v = NAMED_ENTITIES[code.toLowerCase()];
    return v === undefined ? m : v;
  });
}

const BLOCK_TAGS = /<\/?(p|div|br|li|ul|ol|h[1-6]|tr|table|section|article|header|footer|blockquote|pre|hr)\b[^>]*>/gi;

/**
 * Convert HTML (optionally entity-encoded, as Greenhouse returns it) to plain text.
 * Block elements become newlines, <li> becomes "• " bullets, scripts/styles dropped.
 */
export function htmlToText(html) {
  if (!html) return '';
  let s = String(html);
  // Greenhouse `content` is entity-encoded HTML ("&lt;p&gt;"). Decode once if it looks encoded.
  if (/&lt;\/?[a-z]/i.test(s) && !/<\/?[a-z][^>]*>/i.test(s)) s = decodeEntities(s);
  s = s.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ');
  s = s.replace(/<!--[\s\S]*?-->/g, ' ');
  s = s.replace(/<li\b[^>]*>/gi, '\n• ');
  s = s.replace(BLOCK_TAGS, '\n');
  s = s.replace(/<[^>]+>/g, '');
  s = decodeEntities(s);
  s = s.replace(/\u00a0/g, ' ').replace(/[ \t\f\v]+/g, ' ');
  s = s.split('\n').map((l) => l.trim()).join('\n');
  s = s.replace(/\n(•\s*\n)+/g, '\n'); // empty bullets
  s = s.replace(/\n{3,}/g, '\n\n');
  return s.trim();
}

const BULLET_RE = /^\s*(?:[•●▪◦·‣∙*\-–—]|\d{1,2}[.)])\s+/;

/**
 * Split text into atomic lines: one per bullet / paragraph line, and long paragraphs split
 * into sentences. Bullet markers are stripped. Empty lines removed.
 * @param {string} text
 * @param {{minLength?: number}} [opts] minLength (default 2) drops shorter fragments.
 * @returns {string[]}
 */
export function splitLines(text, opts = {}) {
  const minLength = opts.minLength ?? 2;
  if (!text) return [];
  const out = [];
  for (const raw of String(text).split(/\r?\n/)) {
    let line = raw.replace(BULLET_RE, '').trim();
    if (!line) continue;
    // Split inline bullets like "a • b • c"
    const parts = line.split(/\s+[•●▪]\s+/);
    for (const part of parts) {
      for (const sent of splitSentences(part)) {
        const t = sent.trim();
        if (t.length >= minLength) out.push(t);
      }
    }
  }
  return out;
}

/** Sentence splitter that avoids splitting on common abbreviations, decimals, and "e.g.". */
export function splitSentences(text) {
  const s = String(text || '').trim();
  if (s.length < 160) return s ? [s] : [];
  const protectedText = s
    .replace(/\b(e\.g|i\.e|etc|vs|Inc|Ltd|Co|Jr|Sr|Dr|Mr|Ms|Mrs|St|U\.S|approx|incl|min|max|No)\./g, (m) => m.replace(/\./g, '\u0000'))
    .replace(/(\d)\.(\d)/g, '$1\u0000$2');
  const parts = protectedText.split(/(?<=[.!?])\s+(?=[A-Z0-9“"(])/);
  return parts.map((p) => p.replace(/\u0000/g, '.').trim()).filter(Boolean);
}

/**
 * Normalize a line for fuzzy comparison: lowercase, strip punctuation/bullets/digits-as-noise,
 * collapse whitespace. Keeps "+" and "#" so "C++"/"C#" survive.
 */
export function normalizeLine(line) {
  return String(line || '')
    .toLowerCase()
    .normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[’‘`]/g, "'")
    .replace(/[^a-z0-9+#' ]+/g, ' ')
    .replace(/'/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

const STOPWORDS = new Set('a an the and or of to in on for with at by from as is are be this that our your you we will can'.split(' '));

/** Tokenize a normalized line into content tokens (stopwords removed). */
export function tokenize(line) {
  return normalizeLine(line).split(' ').filter((t) => t && !STOPWORDS.has(t));
}

/** Jaccard similarity of two sets/arrays. */
export function jaccard(a, b) {
  const A = a instanceof Set ? a : new Set(a);
  const B = b instanceof Set ? b : new Set(b);
  if (A.size === 0 && B.size === 0) return 1;
  let inter = 0;
  for (const x of A) if (B.has(x)) inter++;
  return inter / (A.size + B.size - inter);
}

/** Word k-shingles of a line (default k=2). Lines shorter than k return their tokens. */
export function shingles(line, k = 2) {
  const toks = tokenize(line);
  if (toks.length < k) return new Set(toks);
  const out = new Set();
  for (let i = 0; i <= toks.length - k; i++) out.add(toks.slice(i, i + k).join(' '));
  return out;
}

/**
 * Similarity in [0,1] between two lines: max of token-Jaccard and 2-shingle Jaccard
 * weighted toward shingles (word order matters a bit). 1 = identical after normalization.
 * Recommended thresholds: >= 0.8 near-duplicate (boilerplate), >= 0.5 related.
 */
export function similarity(a, b) {
  const na = normalizeLine(a);
  const nb = normalizeLine(b);
  if (!na && !nb) return 1;
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  const tok = jaccard(tokenize(na), tokenize(nb));
  const sh = jaccard(shingles(na), shingles(nb));
  return Math.round((0.4 * tok + 0.6 * sh) * 1000) / 1000;
}

/** Hex SHA-256 of a string or Buffer. */
export function sha256(input) {
  return createHash('sha256').update(input ?? '').digest('hex');
}

/** Truncate to max chars on a word boundary, appending "…" when cut. */
export function truncate(text, max) {
  const s = String(text || '');
  if (s.length <= max) return s;
  const cut = s.slice(0, max);
  const sp = cut.lastIndexOf(' ');
  return (sp > max * 0.8 ? cut.slice(0, sp) : cut).trimEnd() + '…';
}

/** Escape a string for use inside a RegExp. */
export function escapeRegex(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
