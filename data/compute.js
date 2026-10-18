/**
 * Per-day "hottest / coldest city" logic, shared by backfill.js and update.js.
 *
 * Source: Open-Meteo (free, no API key).
 *   - Historical archive  https://archive-api.open-meteo.com/v1/archive   (reanalysis; lags ~5 days)
 *   - Forecast endpoint   https://api.open-meteo.com/v1/forecast?past_days=N (covers the last few days)
 * We take archive data for anything older than ARCHIVE_LAG_DAYS and forecast "past_days"
 * data for the most recent days, so a backfill through yesterday is always possible.
 *
 * DEFINITION (keep consistent): both comparisons use the DAILY HIGH (temperature_2m_max).
 *   hottest city = highest daily high; coldest city = LOWEST daily high.
 * That gives an apples-to-apples "warmest / coolest daytime" measure. Using the daily
 * minimum for "coldest" would be the obvious alternative, but we keep one definition.
 */
const { CITIES, SAN_FRANCISCO } = require('./cities');

const ARCHIVE_URL  = 'https://archive-api.open-meteo.com/v1/archive';
const FORECAST_URL = 'https://api.open-meteo.com/v1/forecast';
const ARCHIVE_LAG_DAYS = 7;       // the archive is reliably complete up to about a week ago
const FORECAST_PAST_DAYS_MAX = 92; // Open-Meteo's limit for past_days

/* ---------------------------------------------------------------- dates (all 'YYYY-MM-DD') */

function pad(n) { return String(n).padStart(2, '0'); }

/** Today's date in San Francisco local time. */
function todayInSF() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Los_Angeles', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date());
  const get = (t) => parts.find((p) => p.type === t).value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}

function addDays(iso, n) {
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

function daysBetween(a, b) {   // b - a, in whole days
  return Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 86400000);
}

/** Day-of-year, 1-based: Jan 1 → 1. */
function dayOfYear(iso) {
  return daysBetween(`${iso.slice(0, 4)}-01-01`, iso) + 1;
}

function listDates(start, end) {
  const out = [];
  for (let d = start; d <= end; d = addDays(d, 1)) out.push(d);
  return out;
}

/* ---------------------------------------------------------------- Open-Meteo fetching */

async function getJSON(url) {
  const res = await fetch(url, { headers: { 'User-Agent': 'sf-weather-tally/1.0' } });
  if (!res.ok) throw new Error(`Open-Meteo ${res.status} for ${url}`);
  const body = await res.json();
  if (body && body.error) throw new Error(`Open-Meteo: ${body.reason}`);
  return Array.isArray(body) ? body : [body];   // one location → object, many → array
}

function coordParams() {
  return `latitude=${CITIES.map((c) => c.lat).join(',')}&longitude=${CITIES.map((c) => c.lon).join(',')}`;
}

/**
 * Fetch each city's daily high (°F) for every date in [start, end].
 * Returns { [date]: { [cityName]: highF | null } }.
 */
async function fetchDailyHighs(start, end) {
  const result = {};
  for (const d of listDates(start, end)) result[d] = {};

  const today = todayInSF();
  const archiveEnd = addDays(today, -ARCHIVE_LAG_DAYS);
  const common = `${coordParams()}&daily=temperature_2m_max&temperature_unit=fahrenheit&timezone=auto`;

  const merge = (locations) => {
    locations.forEach((loc, i) => {
      const city = CITIES[i].name;
      const times = (loc.daily && loc.daily.time) || [];
      const maxes = (loc.daily && loc.daily.temperature_2m_max) || [];
      times.forEach((t, j) => {
        if (result[t] && result[t][city] == null) result[t][city] = maxes[j] == null ? null : maxes[j];
      });
    });
  };

  // 1. Archive for the older part of the range.
  if (start <= archiveEnd) {
    const aEnd = end < archiveEnd ? end : archiveEnd;
    merge(await getJSON(`${ARCHIVE_URL}?${common}&start_date=${start}&end_date=${aEnd}`));
  }

  // 2. Forecast endpoint's past_days for the recent part of the range (fills what the archive lacks).
  if (end > archiveEnd) {
    const pastDays = Math.min(FORECAST_PAST_DAYS_MAX, Math.max(1, daysBetween(start > archiveEnd ? start : addDays(archiveEnd, 1), today)));
    merge(await getJSON(`${FORECAST_URL}?${common}&past_days=${pastDays}&forecast_days=1`));
  }

  return result;
}

/* ---------------------------------------------------------------- the per-day rule */

/**
 * Given { cityName: highF | null } for one date, decide the hottest and coldest cities.
 * Returns null if San Francisco has no reading that day (the day is skipped, not counted).
 */
function tallyDay(date, highs) {
  const sf = highs[SAN_FRANCISCO.name];
  if (sf == null || !Number.isFinite(sf)) return null;

  const others = CITIES
    .filter((c) => c.name !== SAN_FRANCISCO.name)
    .map((c) => ({ city: c.name, high: highs[c.name] }))
    .filter((r) => r.high != null && Number.isFinite(r.high));
  if (others.length < CITIES.length / 2) return null;   // too much missing data to judge the day

  const byHigh = [...others].sort((a, b) => b.high - a.high);   // hottest first
  const hottestOther = byHigh[0];
  const coldestOther = byHigh[byHigh.length - 1];

  // SF "wins" if no other city beats it. Ties therefore count as a win (nobody was hotter/colder).
  const sfHot  = sf >= hottestOther.high;
  const sfCold = sf <= coldestOther.high;

  return {
    date,
    sfHigh: sf,
    hottest: sfHot ? SAN_FRANCISCO.name : hottestOther.city,
    hottestHigh: sfHot ? sf : hottestOther.high,
    coldest: sfCold ? SAN_FRANCISCO.name : coldestOther.city,
    coldestHigh: sfCold ? sf : coldestOther.high,
    sfHot,
    sfCold,
    runnerUpHot:  hottestOther,   // the city SF beat (or that beat SF) for hottest
    runnerUpCold: coldestOther,   // likewise for coldest
  };
}

/* ---------------------------------------------------------------- data.json shape */

function emptyData(year) {
  return {
    hot: 0,
    cold: 0,
    totalDays: 0,
    year,
    lastUpdated: null,
    hotDates: [],
    coldDates: [],
    winDates: [],          // { date, type: 'hot' | 'cold', sfHigh, runnerUp, runnerUpHigh }
    lastProcessedDate: null,
    definition: 'Both counts use the daily HIGH: hottest = highest daily high, coldest = lowest daily high, across the cities in data/cities.js.',
    source: 'Open-Meteo (open-meteo.com)',
  };
}

/**
 * Fold one day's result into data. Idempotent: a date that was already processed is ignored.
 * Days with no usable reading (result === null) still advance lastProcessedDate/totalDays.
 */
function applyDay(data, date, result) {
  if (data.lastProcessedDate && date <= data.lastProcessedDate) return data;
  if (data.hotDates.includes(date) || data.coldDates.includes(date)) return data;

  if (result) {
    if (result.sfHot) {
      data.hot += 1;
      data.hotDates.push(date);
      data.winDates.push({ date, type: 'hot', sfHigh: result.sfHigh,
        runnerUp: result.runnerUpHot.city, runnerUpHigh: result.runnerUpHot.high });
    }
    if (result.sfCold) {
      data.cold += 1;
      data.coldDates.push(date);
      data.winDates.push({ date, type: 'cold', sfHigh: result.sfHigh,
        runnerUp: result.runnerUpCold.city, runnerUpHigh: result.runnerUpCold.high });
    }
  }

  data.lastProcessedDate = date;
  data.lastUpdated = date;
  data.totalDays = dayOfYear(date);   // days elapsed in the year through this date
  return data;
}

/** Run the rule for every date in [start, end] and fold the results into data. */
async function processRange(data, start, end, log = console.log) {
  if (start > end) { log(`Nothing to do: ${start} is after ${end}.`); return data; }
  log(`Fetching daily highs for ${CITIES.length} cities, ${start} → ${end} …`);
  const highs = await fetchDailyHighs(start, end);
  let skipped = 0;
  for (const date of listDates(start, end)) {
    const r = tallyDay(date, highs[date] || {});
    if (!r) skipped += 1;
    else if (r.sfHot || r.sfCold) log(`  ${date}: SF ${r.sfHot ? 'HOTTEST' : 'COLDEST'} (SF high ${r.sfHigh}°F; next ${r.sfHot ? r.runnerUpHot.city + ' ' + r.runnerUpHot.high : r.runnerUpCold.city + ' ' + r.runnerUpCold.high}°F)`);
    applyDay(data, date, r);
  }
  if (skipped) log(`  (${skipped} day(s) had no usable reading and were not judged)`);
  return data;
}

module.exports = {
  todayInSF, addDays, daysBetween, dayOfYear, listDates,
  fetchDailyHighs, tallyDay, emptyData, applyDay, processRange,
};
