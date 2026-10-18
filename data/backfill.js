#!/usr/bin/env node
/**
 * Seed run: tally every day from January 1 of the current year through yesterday,
 * then write /data.json. Run this once, intentionally:  npm run backfill
 * It REPLACES data.json (it does not merge with what's there).
 *
 * Optional: BACKFILL_YEAR=2025 npm run backfill   (tallies a full past year instead)
 */
const fs = require('fs');
const path = require('path');
const { todayInSF, addDays, emptyData, processRange } = require('./compute');

const OUT = path.join(__dirname, '..', 'data.json');

async function main() {
  const today = todayInSF();
  const yesterday = addDays(today, -1);
  const year = process.env.BACKFILL_YEAR ? Number(process.env.BACKFILL_YEAR) : Number(today.slice(0, 4));

  const start = `${year}-01-01`;
  const end = year === Number(today.slice(0, 4)) ? yesterday : `${year}-12-31`;

  const data = emptyData(year);
  await processRange(data, start, end);

  fs.writeFileSync(OUT, JSON.stringify(data, null, 2) + '\n');
  console.log(`\nWrote ${path.relative(process.cwd(), OUT)}: hot=${data.hot}, cold=${data.cold}, totalDays=${data.totalDays}, lastUpdated=${data.lastUpdated}`);
}

main().catch((err) => { console.error('Backfill failed:', err.message); process.exit(1); });
