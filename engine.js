// Karle engine: dates, the dump parser, reminders, musts, scoring and Wrapped.
// No UI code here, so all of it can be tested in Node.

/* ---------- dates ---------- */
// A day runs 04:00 to 04:00, so 1am still belongs to the night before.
export const ROLL_H = 4;
const pad = n => String(n).padStart(2, '0');
export const fmtKey = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const dayKey = ms => fmtKey(new Date(ms - ROLL_H * 3600e3));
export const keyDate = k => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d); };
export const addDays = (k, n) => { const d = keyDate(k); d.setDate(d.getDate() + n); return fmtKey(d); };
export const diffDays = (a, b) => Math.round((keyDate(b) - keyDate(a)) / 864e5);
export const weekday = k => keyDate(k).getDay();
export const weekStart = k => addDays(k, -((weekday(k) + 6) % 7));
export const toMin = t => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
export const hhmm = min => `${pad(Math.floor(min / 60) % 24)}:${pad(min % 60)}`;
export const dueMs = (date, time) => keyDate(date).getTime() + toMin(time) * 60e3;
export const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export const DAYS_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
export const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
// A reminder moved after it was missed still counts from the day it was first due.
export const dueOf = r => r.firstDue || r.date;
export const uid = () => Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4);

/* ---------- state ---------- */
export function fresh(nowMs) {
  return {
    v: 3, created: dayKey(nowMs), reminders: [], musts: [], timer: null, emergency: {}, results: {},
    seen: { reveal: null, wrapped: null }, lastFinal: null, onboarded: false,
    settings: { reveal: '21:30', alertAt: '09:00', ping: 'off', autoSend: true, shortcut: 'Karle', theme: 'dark' }
  };
}
export function migrate(s, nowMs) {
  const f = fresh(nowMs);
  if (!s || s.v !== 3) return f;
  for (const k of Object.keys(f)) if (s[k] === undefined) s[k] = f[k];
  s.settings = { ...f.settings, ...s.settings };
  return s;
}

/* ---------- weights (harsh scoring) ---------- */
export const SIZE = { s: 2, m: 6, b: 15 };
export const remWeight = r => SIZE[r.size || 's'] * (r.prio ? 1.5 : 1);
export const mustWeight = (m, target) => (m.type === 'time' ? Math.max(1, target / 10) : SIZE[m.size || 'm']) * (m.prio ? 1.5 : 1);

/* ---------- parser ---------- */
const WD = { sun: 0, sunday: 0, mon: 1, monday: 1, tue: 2, tues: 2, tuesday: 2, wed: 3, weds: 3, wednesday: 3, thu: 4, thur: 4, thurs: 4, thursday: 4, fri: 5, friday: 5, sat: 6, saturday: 6 };
const WDRE = 'sun(?:day)?|mon(?:day)?|tue(?:sday|s)?|wed(?:nesday|s)?|thu(?:rsday|rs|r)?|fri(?:day)?|sat(?:urday)?';
const MRE = 'jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?';
const monIdx = s => ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'].indexOf(s.slice(0, 3).toLowerCase());
const NUMW = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7 };
const PARTS = { morning: '09:00', noon: '12:00', afternoon: '14:00', evening: '18:00', night: '21:00' };

function mkTime(h, m, ap) {
  if (ap) { ap = ap.toLowerCase(); if (h < 1 || h > 12) return null; if (ap === 'pm' && h < 12) h += 12; if (ap === 'am' && h === 12) h = 0; }
  if (h > 23 || m > 59) return null;
  return `${pad(h)}:${pad(m)}`;
}
function dateFrom(today, day, mon, year) {
  const t = keyDate(today);
  let y = year != null ? (year < 100 ? 2000 + year : year) : t.getFullYear();
  let d = new Date(y, mon, day);
  if (d.getMonth() !== mon || d.getDate() !== day) return null;
  if (year == null && fmtKey(d) < today) d = new Date(y + 1, mon, day);
  return fmtKey(d);
}
// The next date on or after `from` that matches a repeat rule.
export function firstMatch(rep, from) {
  if (!rep) return from;
  if (rep.kind === 'days') { for (let i = 0; i < 7; i++) { const k = addDays(from, i); if (rep.days.includes(weekday(k))) return k; } }
  return from;
}
export function nextDate(rep, prev, today) {
  const after = prev >= today ? addDays(prev, 1) : today;
  if (rep.kind === 'daily') return after;
  if (rep.kind === 'days') return firstMatch(rep, after);
  if (rep.kind === 'weekly') { let k = addDays(prev, 7); while (k < today) k = addDays(k, 7); return k; }
  if (rep.kind === 'monthly') {
    const p = keyDate(prev), dom = p.getDate(); let y = p.getFullYear(), m = p.getMonth();
    for (let i = 0; i < 60; i++) { m++; if (m > 11) { m = 0; y++; } const last = new Date(y, m + 1, 0).getDate(); const k = fmtKey(new Date(y, m, Math.min(dom, last))); if (k >= today) return k; }
  }
  return after;
}

export function parse(raw, nowMs) {
  const today = dayKey(nowMs);
  let s = ' ' + String(raw).trim().replace(/\s+/g, ' ') + ' ';
  const o = { kind: 'reminder', title: '', date: null, time: null, repeat: null, prio: false, size: null, minutes: null, sched: null };
  const take = (re, fn) => { const m = s.match(re); if (!m) return false; const r = fn(m); if (r === false) return false; s = s.slice(0, m.index) + ' ' + s.slice(m.index + m[0].length); return true; };

  let must = false;
  take(/^\s*must\s+/i, () => { must = true; });
  if (/!/.test(s)) { o.prio = true; s = s.replace(/!+/g, ' '); }
  take(/\s\+(s|m|b)(?=\s)/i, m => { o.size = m[1].toLowerCase(); });

  // durations: 5h, 1.5 hours, 1h30m, 90m, ~45 min, "for 2 hours"
  take(/\s(?:for\s)?~?(\d+(?:\.\d+)?)\s?(?:h|hr|hrs|hour|hours)(?:\s?(\d+)\s?(?:m|min|mins|minutes))?(?=\s)/i, m => { o.minutes = Math.round(parseFloat(m[1]) * 60 + (m[2] ? +m[2] : 0)); });
  if (o.minutes == null) take(/\s(?:for\s)?~?(\d+)\s?(?:m|min|mins|minutes)(?=\s)/i, m => { o.minutes = +m[1]; });
  if (o.minutes === 0) o.minutes = null;

  // repeats
  let rec = null;
  take(/\s(\d+|once|twice)\s?(?:x|times)?\s(?:a|per|every|each)\s?week(?=\s)/i, m => { const n = m[1] === 'once' ? 1 : m[1] === 'twice' ? 2 : +m[1]; if (!n) return false; rec = { kind: 'week', n: Math.min(7, n) }; });
  if (!rec) take(/\s(\d)x\s?(?:a\s)?week(?=\s)/i, m => { rec = { kind: 'week', n: Math.min(7, +m[1] || 1) }; });
  if (!rec) take(/\s(?:every\s?day|everyday|daily|each day)(?=\s)/i, () => { rec = { kind: 'daily' }; });
  if (!rec) take(/\s(?:on\s)?(?:every\s)?weekdays(?=\s)/i, () => { rec = { kind: 'days', days: [1, 2, 3, 4, 5] }; });
  if (!rec) take(/\s(?:on\s)?(?:every\s)?weekends?(?=\s)/i, () => { rec = { kind: 'days', days: [0, 6] }; });
  if (!rec) take(/\s(?:(?:every|each)\smonth|monthly)(?=\s)/i, () => { rec = { kind: 'monthly' }; });
  if (!rec) take(/\s(?:(?:every|each)\sweek|weekly)(?=\s)/i, () => { rec = { kind: 'weekly' }; });
  if (!rec) take(new RegExp(`\\s(?:every|each|on)\\s((?:${WDRE})(?:\\s?(?:,|and|&|/)?\\s?(?:${WDRE}))*)(?=\\s)`, 'i'), m => {
    const days = [...new Set(m[1].toLowerCase().split(/[\s,&/]+/).filter(w => w && w !== 'and').map(w => WD[w]).filter(x => x != null))].sort();
    const isEvery = /^\s(?:every|each)/i.test(m[0]);
    if (!isEvery && days.length < 2) return false; // "on fri" is a date, not a repeat
    rec = { kind: 'days', days };
  });

  // times
  take(/\s(?:at\s|by\s)?(\d{1,2})[:.](\d{2})\s?(am|pm)?(?=\s)/i, m => { const t = mkTime(+m[1], +m[2], m[3]); if (!t) return false; o.time = t; });
  if (!o.time) take(/\s(?:at\s|by\s)?(\d{1,2})\s?(am|pm)(?=\s)/i, m => { const t = mkTime(+m[1], 0, m[2]); if (!t) return false; o.time = t; });
  if (!o.time) take(/\s(?:at|by)\s(\d{1,2})(?=\s)/i, m => { const h = +m[1]; if (h > 23) return false; o.time = mkTime(h >= 1 && h <= 7 ? h + 12 : h, 0); });

  // dates
  take(/\stonight(?=\s)/i, () => { o.date = today; if (!o.time) o.time = '21:00'; });
  take(/\s(?:day after (?:tomorrow|tmrw|tmr))(?=\s)/i, () => { o.date = addDays(today, 2); });
  take(/\s(?:tomorrow|tmrw|tmr|tmw)(?=\s)/i, () => { o.date = addDays(today, 1); });
  take(/\stoday(?=\s)/i, () => { o.date = today; });
  take(/\s(?:in\s)(\d+|a|an|one|two|three|four|five|six|seven)\s(day|days|week|weeks)(?=\s)/i, m => { const n = NUMW[m[1].toLowerCase()] || +m[1]; o.date = addDays(today, /week/i.test(m[2]) ? n * 7 : n); });
  take(/\snext week(?=\s)/i, () => { o.date = addDays(weekStart(today), 7); });
  take(/\s(?:this |on |by )?weekend(?=\s)/i, () => { o.date = firstMatch({ kind: 'days', days: [6] }, today); });
  take(new RegExp(`\\s(?:on\\s|by\\s)?(\\d{1,2})(?:st|nd|rd|th)?\\s(?:of\\s)?(${MRE})(?:\\s(\\d{4}))?(?=\\s)`, 'i'), m => { const d = dateFrom(today, +m[1], monIdx(m[2]), m[3] ? +m[3] : null); if (!d) return false; o.date = d; });
  take(new RegExp(`\\s(?:on\\s|by\\s)?(${MRE})\\s(\\d{1,2})(?:st|nd|rd|th)?(?:\\s(\\d{4}))?(?=\\s)`, 'i'), m => { const d = dateFrom(today, +m[2], monIdx(m[1]), m[3] ? +m[3] : null); if (!d) return false; o.date = d; });
  take(/\s(?:on\s|by\s)?(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?(?=\s)/, m => { const d = dateFrom(today, +m[1], +m[2] - 1, m[3] ? +m[3] : null); if (!d) return false; o.date = d; });
  take(new RegExp(`\\s(?:(next|this|on|by|coming)\\s)?(${WDRE})(?=\\s)`, 'i'), m => {
    const wd = WD[m[2].toLowerCase()]; let delta = (wd - weekday(today) + 7) % 7;
    if (delta === 0 && (m[1] || '').toLowerCase() !== 'this') delta = 7;
    o.date = addDays(today, delta);
  });
  take(/\s(?:on\s|by\s)?(?:the\s)?(\d{1,2})(?:st|nd|rd|th)(?=\s)/i, m => {
    const t = keyDate(today), dd = +m[1]; let d = new Date(t.getFullYear(), t.getMonth(), dd);
    if (d.getDate() !== dd) return false; if (fmtKey(d) < today) d = new Date(t.getFullYear(), t.getMonth() + 1, dd);
    if (d.getDate() !== dd) return false; o.date = fmtKey(d);
  });
  if (!o.time) take(/\s(?:in the\s|this\s|at\s)?(morning|noon|afternoon|evening|night)(?=\s)/i, m => { o.time = PARTS[m[1].toLowerCase()]; });

  // title
  let t = s.replace(/\s+/g, ' ').trim();
  for (let i = 0; i < 4; i++) {
    t = t.replace(/^(?:on|at|by|in|for|every|this|next|to|and|,|-)\s+/i, '').replace(/\s+(?:on|at|by|in|for|every|this|next|the|from|and|,|-)$/i, '').trim();
  }
  t = t.replace(/^[,\-\s]+|[,\-\s]+$/g, '');
  o.title = t ? t[0].toUpperCase() + t.slice(1) : '';

  // classify: a "must" is something you want forced: a target or a times-a-week goal.
  const forced = must || (rec && rec.kind === 'week') || (rec && o.minutes && (rec.kind === 'daily' || rec.kind === 'days'));
  if (forced) {
    o.kind = 'must';
    o.type = o.minutes ? 'time' : 'check';
    o.target = o.minutes || null;
    o.sched = rec && ['daily', 'days', 'week'].includes(rec.kind) ? rec : { kind: 'daily' };
    o.date = null; o.time = null;
  } else {
    if (rec && rec.kind === 'week') rec = { kind: 'weekly' };
    o.repeat = rec;
    if (!o.date && o.time) o.date = dueMs(today, o.time) > nowMs ? today : addDays(today, 1);
    if (rec && !o.date) o.date = firstMatch(rec, today);
    if (rec && rec.kind === 'days' && o.date && !rec.days.includes(weekday(o.date))) o.date = firstMatch(rec, o.date);
  }
  if (!o.title) o.title = o.kind === 'must' ? 'Untitled must' : '';
  return o;
}

export function describeRepeat(rep) {
  if (!rep) return '';
  if (rep.kind === 'daily') return 'every day';
  if (rep.kind === 'weekly') return 'every week';
  if (rep.kind === 'monthly') return 'every month';
  if (rep.kind === 'week') return `${rep.n}× a week`;
  if (rep.kind === 'days') {
    const d = rep.days.join();
    if (d === '1,2,3,4,5') return 'weekdays';
    if (d === '0,6') return 'weekends';
    if (rep.days.length === 7) return 'every day';
    return 'every ' + [...rep.days].sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7)).map(x => DAYS[x]).join(', ');
  }
  return '';
}

/* ---------- reminders ---------- */
export function buckets(st, today) {
  const open = st.reminders.filter(r => !r.done);
  const byWhen = (a, b) => (a.date || '').localeCompare(b.date || '') || (a.time || '99').localeCompare(b.time || '99') || a.created - b.created;
  const end = addDays(today, 6);
  return {
    missed: open.filter(r => r.date && dueOf(r) < today).sort((a, b) => dueOf(a).localeCompare(dueOf(b)) || byWhen(a, b)),
    today: open.filter(r => r.date === today && dueOf(r) >= today).sort(byWhen),
    week: open.filter(r => r.date && dueOf(r) >= today && r.date > today && r.date <= end).sort(byWhen),
    later: open.filter(r => r.date && dueOf(r) >= today && r.date > end).sort(byWhen),
    anytime: open.filter(r => !r.date).sort((a, b) => a.created - b.created),
    doneToday: st.reminders.filter(r => r.done && r.doneDay === today).sort((a, b) => b.doneAt - a.doneAt)
  };
}

/* ---------- musts ---------- */
export const logged = (m, d) => (m.log && m.log[d]) || 0;
export const sessionDone = (m, d) => m.type === 'time' ? logged(m, d) >= m.target : logged(m, d) >= 1;

// required: must happen today. optional: a times-a-week must with slack left. extra: weekly goal already met. off: not today.
export function mustStatus(st, m, d) {
  if (d < m.created || (m.paused && (!m.pausedOn || m.pausedOn <= d)) || st.emergency[d]) return 'off';
  const s = m.sched;
  if (s.kind === 'daily') return 'required';
  if (s.kind === 'days') return s.days.includes(weekday(d)) ? 'required' : 'off';
  const ws = weekStart(d), idx = diffDays(ws, d);
  let done = 0;
  for (let i = 0; i < idx; i++) { const k = addDays(ws, i); if (k >= m.created && sessionDone(m, k)) done++; }
  const firstIdx = m.created > ws ? diffDays(ws, m.created) : 0;
  const n = Math.min(s.n, 7 - firstIdx); // a goal created mid-week only asks for what still fits
  const need = n - done, left = 7 - idx;
  if (need <= 0) return 'extra';
  return need >= left ? 'required' : 'optional';
}
// Timer musts can carry unfinished time into the next scheduled day (capped at one day's target).
export function owedOn(st, m, d) {
  if (m.type !== 'time' || !m.carry || m.sched.kind === 'week') return 0;
  let k = m.created > addDays(d, -30) ? m.created : addDays(d, -30), ow = 0;
  for (; k < d; k = addDays(k, 1)) {
    if (mustStatus(st, m, k) !== 'required') continue;
    ow = Math.min(m.target, Math.max(0, m.target + ow - logged(m, k)));
  }
  return ow;
}
export const targetOn = (st, m, d) => m.type === 'time' ? m.target + owedOn(st, m, d) : 1;
export function weekDone(st, m, d) {
  const ws = weekStart(d); let n = 0;
  for (let i = 0; i < 7; i++) { const k = addDays(ws, i); if (k > d) break; if (sessionDone(m, k)) n++; }
  return n;
}

/* ---------- scoring ---------- */
export function emergencyInWeek(st, d) {
  const ws = weekStart(d);
  for (let i = 0; i < 7; i++) { const k = addDays(ws, i); if (st.emergency[k]) return k; }
  return null;
}
export function scoreDay(st, d) {
  const R = { day: d, score: null, emergency: !!st.emergency[d], planned: 0, earned: 0, bonus: 0, penalty: 0,
    rem: { due: 0, done: 0, missed: [], late: [] }, musts: [], costs: [] };
  if (R.emergency) return R;
  for (const r0 of st.reminders) {
    if (!r0.date) continue;
    const r = { ...r0, date: dueOf(r0) };
    const w = remWeight(r);
    if (r.date === d) {
      R.planned += w; R.rem.due++;
      if (r.done && r.doneDay <= d) { R.earned += w; R.rem.done++; } else R.rem.missed.push(r.title);
    } else if (r.date < d) {
      if (r.done && r.doneDay === d) { R.earned += w * 0.5; R.rem.late.push(r.title); }
      else if (!r.done || r.doneDay > d) { const p = w * 0.25 * diffDays(r.date, d); R.penalty += p; R.costs.push([r.title, p]); }
    }
  }
  for (const m of st.musts) {
    const s = mustStatus(st, m, d); if (s === 'off') continue;
    const tgt = targetOn(st, m, d), w = mustWeight(m, tgt), got = logged(m, d);
    const frac = m.type === 'time' ? Math.min(1, got / tgt) : (got >= 1 ? 1 : 0);
    if (s === 'required') {
      R.planned += w; R.earned += w * frac;
      if (m.type === 'time' && got > tgt) R.bonus += Math.min(0.25 * w, ((got - tgt) / tgt) * w * 0.25);
      if (frac < 1) R.costs.push([m.title, w * (1 - frac)]);
    } else if (frac >= 1) R.bonus += 0.25 * w;
    R.musts.push({ id: m.id, title: m.title, type: m.type, status: s, target: tgt, got, frac });
  }
  if (!R.planned && !R.penalty && !R.earned && !R.bonus) return R;
  const raw = (R.earned + R.bonus - R.penalty) / (R.planned || 10) * 100;
  R.score = Math.max(-50, Math.min(100, Math.round(raw)));
  return R;
}
// Freeze every finished day once, so later edits can't rewrite history.
export function finalize(st, today) {
  let k = st.lastFinal ? addDays(st.lastFinal, 1) : st.created;
  let changed = false;
  for (let i = 0; k < today && i < 400; i++, k = addDays(k, 1)) {
    const r = scoreDay(st, k);
    st.results[k] = { score: r.score, emergency: r.emergency, done: r.rem.done, due: r.rem.due, late: r.rem.late.length, penalty: Math.round(r.penalty * 10) / 10,
      musts: r.musts.map(x => ({ id: x.id, title: x.title, type: x.type, status: x.status, got: x.got, target: x.target, frac: x.frac })),
      costs: r.costs.map(([t, p]) => [t, Math.round(p * 10) / 10]) };
    st.lastFinal = k; changed = true;
  }
  return changed;
}
export const scoreOf = (st, d, today) => d < today ? (st.results[d] ? st.results[d].score : null) : scoreDay(st, d).score;

/* ---------- Wrapped ---------- */
export function weekStats(st, ws, today) {
  const days = [];
  for (let i = 0; i < 7; i++) {
    const k = addDays(ws, i), r = k < today ? st.results[k] : null;
    days.push({ day: k, score: r ? r.score : null, emergency: r ? r.emergency : !!st.emergency[k], r });
  }
  const scored = days.filter(x => x.score != null);
  const avg = scored.length ? Math.round(scored.reduce((a, x) => a + x.score, 0) / scored.length) : null;
  const best = scored.reduce((a, x) => !a || x.score > a.score ? x : a, null);
  const worst = scored.reduce((a, x) => !a || x.score < a.score ? x : a, null);
  const end = addDays(ws, 6);
  const rs = st.reminders.filter(r => r.date).map(r => ({ ...r, date: dueOf(r) }));
  const dueIn = rs.filter(r => r.date >= ws && r.date <= end);
  const onTime = dueIn.filter(r => r.done && r.doneDay <= r.date).length;
  const late = rs.filter(r => r.done && r.doneDay >= ws && r.doneDay <= end && r.doneDay > r.date);
  const stillOpen = rs.filter(r => (!r.done || r.doneDay > end) && r.date <= end).sort((a, b) => a.date.localeCompare(b.date));
  const doneAll = st.reminders.filter(r => r.done && r.doneDay >= ws && r.doneDay <= end).length;
  const musts = {}; const costs = {};
  for (const x of days) {
    if (!x.r) continue;
    for (const m of x.r.musts) {
      const e = musts[m.id] || (musts[m.id] = { title: m.title, type: m.type, req: 0, hit: 0, mins: 0, extra: 0 });
      e.title = m.title;
      if (m.status === 'required') { e.req++; if (m.frac >= 1) e.hit++; } else if (m.frac >= 1) e.extra++;
      if (m.type === 'time') e.mins += m.got;
    }
    for (const [t, p] of x.r.costs) costs[t] = (costs[t] || 0) + p;
  }
  const costliest = Object.entries(costs).sort((a, b) => b[1] - a[1])[0] || null;
  const mustList = Object.values(musts);
  const reqAll = mustList.reduce((a, m) => a + m.req, 0), hitAll = mustList.reduce((a, m) => a + m.hit, 0);
  const minutes = mustList.reduce((a, m) => a + m.mins, 0);
  return { ws, days, avg, best, worst, dueCount: dueIn.length, onTime, late, stillOpen, doneAll, musts: mustList, reqAll, hitAll, minutes, costliest, scoredDays: scored.length };
}
export function wrappedTitle(w, p) {
  if (w.avg == null) return { title: 'No Show', line: 'Not a single scored day. Nothing to wrap.' };
  const dv = p && p.avg != null ? w.avg - p.avg : null;
  if (w.avg >= 85) return { title: 'Machine', line: 'You did what you said you would. Almost every day.' };
  if (dv != null && dv >= 15) return { title: 'Comeback', line: `Up ${dv} points on last week. Now hold it.` };
  if (dv != null && dv <= -15) return { title: 'Slipping', line: `Down ${-dv} points on last week. You know why.` };
  if (w.avg < 0) return { title: 'Backwards', line: 'Your average was below zero. Overdue things ate the week.' };
  if (w.avg < 40) return { title: 'Ghost', line: 'You showed up some days. Not most.' };
  if (w.avg < 65) return { title: 'Coasting', line: 'Half effort gets half a week.' };
  return { title: 'Holding Steady', line: 'Solid, not special. The gap to great is the stuff you skipped.' };
}
export function wrappedFor(st, ws, today) {
  const w = weekStats(st, ws, today);
  const pws = addDays(ws, -7);
  const p = pws >= weekStart(st.created) ? weekStats(st, pws, today) : null;
  return { w, p, ...wrappedTitle(w, p) };
}
// The most recent finished week that had at least one scored day and hasn't been shown.
export function wrappedDue(st, today) {
  const last = addDays(weekStart(today), -7);
  if (last < weekStart(st.created)) return null;
  if (st.seen.wrapped && st.seen.wrapped >= last) return null;
  const w = weekStats(st, last, today);
  return w.scoredDays ? last : null;
}

/* ---------- calendar file for one reminder ---------- */
export function icsFor(r, alertAt, nowMs) {
  const t = r.time || alertAt;
  const [y, mo, d] = r.date.split('-'), [h, mi] = t.split(':');
  const esc = s => String(s).replace(/[\\;,]/g, m => '\\' + m).replace(/\n/g, '\\n');
  const stamp = new Date(nowMs).toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
  return ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Karle//EN', 'CALSCALE:GREGORIAN', 'BEGIN:VEVENT',
    `UID:${r.id}@karle`, `DTSTAMP:${stamp}`, `SEQUENCE:${r.seq || 0}`, `DTSTART:${y}${mo}${d}T${h}${mi}00`, 'DURATION:PT15M',
    `SUMMARY:${esc(r.title)}`, 'BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${esc(r.title)}`, 'TRIGGER:PT0M', 'END:VALARM',
    'END:VEVENT', 'END:VCALENDAR'].join('\r\n');
}
