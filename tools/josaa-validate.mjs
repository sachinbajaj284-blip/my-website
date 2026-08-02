#!/usr/bin/env node
/**
 * josaa-validate.mjs — sanity-check data/josaa/ before it goes anywhere near a student.
 *
 *   node tools/josaa-validate.mjs
 *
 * Exits non-zero on any error. Wrong cutoff data is worse than no cutoff data, so this
 * runs as a gate: if it fails, do not deploy the dataset.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'data', 'josaa');

const errors = [];
const warnings = [];
const err = m => errors.push(m);
const warn = m => warnings.push(m);

let manifest;
try {
  manifest = JSON.parse(await fs.readFile(path.join(OUT, 'manifest.json'), 'utf8'));
} catch {
  console.error('No data/josaa/manifest.json — run tools/josaa-ingest.mjs first.');
  process.exit(1);
}

if (manifest.schemaVersion !== 1) err(`Unexpected schemaVersion ${manifest.schemaVersion}`);
if (!manifest.source?.url) err('manifest.source.url missing — attribution is required under GODL-India');
if (!manifest.institutes?.length) err('No institutes');
if (!manifest.branches?.length) err('No branches');
if (!manifest.years?.length) err('No years');

/* Staleness: JoSAA counselling concludes by ~August. A dataset missing the current
   admission year during counselling season is actively misleading. */
const nowYear = new Date().getFullYear();
const newest = Math.max(...(manifest.years ?? [0]));
if (newest < nowYear && new Date().getMonth() >= 6) {
  warn(`Newest year is ${newest} but it is already ${nowYear} — re-run the ingest before counselling season traffic arrives.`);
}

const instIds = new Set(manifest.institutes.map(i => i.id));
const branchIds = new Set(manifest.branches.map(b => b.id));

let totalRows = 0;
const perYear = new Map();

for (const [key, file] of Object.entries(manifest.shards ?? {})) {
  let shard;
  try {
    shard = JSON.parse(await fs.readFile(path.join(OUT, file), 'utf8'));
  } catch {
    err(`Shard ${key} -> ${file} missing or unparseable`);
    continue;
  }
  if (!Array.isArray(shard.rows)) { err(`Shard ${file}: rows is not an array`); continue; }

  shard.rows.forEach((r, i) => {
    const where = `${file}[${i}]`;
    if (r.length !== 6) return err(`${where}: expected 6 columns, got ${r.length}`);
    const [inst, branch, quota, year, open, close] = r;

    if (!instIds.has(inst)) err(`${where}: unknown institute id ${inst}`);
    if (!branchIds.has(branch)) err(`${where}: unknown branch id ${branch}`);
    if (quota < 0 || quota >= manifest.quotas.length) err(`${where}: quota index ${quota} out of range`);
    if (!manifest.years.includes(year)) err(`${where}: year ${year} not in manifest.years`);

    if (!Number.isInteger(open) || open < 1) err(`${where}: bad opening rank ${open}`);
    if (!Number.isInteger(close) || close < 1) err(`${where}: bad closing rank ${close}`);
    /* Opening rank is the best rank admitted, closing the worst — so open <= close.
       An inversion means the columns were swapped during parsing. */
    if (open > close) err(`${where}: opening rank ${open} worse than closing rank ${close} — columns likely swapped`);
    if (close > 2_000_000) warn(`${where}: closing rank ${close} implausibly large`);

    perYear.set(year, (perYear.get(year) ?? 0) + 1);
    totalRows++;
  });
}

if (totalRows !== manifest.counts?.records) {
  warn(`manifest.counts.records=${manifest.counts?.records} but ${totalRows} rows found across shards`);
}

/* A year with a tiny row count usually means a partial scrape that silently succeeded. */
const counts = [...perYear.values()];
if (counts.length > 1) {
  const max = Math.max(...counts);
  for (const [year, n] of perYear) {
    if (n < max * 0.5) warn(`Year ${year} has ${n} rows vs ${max} in the fullest year — likely an incomplete pull`);
  }
}

if (manifest.problems?.length) {
  manifest.problems.forEach(p => warn(`ingest reported: ${p}`));
}

console.log(`Validated ${totalRows} rows across ${Object.keys(manifest.shards ?? {}).length} shards`);
console.log(`  Years: ${manifest.years.join(', ')}`);
console.log(`  ${manifest.institutes.length} institutes · ${manifest.branches.length} branches`);

if (warnings.length) {
  console.log(`\n${warnings.length} warning(s):`);
  warnings.forEach(w => console.log(`  ! ${w}`));
}
if (errors.length) {
  console.error(`\n${errors.length} error(s):`);
  errors.slice(0, 40).forEach(e => console.error(`  x ${e}`));
  if (errors.length > 40) console.error(`  … and ${errors.length - 40} more`);
  console.error('\nDataset is NOT safe to publish.');
  process.exit(1);
}
console.log('\nDataset looks structurally sound.');
