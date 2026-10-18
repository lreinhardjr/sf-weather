#!/usr/bin/env node
/**
 * Daily incremental update:  npm run update
 * Reads /data.json, tallies every completed day not yet processed (normally just yesterday),
 * and writes the file back. Idempotent — running it twice on the same day changes nothing.
 *
 * - If data.json is missing, or belongs to a previous year, it starts a fresh tally for the
 *   current year from January 1 (so the New Year rollover is automatic).
 * - If the daily job missed a few days, it catches up on all of them.
 */
const fs = require('fs');
const path = require('path');
const { todayInSF, addDays, emptyData, processRange } = require('./compute');

const OUT = path.join(__dirname, '..', 'data.json');

async function main() {
  const today = todayInSF();
  const yesterday = addDays(today, -1);
  const year = Number(today.slice(0, 4));

  let data = null;
  if (fs.existsSync(OUT)) {
    try { data = JSON.parse(fs.readFileSync(OUT, 'utf8')); } catch (e) { data = null; }
  }
  if (!data || data.year !== year || !Array.isArray(data.hotDates) || !Array.isArray(data.coldDates)) {
    console.log(data ? `data.json is for ${data.year}; starting a fresh ${year} tally.` : 'No usable data.json; starting a fresh tally.');
    data = emptyData(year);
  }
  if (!Array.isArray(data.winDates)) data.winDates = [];

  const start = data.lastProcessedDate ? addDays(data.lastProcessedDate, 1) : `${year}-01-01`;
  if (start > yesterday) {
    console.log(`Already up to date through ${data.lastProcessedDate}. Nothing to do.`);
    return;
  }

  const before = JSON.stringify(data);
  await processRange(data, start, yesterday);

  if (JSON.stringify(data) === before) { console.log('No changes.'); return; }
  fs.writeFileSync(OUT, JSON.stringify(data, null, 2) + '\n');
  console.log(`\nUpdated ${path.relative(process.cwd(), OUT)}: hot=${data.hot}, cold=${data.cold}, totalDays=${data.totalDays}, lastUpdated=${data.lastUpdated}`);
}

main().catch((err) => { console.error('Update failed:', err.message); process.exit(1); });
