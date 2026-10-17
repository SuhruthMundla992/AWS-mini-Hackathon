// build-demand.js — compute the per-role skill demand index from REAL live postings.
//
// Trust rule: every number the UI shows traces back to a count over real public ATS
// postings produced here, never to an LLM. We:
//   1. fetch postings for a curated, in-file list of ~15 companies (greenhouse/lever/ashby),
//   2. classify each posting into one or more target roles by title keywords,
//   3. count how many postings in each role bucket mention each canonical skill,
//   4. write data/demand.json (regenerable) AND seed/demand.fallback.json (committed) so the
//      tool shows honest numbers even offline.
//
// Boards that fail (renamed, moved off the ATS, rate-limited) are skipped and reported.
// Usage:  node scripts/build-demand.js
import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { fetchBoard, FetchError } from '../../shared/src/fetchers.js';
import { skillDemand } from '../src/skills.js';
import { ROLES } from '../src/skills.data.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(HERE, '..', 'data');
const SEED_DIR = join(HERE, '..', 'seed');
const DATA_PATH = join(DATA_DIR, 'demand.json');
const FALLBACK_PATH = join(SEED_DIR, 'demand.fallback.json');

const FETCH_OPTS = { timeoutMs: 10_000, retries: 1 };

// Curated, in-file company list across the three supported boards. Tokens are the ones
// commonly known to serve a public JSON board; any that fail are skipped at runtime.
const COMPANIES = [
  // greenhouse
  { type: 'greenhouse', slug: 'stripe' },
  { type: 'greenhouse', slug: 'databricks' },
  { type: 'greenhouse', slug: 'airbnb' },
  { type: 'greenhouse', slug: 'lyft' },
  { type: 'greenhouse', slug: 'pinterest' },
  { type: 'greenhouse', slug: 'dropbox' },
  { type: 'greenhouse', slug: 'robinhood' },
  { type: 'greenhouse', slug: 'coinbase' },
  { type: 'greenhouse', slug: 'gitlab' },
  { type: 'greenhouse', slug: 'discord' },
  { type: 'greenhouse', slug: 'brex' },
  { type: 'greenhouse', slug: 'flexport' },
  // lever
  { type: 'lever', slug: 'palantir' },
  { type: 'lever', slug: 'plaid' },
  // ashby
  { type: 'ashby', slug: 'openai' },
  { type: 'ashby', slug: 'ramp' },
  { type: 'ashby', slug: 'linear' },
  { type: 'ashby', slug: 'notion' },
  { type: 'ashby', slug: 'vanta' },
];

// Title-keyword classifiers. A posting may land in several buckets (e.g. "ML Platform
// Engineer" -> ml + systems). Keys match the canonical role keys in skills.data.js.
const ROLE_KEYWORDS = {
  swe: [/software\s+engineer/i, /\bswe\b/i, /software\s+developer/i, /full[-\s]?stack/i, /application\s+(developer|engineer)/i, /\bprogrammer\b/i],
  ml: [/machine\s+learning/i, /\bml\b/i, /\bai\b/i, /deep\s+learning/i, /applied\s+scientist/i, /research\s+scientist/i, /\bnlp\b/i, /computer\s+vision/i, /\bgenai\b/i, /generative\s+ai/i],
  data: [/data\s+engineer/i, /data\s+scientist/i, /data\s+analyst/i, /\banalytics\b/i, /business\s+intelligence/i, /\bbi\b/i, /data\s+platform/i],
  systems: [/back[-\s]?end/i, /\binfrastructure\b/i, /\bplatform\b/i, /\bsystems?\b/i, /\bdevops\b/i, /\bsre\b/i, /site\s+reliability/i, /\bdistributed\b/i, /\bcloud\b/i, /\bkernel\b/i, /\bnetwork(ing)?\b/i],
  frontend: [/front[-\s]?end/i, /\bui\b/i, /\bux\b/i, /\bweb\b/i, /\breact\b/i, /\bios\b/i, /\bandroid\b/i, /\bmobile\b/i],
  embedded: [/\bembedded\b/i, /\bfirmware\b/i, /\bhardware\b/i, /\bfpga\b/i, /\basic\b/i, /\belectrical\b/i, /\brtl\b/i, /\bsilicon\b/i, /\brobotics?\b/i],
};

function classify(title) {
  const t = String(title || '');
  const roles = [];
  for (const [role, patterns] of Object.entries(ROLE_KEYWORDS)) {
    if (patterns.some((re) => re.test(t))) roles.push(role);
  }
  // Generic engineering titles with no other signal count toward swe so the index isn't empty.
  if (roles.length === 0 && /\bengineer(ing)?\b|\bdeveloper\b/i.test(t)) roles.push('swe');
  return roles;
}

function round(n) {
  return Math.round(n);
}

async function main() {
  const started = Date.now();
  const allPostings = [];
  const succeeded = [];
  const failed = [];

  // Low concurrency: fetch boards sequentially to be a polite client.
  for (const board of COMPANIES) {
    const label = `${board.type}:${board.slug}`;
    try {
      const postings = await fetchBoard(board, FETCH_OPTS);
      allPostings.push(...postings);
      succeeded.push({ board: label, postings: postings.length });
      console.log(`  ok   ${label.padEnd(22)} ${postings.length} postings`);
    } catch (e) {
      const code = e instanceof FetchError ? e.code : 'ERROR';
      failed.push({ board: label, code, message: e?.message || String(e) });
      console.log(`  skip ${label.padEnd(22)} (${code})`);
    }
  }

  // Bucket postings by role, then count skills per bucket.
  const buckets = {};
  for (const key of Object.keys(ROLES)) buckets[key] = [];
  for (const p of allPostings) {
    for (const role of classify(p.title)) buckets[role].push(p);
  }

  const roles = {};
  const summary = {};
  for (const [role, postings] of Object.entries(buckets)) {
    const totalPostings = postings.length;
    const demand = skillDemand(postings); // Map id -> {count, postingIds}
    const counts = {};
    for (const [id, { count, postingIds }] of demand) {
      counts[id] = {
        count,
        pct: totalPostings > 0 ? round((count / totalPostings) * 100) : 0,
        postingIds,
      };
    }
    roles[role] = { totalPostings, counts };
    summary[role] = { totalPostings, skillsTracked: Object.keys(counts).length };
  }

  const output = { generatedAt: new Date().toISOString(), roles };

  mkdirSync(DATA_DIR, { recursive: true });
  writeFileSync(DATA_PATH, JSON.stringify(output, null, 2));
  writeFileSync(FALLBACK_PATH, JSON.stringify(output, null, 2));

  console.log('\nDemand build summary');
  console.log(`  companies: ${succeeded.length} ok, ${failed.length} skipped`);
  console.log(`  postings fetched: ${allPostings.length}`);
  for (const [role, s] of Object.entries(summary)) {
    console.log(`  ${role.padEnd(9)} ${String(s.totalPostings).padStart(4)} postings, ${s.skillsTracked} skills tracked`);
  }
  if (failed.length) console.log(`  skipped boards: ${failed.map((f) => f.board).join(', ')}`);
  console.log(`  wrote ${DATA_PATH}`);
  console.log(`  wrote ${FALLBACK_PATH}`);
  console.log(`  done in ${((Date.now() - started) / 1000).toFixed(1)}s`);
}

main().catch((e) => {
  console.error('build-demand failed:', e);
  process.exit(1);
});
