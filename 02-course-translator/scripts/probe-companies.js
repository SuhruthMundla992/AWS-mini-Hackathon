// Throwaway probe: check which candidate companies expose a public board and how many
// intern / SWE postings they currently have, so we can pick ~10 that genuinely work.
import { fetchBoard, FetchError } from '../../shared/src/fetchers.js';

const CANDIDATES = [
  { name: 'Stripe', type: 'greenhouse', slug: 'stripe' },
  { name: 'Airbnb', type: 'greenhouse', slug: 'airbnb' },
  { name: 'Databricks', type: 'greenhouse', slug: 'databricks' },
  { name: 'Coinbase', type: 'greenhouse', slug: 'coinbase' },
  { name: 'Pinterest', type: 'greenhouse', slug: 'pinterest' },
  { name: 'Lyft', type: 'greenhouse', slug: 'lyft' },
  { name: 'Robinhood', type: 'greenhouse', slug: 'robinhood' },
  { name: 'Dropbox', type: 'greenhouse', slug: 'dropbox' },
  { name: 'GitLab', type: 'greenhouse', slug: 'gitlab' },
  { name: 'Reddit', type: 'greenhouse', slug: 'reddit' },
  { name: 'DoorDash', type: 'greenhouse', slug: 'doordash' },
  { name: 'Instacart', type: 'greenhouse', slug: 'instacart' },
  { name: 'Cloudflare', type: 'greenhouse', slug: 'cloudflare' },
  { name: 'Figma', type: 'greenhouse', slug: 'figma' },
  { name: 'Snowflake', type: 'greenhouse', slug: 'snowflake' },
  { name: 'Datadog', type: 'greenhouse', slug: 'datadog' },
  { name: 'Discord', type: 'greenhouse', slug: 'discord' },
  { name: 'Palantir', type: 'lever', slug: 'palantir' },
  { name: 'Netflix', type: 'lever', slug: 'netflix' },
  { name: 'Spotify', type: 'lever', slug: 'spotify' },
  { name: 'OpenAI', type: 'ashby', slug: 'openai' },
  { name: 'Anthropic', type: 'greenhouse', slug: 'anthropic' },
  { name: 'Ramp', type: 'ashby', slug: 'ramp' },
  { name: 'Notion', type: 'ashby', slug: 'notion' },
  { name: 'Vercel', type: 'ashby', slug: 'vercel' },
  { name: 'Nvidia', type: 'greenhouse', slug: 'nvidia' },
  { name: 'Roblox', type: 'greenhouse', slug: 'roblox' },
  { name: 'Plaid', type: 'greenhouse', slug: 'plaid' },
];

const isIntern = (t) => /\b(intern|internship|co-?op)\b/i.test(t);
const isSwe = (t) => /\b(software|swe|engineer|developer|programmer)\b/i.test(t);

const rows = [];
for (const c of CANDIDATES) {
  try {
    const posts = await fetchBoard(c, { timeoutMs: 10000, retries: 1 });
    const interns = posts.filter((p) => isIntern(p.title));
    const sweInterns = interns.filter((p) => isSwe(p.title));
    rows.push({ name: c.name, type: c.type, slug: c.slug, total: posts.length, interns: interns.length, sweInterns: sweInterns.length });
    console.log(`ok   ${c.name.padEnd(12)} ${c.type.padEnd(10)} total=${String(posts.length).padStart(4)} intern=${String(interns.length).padStart(3)} sweIntern=${sweInterns.length}`);
  } catch (e) {
    const code = e instanceof FetchError ? e.code : 'ERR';
    console.log(`FAIL ${c.name.padEnd(12)} ${c.type.padEnd(10)} (${code})`);
  }
}
console.log(`\n${rows.length} of ${CANDIDATES.length} boards reachable.`);
