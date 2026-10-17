// scrape-catalog.js — best-effort scraper for a school's public course catalog.
//
// Given a catalog URL and a department code, it fetches the page, strips HTML to text with
// the shared htmlToText helper, and heuristically extracts {code, title, description} blocks
// into seed/catalogs/<id>.json in the shape catalog.js expects.
//
// This is intentionally BEST-EFFORT. Catalog HTML varies wildly between schools, so the
// generic heuristic below works for catalogs that render each course as:
//     DEPT 123  Course Title
//     <description paragraph...>
// Review the output before committing it, and never invent or edit descriptions by hand —
// if a field can't be scraped, drop the course rather than padding the dataset. TAMU is
// already seeded by hand from the public catalog, so this script is a bonus for adding more.
//
// Usage:
//   node scripts/scrape-catalog.js --url <catalogUrl> --dept CSCE --id mit --school "MIT"
//   node scripts/scrape-catalog.js --help
import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { htmlToText } from '../../shared/src/text.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const CATALOG_DIR = join(HERE, '..', 'seed', 'catalogs');

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--help' || a === '-h') { args.help = true; continue; }
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const val = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : 'true';
      args[key] = val;
    }
  }
  return args;
}

function usage() {
  console.log(`scrape-catalog.js — pull a school's public course catalog into seed/catalogs/<id>.json

Required:
  --url <url>        public catalog page URL (one department)
  --dept <CODE>      department code to match, e.g. CSCE, EECS, CS
  --id <id>          schoolId (lowercase slug), e.g. tamu, mit, berkeley
  --school <name>    display name, e.g. "Massachusetts Institute of Technology"

Optional:
  --out <path>       output path (default seed/catalogs/<id>.json)

Notes:
  Best-effort heuristic extractor. Always review the JSON before committing. Descriptions
  are taken verbatim from the page; none are invented. If a course can't be parsed cleanly
  it is skipped rather than guessed.`);
}

/**
 * Heuristic course extractor over catalog plain text.
 * Looks for lines that begin with "<DEPT> <number>" followed by a title, then captures the
 * following non-empty lines as the description until the next course header or a blank gap.
 * @returns {{code,title,description}[]}
 */
export function extractCourses(text, dept) {
  const lines = String(text || '').split('\n').map((l) => l.trim());
  const deptRe = new RegExp(`^(${dept}\\s*\\d{3}[A-Z]?)\\b[\\s.:-]*(.*)$`, 'i');
  const courses = [];
  let current = null;

  const flush = () => {
    if (current && current.description.trim().length >= 20) {
      courses.push({
        code: current.code.replace(/\s+/g, ' ').toUpperCase(),
        title: current.title.trim(),
        description: current.description.replace(/\s+/g, ' ').trim(),
      });
    }
    current = null;
  };

  for (const line of lines) {
    const m = line.match(deptRe);
    if (m) {
      flush();
      // Title may be on the same line after the code; if empty, next line is the title.
      current = { code: m[1], title: (m[2] || '').trim(), description: '' };
      current._needTitle = !current.title;
      continue;
    }
    if (!current) continue;
    if (!line) continue; // keep accumulating across single blank lines
    if (current._needTitle) {
      current.title = line;
      current._needTitle = false;
      continue;
    }
    current.description += (current.description ? ' ' : '') + line;
  }
  flush();
  return courses;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || !args.url || !args.dept || !args.id || !args.school) {
    usage();
    process.exit(args.help ? 0 : 1);
  }

  console.log(`Fetching ${args.url} ...`);
  let html;
  try {
    const res = await fetch(args.url, {
      headers: { 'user-agent': 'course-translator-scraper/1.0 (student career tool)' },
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    html = await res.text();
  } catch (e) {
    console.error(`Fetch failed: ${e?.message || e}`);
    process.exit(1);
  }

  const text = htmlToText(html);
  const courses = extractCourses(text, args.dept);
  if (courses.length === 0) {
    console.error(`No courses matched "${args.dept}" on that page. The catalog layout may differ; inspect the page and adjust the heuristic.`);
    process.exit(1);
  }

  const out = {
    school: args.school,
    schoolId: String(args.id).toLowerCase(),
    source: args.url,
    fetchedAt: new Date().toISOString().slice(0, 10),
    note: 'Scraped verbatim from the public catalog with scripts/scrape-catalog.js. Review before trusting.',
    courses: courses.map((c) => ({ ...c, dept: args.dept.toUpperCase() })),
  };

  const outPath = args.out || join(CATALOG_DIR, `${out.schoolId}.json`);
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, JSON.stringify(out, null, 2));
  console.log(`Extracted ${courses.length} ${args.dept.toUpperCase()} courses -> ${outPath}`);
  console.log('Review the file before committing; drop any course whose description looks wrong.');
}

main().catch((e) => {
  console.error('scrape-catalog failed:', e);
  process.exit(1);
});
