// Tiny TTL cache: in-memory Map, optionally mirrored to JSON files on disk.
// Disk dir defaults to shared/.cache (gitignored); override with CAREERTOOLS_CACHE_DIR.
// Disk caching is opt-in per cache instance and can be disabled globally with
// CAREERTOOLS_DISK_CACHE=0 (tests set this so they never touch disk).
import { mkdirSync, readFileSync, writeFileSync, existsSync, renameSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sha256 } from './text.js';

const HERE = dirname(fileURLToPath(import.meta.url));
export const DEFAULT_CACHE_DIR = process.env.CAREERTOOLS_CACHE_DIR || join(HERE, '..', '.cache');

function diskEnabled() {
  return process.env.CAREERTOOLS_DISK_CACHE !== '0';
}

export class TTLCache {
  /**
   * @param {{name: string, ttlMs?: number, disk?: boolean, dir?: string, maxEntries?: number}} opts
   *   ttlMs: Infinity for never-expire. disk: mirror entries to `${dir}/${name}/<hash>.json`.
   */
  constructor({ name, ttlMs = Infinity, disk = false, dir = DEFAULT_CACHE_DIR, maxEntries = 5000 }) {
    this.name = name;
    this.ttlMs = ttlMs;
    this.disk = disk;
    this.dir = join(dir, name);
    this.maxEntries = maxEntries;
    this.mem = new Map();
  }

  _file(key) {
    return join(this.dir, sha256(String(key)).slice(0, 32) + '.json');
  }

  _fresh(entry) {
    return entry && (this.ttlMs === Infinity || Date.now() - entry.t < this.ttlMs);
  }

  get(key) {
    const m = this.mem.get(key);
    if (this._fresh(m)) return m.v;
    if (m) this.mem.delete(key);
    if (this.disk && diskEnabled()) {
      const f = this._file(key);
      if (existsSync(f)) {
        try {
          const entry = JSON.parse(readFileSync(f, 'utf8'));
          if (entry.k === String(key) && this._fresh(entry)) {
            this.mem.set(key, { t: entry.t, v: entry.v });
            return entry.v;
          }
        } catch { /* corrupt cache file: ignore */ }
      }
    }
    return undefined;
  }

  set(key, value) {
    const entry = { t: Date.now(), v: value };
    if (this.mem.size >= this.maxEntries) {
      // Evict oldest insertion (Map preserves insertion order).
      this.mem.delete(this.mem.keys().next().value);
    }
    this.mem.set(key, entry);
    if (this.disk && diskEnabled()) {
      try {
        mkdirSync(this.dir, { recursive: true });
        const f = this._file(key);
        const tmp = f + '.' + process.pid + '.tmp';
        writeFileSync(tmp, JSON.stringify({ k: String(key), ...entry }));
        renameSync(tmp, f);
      } catch { /* disk cache is best effort */ }
    }
    return value;
  }

  delete(key) {
    this.mem.delete(key);
  }

  clear() {
    this.mem.clear();
  }
}
