// Karle UI. All logic lives in engine.js; this file draws it and handles taps.
import * as E from './engine.js';

/* ---------- basics ---------- */
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const num = n => (n < 0 ? '−' + Math.abs(n) : String(n));
const q = new URLSearchParams(location.search);
let offset = 0;
if (q.get('now')) { const t = new Date(q.get('now')).getTime(); if (!isNaN(t)) offset = t - Date.now(); }
const now = () => Date.now() + offset;
const today = () => E.dayKey(now());
const nowMinOfDay = () => { const d = new Date(now()); return d.getHours() * 60 + d.getMinutes(); };
const dur = m => { m = Math.round(m); const h = Math.floor(m / 60), r = m % 60; return h ? (r ? `${h}h ${r}m` : `${h}h`) : `${r}m`; };
const clock = ms => { const d = new Date(ms); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };
const ICON = {
  gear: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>',
  check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
  play: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5.5v13a1 1 0 0 0 1.5.9l10-6.5a1 1 0 0 0 0-1.7l-10-6.5A1 1 0 0 0 8 5.5z"/></svg>',
  stop: '<svg viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="2.5"/></svg>',
  plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
  x: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>'
};

/* ---------- store ---------- */
const KEY = 'karle.v3';
let st;
try { st = JSON.parse(localStorage.getItem(KEY)); } catch { st = null; }
st = E.migrate(st, now());
try { navigator.storage && navigator.storage.persist && navigator.storage.persist(); } catch {}
const undos = [];
function save() { try { localStorage.setItem(KEY, JSON.stringify(st)); } catch { toast('Could not save. Phone storage is full or blocked.'); } }
function commit(msg, fn, { undo = true, keepSheet = false } = {}) {
  if (undo) { undos.push(JSON.stringify(st)); if (undos.length > 40) undos.shift(); }
  fn(st); save(); render();
  if (!keepSheet && sheetRedraw) sheetRedraw();
  if (msg) toast(msg, undo);
}
function undo() {
  const s = undos.pop(); if (!s) return;
  st = JSON.parse(s); save(); closeSheet(); render(); toast('Undone');
}

/* ---------- toast ---------- */
let toastT = null;
function toast(msg, withUndo = false) {
  const el = $('#toast');
  el.innerHTML = `<span>${esc(msg)}</span>${withUndo ? '<button data-act="undo">Undo</button>' : ''}`;
  el.classList.toggle('solo', !withUndo); el.hidden = false;
  clearTimeout(toastT); toastT = setTimeout(() => { el.hidden = true; }, withUndo ? 4500 : 2600);
}

/* ---------- helpers for words ---------- */
function dayWord(k) {
  const t = today(), d = E.diffDays(t, k);
  if (d === 0) return 'Today'; if (d === 1) return 'Tomorrow'; if (d === -1) return 'Yesterday';
  if (d > 1 && d < 7) return E.DAYS_LONG[E.weekday(k)];
  const dt = E.keyDate(k);
  return `${E.DAYS[dt.getDay()]} ${dt.getDate()} ${E.MONTHS[dt.getMonth()]}`;
}
function shortDate(k) { const d = E.keyDate(k); return `${d.getDate()} ${E.MONTHS[d.getMonth()]}`; }
function inWords(ms) { const m = Math.round(ms / 60000); if (m < 1) return 'now'; return 'in ' + dur(m); }

/* ---------- home ---------- */
const ui = { showDone: false, showLater: false };
function render() {
  const t = today(), b = E.buckets(st, t);
  const h = new Date(now()).getHours();
  const greet = h >= 4 && h < 12 ? 'Morning' : h < 17 && h >= 12 ? 'Afternoon' : 'Evening';
  const name = st.settings.name ? `, ${esc(st.settings.name)}` : '';
  const left = b.today.length + b.missed.length;
  const sub = b.missed.length ? `${b.missed.length} missed, ${b.today.length} left today` : left ? `${left} thing${left === 1 ? '' : 's'} left today` : 'Nothing left today. Nice.';

  // today's progress: reminders due today + required musts
  const R = E.scoreDay(st, t);
  const dueToday = st.reminders.filter(r => r.date === t && E.dueOf(r) === t);
  const doneRem = dueToday.filter(r => r.done).length;
  const req = R.musts.filter(m => m.status === 'required');
  const mustFrac = req.length ? req.reduce((a, m) => a + m.frac, 0) / req.length : null;
  const total = dueToday.length + req.length, doneN = doneRem + req.filter(m => m.frac >= 1).length;
  const pct = total ? Math.round((doneRem + req.reduce((a, m) => a + m.frac, 0)) / total * 100) : 0;

  // week average so far (finished days only)
  const ws = E.weekStart(t); const sc = [];
  for (let i = 0; i < 7; i++) { const k = E.addDays(ws, i); if (k < t && st.results[k] && st.results[k].score != null) sc.push(st.results[k].score); }
  const wavg = sc.length ? Math.round(sc.reduce((a, x) => a + x, 0) / sc.length) : null;

  $('#app').innerHTML = `
  <header class="top">
    <div><h1>${greet}${name}.</h1><p>${esc(sub)}</p></div>
    <button class="round" data-act="settings" aria-label="Settings">${ICON.gear}</button>
  </header>
  ${nowCard(b)}
  <section class="prog" aria-label="Today's progress">
    <div class="row1"><span>Today ${total ? `· ${doneN} of ${total}` : ''}</span><b class="num">${total ? pct + '%' : '–'}</b></div>
    <div class="track"><div class="fill ${pct ? '' : 'zero'}" style="width:${Math.max(0, pct)}%"></div></div>
  </section>
  <section class="tiles">
    <button class="lvl a" data-act="jump-musts"><div class="lb">Musts<br>today</div><div class="pool" style="height:${mustFrac == null ? 0 : Math.round(mustFrac * 100)}%"></div><div class="v num">${mustFrac == null ? '–' : Math.round(mustFrac * 100) + '%'}</div></button>
    <button class="lvl b" data-act="week"><div class="lb">Week<br>score</div><div class="pool" style="height:${wavg == null ? 0 : Math.max(0, wavg)}%"></div><div class="v num">${wavg == null ? '–' : num(wavg)}</div></button>
    ${calTile(t)}
  </section>
  ${b.missed.length ? missedCard(b.missed, t) : ''}
  <section class="card"><h2>Today ${b.today.length ? `<span class="c">${b.today.length}</span>` : ''}</h2>
    ${b.today.length ? `<div class="rows">${b.today.map(r => row(r, 'today')).join('')}</div>` : `<div class="empty">${st.reminders.length ? 'Nothing due today.' : 'Type anything in the box below. “call mom fri 6pm”, “pay fee 15 nov”, “buy charger”.'}</div>`}
    ${b.doneToday.length ? `<button class="more" data-act="toggle-done">${ui.showDone ? 'Hide' : 'Show'} done today (${b.doneToday.length})</button>${ui.showDone ? `<div class="rows">${b.doneToday.map(r => row(r, 'done')).join('')}</div>` : ''}` : ''}
  </section>
  ${mustsCard(t, R)}
  ${b.week.length ? `<section class="card"><h2>This week <span class="c">${b.week.length}</span></h2>${grouped(b.week)}</section>` : ''}
  ${b.anytime.length ? `<section class="card"><h2>Anytime <span class="c">${b.anytime.length}</span></h2><div class="rows">${b.anytime.map(r => row(r, 'any')).join('')}</div></section>` : ''}
  ${b.later.length ? `<section class="card"><h2>Later <span class="c">${b.later.length}</span></h2>${ui.showLater || b.later.length <= 4 ? grouped(b.later, true) : `<button class="more" data-act="toggle-later">Show ${b.later.length} later</button>`}</section>` : ''}
  `;
  bindSwipes();
}

function nowCard(b) {
  const n = now(), d = new Date(n);
  const right = `<div class="day"><b>${E.DAYS_LONG[d.getDay()]}</b><span>${d.getDate()} ${E.MONTHS[d.getMonth()]} ${d.getFullYear()}</span></div>`;
  if (st.timer) {
    const m = st.musts.find(x => x.id === st.timer.id);
    const el = Math.max(0, n - st.timer.start), s = Math.floor(el / 1000);
    const hms = `${Math.floor(s / 3600)}:${String(Math.floor(s / 60) % 60).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
    const t = today(), tgt = m ? E.targetOn(st, m, t) : 0, got = m ? E.logged(m, t) + el / 60000 : 0;
    return `<section class="now" aria-label="Timer">
      <div class="lcd"><div class="lb">${esc(m ? m.title : 'Timer')}</div><div class="dg sm num" id="lcd">${hms}</div></div>${right}
      <div class="nx"><span class="t">${m && m.type === 'time' ? `${dur(got)} of ${dur(tgt)} today` : 'Running'}</span><button class="pill-btn pink" data-act="timer-stop">Stop</button></div></section>`;
  }
  const nm = nowMinOfDay(), t = today();
  const next = b.today.find(r => r.time && E.dueMs(t, r.time) >= n);
  if (next) {
    return `<section class="now" aria-label="Next up">
      <div class="lcd"><div class="lb">Next</div><div class="dg num">${next.time}</div></div>${right}
      <div class="nx" data-act="open-rem" data-id="${next.id}"><span class="t"><b>${esc(next.title)}</b></span><span class="k">${inWords(E.dueMs(t, next.time) - n)}</span></div></section>`;
  }
  const late = b.today.find(r => r.time && E.dueMs(t, r.time) < n);
  return `<section class="now" aria-label="Clock">
    <div class="lcd"><div class="lb">Now</div><div class="dg num" id="lcd">${clock(n)}</div></div>${right}
    <div class="nx"><span class="t">${late ? `<b>${esc(late.title)}</b> was due at ${late.time}` : b.today.length ? `${b.today.length} untimed thing${b.today.length === 1 ? '' : 's'} today` : 'Nothing timed left today'}</span>${late ? `<button class="pill-btn pink" data-act="done-rem" data-id="${late.id}">Done</button>` : ''}</div></section>`;
}

function calTile(t) {
  const d = E.keyDate(t), y = d.getFullYear(), m = d.getMonth();
  const first = new Date(y, m, 1), lead = (first.getDay() + 6) % 7, days = new Date(y, m + 1, 0).getDate();
  const open = {}; for (const r of st.reminders) if (!r.done && r.date) { const k = E.dueOf(r) < t ? 'miss' : 'dot'; const key = r.date; if (!open[key] || k === 'miss') open[key] = k; }
  let cells = '';
  for (let i = 0; i < lead; i++) cells += '<span></span>';
  for (let i = 1; i <= days; i++) {
    const k = E.fmtKey(new Date(y, m, i));
    cells += `<button data-act="day" data-k="${k}" class="${k === t ? 'on' : ''} ${k < t ? 'past' : ''} ${open[k] ? 'dot ' + (open[k] === 'miss' ? 'miss' : '') : ''}" aria-label="${shortDate(k)}">${i}</button>`;
  }
  return `<div class="cal"><div class="hd"><span>${E.MONTHS[m].toUpperCase()}</span><span>${y}</span></div>
    <div class="wk"><span>M</span><span>T</span><span>W</span><span>T</span><span>F</span><span>S</span><span>S</span></div><div class="gr">${cells}</div></div>`;
}

function missedCard(list, t) {
  const loud = list.filter(r => E.diffDays(E.dueOf(r), t) >= 3);
  const oldest = list[0], od = E.diffDays(E.dueOf(oldest), t);
  return `<section class="card missed"><h2>Missed <span class="c">${list.length}</span></h2>
    ${loud.length ? `<div class="alarm" role="alert">${loud.length === 1 ? `“${esc(loud[0].title)}” is ${E.diffDays(E.dueOf(loud[0]), t)} days overdue.` : `${loud.length} things are 3+ days overdue. The oldest is “${esc(oldest.title)}”, ${od} days.`} Every day it stays open costs more points.</div>` : ''}
    <div class="rows">${list.map(r => row(r, 'missed')).join('')}</div></section>`;
}

function grouped(list, long) {
  let out = '', last = null;
  for (const r of list) {
    if (r.date !== last) { if (last) out += '</div>'; out += `<div class="daylabel">${dayWord(r.date)}</div><div class="rows">`; last = r.date; }
    out += row(r, 'week');
  }
  return out + (last ? '</div>' : '');
}

function row(r, where) {
  const t = today(), bits = [];
  if (where === 'missed') {
    const od = E.diffDays(E.dueOf(r), t);
    bits.push(`<span class="late">${od === 1 ? 'Yesterday' : od + ' days late'}</span>`);
    if (r.firstDue && r.date !== r.firstDue) bits.push(`moved to ${dayWord(r.date)}`);
  }
  if (r.time) bits.push(r.time);
  if (r.repeat) bits.push(E.describeRepeat(r.repeat));
  if (r.prio) bits.push('<span class="pr">!</span>');
  if (r.size && r.size !== 's') bits.push(r.size === 'm' ? 'medium' : 'big');
  if (where === 'done' && r.doneAt) bits.push('done ' + clock(r.doneAt));
  return `<div class="row ${r.done ? 'done' : ''}" data-act="open-rem" data-id="${r.id}" data-where="${where}">
    <button class="chk ${r.done ? 'on' : ''}" data-act="${r.done ? 'undone-rem' : 'done-rem'}" data-id="${r.id}" aria-label="${r.done ? 'Mark not done' : 'Mark done'}">${ICON.check}</button>
    <div class="tx"><div class="tt">${esc(r.title)}</div>${bits.length ? `<div class="mt">${bits.join(' · ')}</div>` : ''}</div></div>`;
}

function mustsCard(t, R) {
  const list = st.musts.filter(m => !m.deleted);
  const rows = list.map(m => {
    const s = E.mustStatus(st, m, t), info = R.musts.find(x => x.id === m.id);
    const running = st.timer && st.timer.id === m.id;
    const runMin = running ? (now() - st.timer.start) / 60000 : 0;
    let sub, frac = 0;
    if (s === 'off') sub = m.paused ? 'Paused' : st.emergency[t] ? 'Emergency day' : `Not today · ${E.describeRepeat(m.sched)}`;
    else if (m.type === 'time') {
      const got = E.logged(m, t) + runMin, tgt = E.targetOn(st, m, t); frac = Math.min(1, got / tgt);
      const owed = E.owedOn(st, m, t);
      sub = `${dur(got)} of ${dur(tgt)}${owed ? ` <span class="req">(${dur(owed)} owed)</span>` : ''}`;
    } else { frac = E.logged(m, t) >= 1 ? 1 : 0; sub = frac ? '<span class="ok">Done today</span>' : 'Not done yet'; }
    if (m.sched.kind === 'week' && s !== 'off') {
      const wd = E.weekDone(st, m, t);
      sub += ` · ${wd} of ${m.sched.n} this week` + (s === 'required' && frac < 1 ? ' · <span class="req">needed today</span>' : s === 'optional' && frac < 1 ? ' · optional today' : '');
    }
    const btn = s === 'off' ? '' : m.type === 'time'
      ? `<button class="play ${running ? 'on' : ''}" data-act="${running ? 'timer-stop' : 'timer-start'}" data-id="${m.id}" aria-label="${running ? 'Stop timer' : 'Start timer'}">${running ? ICON.stop : ICON.play}</button>`
      : `<button class="play tick ${frac ? 'on' : ''}" data-act="tick" data-id="${m.id}" aria-label="${frac ? 'Mark not done' : 'Mark done'}">${ICON.check}</button>`;
    return `<div class="must ${s === 'off' ? 'off' : ''}" data-act="open-must" data-id="${m.id}">
      <div><div class="tt">${esc(m.title)}${m.prio ? ' <span class="red">!</span>' : ''}</div><div class="mt">${sub}</div></div>${btn}
      ${s !== 'off' ? `<div class="track thin"><div class="fill ${frac ? '' : 'zero'}" style="width:${Math.round(frac * 100)}%"></div></div>` : ''}</div>`;
  });
  const order = (a, b) => (a.includes('must off') ? 1 : 0) - (b.includes('must off') ? 1 : 0);
  return `<section class="card" id="musts"><h2>Musts ${list.length ? `<span class="c">${list.length}</span>` : ''}<span class="sp"></span><button class="add" data-act="new-must">+ New</button></h2>
    ${list.length ? rows.sort(order).join('') : '<div class="empty">The things you want forced on you. Type “study 5h daily” or “gym 4x a week” below, or tap New.</div>'}</section>`;
}

/* ---------- swipe: right = done, left = tomorrow ---------- */
let swipedAt = 0;
function bindSwipes() {
  document.querySelectorAll('#app .row').forEach(el => {
    if (el.classList.contains('done')) return;
    let x0 = null, y0 = 0, dx = 0, lock = null;
    el.addEventListener('touchstart', e => { if (e.target.closest('.chk')) return; x0 = e.touches[0].clientX; y0 = e.touches[0].clientY; dx = 0; lock = null; }, { passive: true });
    el.addEventListener('touchmove', e => {
      if (x0 == null) return;
      const mx = e.touches[0].clientX - x0, my = e.touches[0].clientY - y0;
      if (!lock) lock = Math.abs(mx) > 8 && Math.abs(mx) > Math.abs(my) ? 'x' : Math.abs(my) > 8 ? 'y' : null;
      if (lock !== 'x') return;
      dx = mx; el.classList.add('dragging'); el.style.transform = `translateX(${dx}px)`; el.style.opacity = String(1 - Math.min(.5, Math.abs(dx) / 300));
    }, { passive: true });
    el.addEventListener('touchend', () => {
      if (x0 == null) return; x0 = null; el.classList.remove('dragging');
      if (lock === 'x') swipedAt = Date.now();
      const id = el.dataset.id;
      if (dx > 80) { el.style.transform = 'translateX(110%)'; setTimeout(() => doneRem(id), 160); return; }
      if (dx < -80) {
        if (el.dataset.where === 'missed') { el.style.transform = ''; el.style.opacity = ''; toast('Missed things can’t be pushed. Finish it or delete it.'); return; }
        el.style.transform = 'translateX(-110%)'; setTimeout(() => moveRem(id, E.addDays(today(), 1), 'Moved to tomorrow'), 160); return;
      }
      el.style.transform = ''; el.style.opacity = '';
    });
  });
}

/* ---------- reminder actions ---------- */
const findR = id => st.reminders.find(r => r.id === id);
const findM = id => st.musts.find(m => m.id === id);
function doneRem(id) {
  const r = findR(id); if (!r || r.done) return;
  const t = today();
  commit(r.repeat ? `Done. Next: ${dayWord(E.nextDate(r.repeat, r.date, t))}` : 'Done', s => {
    const x = s.reminders.find(y => y.id === id); x.done = true; x.doneDay = t; x.doneAt = now();
    if (x.repeat) {
      const nx = { ...x, id: E.uid(), date: E.nextDate(x.repeat, x.date, t), done: false, doneDay: null, doneAt: null, firstDue: null, created: now(), sent: false, seq: 0 };
      x.repeat = null; x.series = true; s.reminders.push(nx);
      if (s.settings.ping !== 'off' && s.settings.autoSend) pendingPing = nx.id;
    }
  });
  firePending();
}
function undoneRem(id) {
  commit('Marked not done', s => {
    const x = s.reminders.find(y => y.id === id); if (!x) return;
    x.done = false; x.doneDay = null; x.doneAt = null;
  });
}
function moveRem(id, date, msg) {
  const t = today();
  commit(msg, s => {
    const x = s.reminders.find(y => y.id === id); if (!x) return;
    if (x.date && E.dueOf(x) < t && !x.firstDue) x.firstDue = x.date;
    x.date = date; x.seq = (x.seq || 0) + 1;
    if (x.firstDue && date && date <= x.firstDue) x.firstDue = null;
  });
}

/* ---------- pings ---------- */
let pendingPing = null;
function firePending() { if (!pendingPing) return; const id = pendingPing; pendingPing = null; const r = findR(id); if (r) setTimeout(() => sendPing(r, true), 350); }
function sendPing(r, auto) {
  const S = st.settings;
  if (!r.date) { if (!auto) toast('Give it a date first, then it can ping you.'); return; }
  if (S.ping === 'shortcut') {
    const payload = JSON.stringify({ title: r.title, due: `${r.date} ${r.time || S.alertAt}` });
    commit(null, s => { const x = s.reminders.find(y => y.id === r.id); if (x) x.sent = true; }, { undo: false, keepSheet: true });
    location.href = `shortcuts://run-shortcut?name=${encodeURIComponent(S.shortcut || 'Karle')}&input=text&text=${encodeURIComponent(payload)}`;
  } else if (S.ping === 'calendar') {
    const blob = new Blob([E.icsFor(r, S.alertAt, now())], { type: 'text/calendar' });
    const url = URL.createObjectURL(blob), a = document.createElement('a');
    a.href = url; if (!/iP(hone|ad|od)/.test(navigator.userAgent)) a.download = `karle-${r.id}.ics`;
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 60000);
    commit(null, s => { const x = s.reminders.find(y => y.id === r.id); if (x) x.sent = true; }, { undo: false, keepSheet: true });
  }
}

/* ---------- dump box ---------- */
function drawDock() {
  $('#dock').innerHTML = `<div class="in"><div class="pv" id="pv"></div>
    <form id="dump" autocomplete="off"><input id="dumpIn" enterkeyhint="done" placeholder="Remind me to…" aria-label="Add anything"><button class="go" type="submit" aria-label="Add">${ICON.plus}</button></form></div>`;
  const inp = $('#dumpIn');
  inp.addEventListener('input', () => { $('#pv').innerHTML = preview(inp.value); });
  $('#dump').addEventListener('submit', e => { e.preventDefault(); addFromDump(inp.value); inp.value = ''; $('#pv').innerHTML = ''; });
}
function preview(v) {
  if (!v.trim()) return '';
  const p = E.parse(v, now());
  if (p.kind === 'must') return `Must: <b>${esc(p.title)}</b> · ${p.type === 'time' ? dur(p.target) + ' · ' : ''}${E.describeRepeat(p.sched)}`;
  if (!p.title) return 'Type what to remember';
  return `<b>${esc(p.title)}</b> · ${p.date ? dayWord(p.date) : 'Anytime'}${p.time ? ' ' + p.time : ''}${p.repeat ? ' · ' + E.describeRepeat(p.repeat) : ''}${p.prio ? ' · !' : ''}`;
}
function addFromDump(v) {
  if (!v.trim()) return;
  const p = E.parse(v, now());
  if (p.kind === 'must') {
    const m = { id: E.uid(), title: p.title, type: p.type, target: p.target || 60, sched: p.sched, carry: p.type === 'time', prio: p.prio, size: p.size || 'm', created: today(), log: {} };
    commit(`New must: ${m.title}`, s => { s.musts.push(m); });
    return;
  }
  if (!p.title) { toast('Type what to remember'); return; }
  const r = { id: E.uid(), title: p.title, date: p.date, time: p.time, repeat: p.repeat, prio: p.prio, size: p.size || 's', done: false, created: now(), seq: 0 };
  commit(`Added to ${r.date ? dayWord(r.date) : 'Anytime'}`, s => { s.reminders.push(r); });
  if (r.date && st.settings.ping !== 'off' && st.settings.autoSend) { pendingPing = r.id; firePending(); }
}

/* ---------- timer ---------- */
function timerStart(id) {
  const t = now();
  commit('Timer started', s => {
    if (s.timer) logTimer(s, t);
    s.timer = { id, start: t, seen: t };
  }, { undo: false });
  startTick();
}
function logTimer(s, end) {
  const m = s.musts.find(x => x.id === s.timer.id), mins = Math.round((end - s.timer.start) / 60000);
  if (m && mins > 0) { const k = E.dayKey(s.timer.start); m.log[k] = (m.log[k] || 0) + mins; }
  s.timer = null;
  return mins;
}
function timerStop(end) {
  if (!st.timer) return;
  let mins = 0;
  commit(null, s => { mins = logTimer(s, end || now()); });
  toast(mins > 0 ? `Logged ${dur(mins)}` : 'Under a minute, nothing logged', mins > 0);
}
// Stops the clock while you're away: when you come back after 20+ minutes, Karle asks.
let awaySeen = null;
function checkAway() {
  if (!st.timer || $('#sheet .away')) return;
  const gap = now() - (st.timer.seen || st.timer.start);
  if (gap > 20 * 60000) {
    awaySeen = st.timer.seen || st.timer.start;
    const m = findM(st.timer.id);
    openSheet(() => `<div class="away"></div><h3>Still going?</h3>
      <div class="sub">${esc(m ? m.title : 'Timer')} has been running ${dur((now() - st.timer.start) / 60000)}. You left Karle ${dur(gap / 60000)} ago.</div>
      <div class="btns" style="flex-direction:column">
        <button class="btn main" data-act="away-yes">Yes, count all of it</button>
        <button class="btn ghost" data-act="away-left">No, stop it when I left</button>
        <button class="btn danger" data-act="away-drop">Throw this session away</button></div>`);
  } else if (st.timer) { st.timer.seen = now(); save(); }
}

/* ---------- sheets ---------- */
let sheetRedraw = null;
function openSheet(build) {
  const draw = () => {
    if (!$('#sheet .sh')) $('#sheet').innerHTML = `<div class="scrim" data-act="close"></div><div class="sh" role="dialog" aria-modal="true"><div class="wrap"></div></div>`;
    $('#sheet .wrap').innerHTML = `<div class="grab"></div>` + build();
  };
  sheetRedraw = draw; draw(); $('#toast').hidden = true;
  document.body.style.overflow = 'hidden';
}
function closeSheet() { $('#sheet').innerHTML = ''; sheetRedraw = null; document.body.style.overflow = ''; }

const seg = (name, val, opts) => `<div class="seg" data-name="${name}">${opts.map(([v, l]) => `<button type="button" data-act="seg" data-v="${v}" class="${String(v) === String(val) ? 'on' : ''}">${l}</button>`).join('')}</div>`;
const sw = (name, on, title, sub) => `<div class="tog"><div class="tx"><b>${title}</b>${sub ? `<span>${sub}</span>` : ''}</div><button type="button" class="sw ${on ? 'on' : ''}" data-act="sw" data-name="${name}" role="switch" aria-checked="${!!on}" aria-label="${esc(title)}"></button></div>`;
const dayChips = (name, days) => `<div class="chips" data-name="${name}">${[1, 2, 3, 4, 5, 6, 0].map(d => `<button type="button" class="chip ${days.includes(d) ? 'on' : ''}" data-act="chip" data-v="${d}">${E.DAYS[d]}</button>`).join('')}</div>`;
const segVal = name => { const b = $(`#sheet .seg[data-name="${name}"] button.on`); return b ? b.dataset.v : null; };
const swVal = name => !!$(`#sheet .sw[data-name="${name}"].on`);
const chipVals = name => [...document.querySelectorAll(`#sheet .chips[data-name="${name}"] .chip.on`)].map(b => +b.dataset.v);
const val = id => { const el = $('#sheet #' + id); return el ? el.value : ''; };
function syncWhen() {
  document.querySelectorAll('#sheet [data-when]').forEach(el => {
    const [n, vs] = el.dataset.when.split('='); const v = segVal(n);
    el.hidden = !vs.split('|').includes(v);
  });
}

/* reminder sheet */
function openRem(id) {
  const r0 = findR(id); if (!r0) return;
  openSheet(() => {
    const r = findR(id); if (!r) return '<h3>Gone</h3><div class="sub">This reminder was deleted.</div>';
    const t = today(), missed = r.date && !r.done && E.dueOf(r) < t;
    const rk = r.repeat ? r.repeat.kind : 'none';
    const quick = [['Today', t], ['Tomorrow', E.addDays(t, 1)], ['Weekend', E.firstMatch({ kind: 'days', days: [6] }, E.addDays(t, 1))], ['Next week', E.addDays(E.weekStart(t), 7)], ['No date', '']];
    return `<h3>${r.done ? 'Done' : missed ? 'Missed' : 'Reminder'}</h3>
      ${missed ? `<div class="note red">Due ${dayWord(E.dueOf(r))}. Moving it won’t stop the penalty; only finishing it does.</div>` : ''}
      <div class="field"><label for="f-title">What</label><input class="inp" id="f-title" value="${esc(r.title)}" maxlength="140"></div>
      <div class="two"><div class="field"><label for="f-date">Day</label><input class="inp" type="date" id="f-date" value="${r.date || ''}"></div>
        <div class="field"><label for="f-time">Time</label><input class="inp" type="time" id="f-time" value="${r.time || ''}"></div></div>
      <div class="chips">${quick.map(([l, k]) => `<button type="button" class="chip" data-act="quick-date" data-k="${k}">${l}</button>`).join('')}</div>
      <div class="field"><span class="lbl">Repeats</span>${seg('rep', rk, [['none', 'Once'], ['daily', 'Daily'], ['days', 'Days'], ['weekly', 'Weekly'], ['monthly', 'Monthly']])}</div>
      <div data-when="rep=days" ${rk === 'days' ? '' : 'hidden'}>${dayChips('rdays', r.repeat && r.repeat.days ? r.repeat.days : [E.weekday(r.date || t)])}</div>
      <div class="field"><span class="lbl">How big</span>${seg('size', r.size || 's', [['s', 'Small · 2'], ['m', 'Medium · 6'], ['b', 'Big · 15']])}</div>
      ${sw('prio', r.prio, 'Important', 'Worth 1.5× points')}
      <div class="btns"><button class="btn main" data-act="save-rem" data-id="${r.id}">Save</button>
        <button class="btn" data-act="${r.done ? 'undone-rem' : 'done-rem'}" data-id="${r.id}">${r.done ? 'Not done' : 'Done'}</button></div>
      ${!r.done && r.date === t && !missed ? `<div class="btns"><button class="btn ghost" data-act="snooze" data-id="${r.id}" data-m="60">+1 hour</button><button class="btn ghost" data-act="snooze" data-id="${r.id}" data-m="tonight">Tonight</button><button class="btn ghost" data-act="snooze" data-id="${r.id}" data-m="tmrw">Tomorrow</button></div>` : ''}
      ${st.settings.ping !== 'off' && r.date && !r.done ? `<button class="btn ghost" data-act="ping" data-id="${r.id}">${r.sent ? 'Send the ping again' : 'Send a ping'} (${st.settings.ping === 'shortcut' ? 'Reminders app' : 'Calendar'})</button>` : ''}
      <button class="btn danger" data-act="del-rem" data-id="${r.id}">Delete</button>`;
  });
}
function saveRem(id) {
  const title = val('f-title').trim(); if (!title) { toast('It needs a name'); return; }
  let date = val('f-date') || null, time = val('f-time') || null;
  const rk = segVal('rep'); let repeat = null;
  if (rk === 'days') { const d = chipVals('rdays'); repeat = d.length ? { kind: 'days', days: d.sort() } : null; }
  else if (rk !== 'none') repeat = { kind: rk };
  if (repeat && !date) date = E.firstMatch(repeat, today());
  if (time && !date) date = today();
  const t = today();
  commit('Saved', s => {
    const x = s.reminders.find(y => y.id === id); if (!x) return;
    if (x.date !== date) { if (x.date && !x.done && E.dueOf(x) < t && !x.firstDue) x.firstDue = x.date; if (x.firstDue && (!date || date <= x.firstDue)) x.firstDue = null; }
    Object.assign(x, { title, date, time: date ? time : null, repeat, size: segVal('size') || 's', prio: swVal('prio'), seq: (x.seq || 0) + 1 });
  });
  closeSheet();
}

/* must sheet */
function openMust(id) {
  openSheet(() => {
    const m = id ? findM(id) : { title: '', type: 'time', target: 60, sched: { kind: 'daily' }, carry: true, prio: false, size: 'm', log: {} };
    if (!m) return '<h3>Gone</h3>';
    const t = today(), s = id ? E.mustStatus(st, m, t) : 'off';
    const sk = m.sched.kind, n = m.sched.n || 3;
    return `<h3>${id ? 'Must' : 'New must'}</h3><div class="sub">Something Karle should push you to do, and score you on.</div>
      <div class="field"><label for="f-title">What</label><input class="inp" id="f-title" value="${esc(m.title)}" placeholder="Study, gym, read, run…" maxlength="60"></div>
      <div class="field"><span class="lbl">Track it by</span>${seg('type', m.type, [['time', 'Time (with a timer)'], ['check', 'Just done / not done']])}</div>
      <div class="field" data-when="type=time" ${m.type === 'time' ? '' : 'hidden'}><span class="lbl">Target each time</span>
        <div class="stepper"><button type="button" data-act="step" data-d="-15">−</button><div class="val num" id="f-target" data-v="${m.target || 60}">${dur(m.target || 60)}</div><button type="button" data-act="step" data-d="15">+</button></div></div>
      <div class="field" data-when="type=check" ${m.type === 'check' ? '' : 'hidden'}><span class="lbl">How big</span>${seg('size', m.size || 'm', [['s', 'Small · 2'], ['m', 'Medium · 6'], ['b', 'Big · 15']])}</div>
      <div class="field"><span class="lbl">When</span>${seg('sk', sk, [['daily', 'Every day'], ['days', 'Some days'], ['week', 'Times a week']])}</div>
      <div data-when="sk=days" ${sk === 'days' ? '' : 'hidden'}>${dayChips('mdays', m.sched.days || [1, 2, 3, 4, 5])}</div>
      <div class="field" data-when="sk=week" ${sk === 'week' ? '' : 'hidden'}>
        <div class="stepper"><button type="button" data-act="stepn" data-d="-1">−</button><div class="val num" id="f-n" data-v="${n}">${n}× a week</div><button type="button" data-act="stepn" data-d="1">+</button></div>
        <div class="note">Any day counts. It only becomes required when the days left in the week run out.</div></div>
      <div data-when="type=time" ${m.type === 'time' ? '' : 'hidden'}>${sw('carry', m.carry, 'Carry unfinished time', 'Missed minutes get added to the next day, up to one day’s target')}</div>
      ${sw('prio', m.prio, 'Important', 'Worth 1.5× points')}
      ${id ? sw('paused', m.paused, 'Pause it', 'Stops it counting until you turn this off') : ''}
      ${id && s !== 'off' ? (m.type === 'time'
        ? `<div class="field"><span class="lbl">Today’s time</span><div class="stepper"><button type="button" data-act="adj" data-id="${m.id}" data-d="-15">−</button><div class="val num">${dur(E.logged(m, t))}</div><button type="button" data-act="adj" data-id="${m.id}" data-d="15">+</button></div><div class="note">Forgot the timer? Add the time here.</div></div>`
        : '') : ''}
      <div class="btns"><button class="btn main" data-act="save-must" data-id="${id || ''}">${id ? 'Save' : 'Add must'}</button>${id ? '' : '<button class="btn ghost" data-act="close">Cancel</button>'}</div>
      ${id ? `<button class="btn danger" data-act="del-must" data-id="${m.id}">Delete</button><div class="note">Deleting keeps your past scores as they were.</div>` : ''}`;
  });
}
function saveMust(id) {
  const title = val('f-title').trim(); if (!title) { toast('Give it a name'); return; }
  const type = segVal('type'), sk = segVal('sk');
  let sched = { kind: 'daily' };
  if (sk === 'days') { const d = chipVals('mdays'); if (!d.length) { toast('Pick at least one day'); return; } sched = { kind: 'days', days: d.sort() }; }
  if (sk === 'week') sched = { kind: 'week', n: +$('#f-n').dataset.v };
  const target = +$('#f-target').dataset.v;
  const data = { title, type, target, sched, carry: swVal('carry'), prio: swVal('prio'), size: segVal('size') || 'm' };
  const paused = id ? swVal('paused') : false;
  if (id) commit('Saved', s => { const m = s.musts.find(x => x.id === id); if (!m) return; Object.assign(m, data); if (paused && !m.paused) m.pausedOn = today(); m.paused = paused; if (!paused) m.pausedOn = null; });
  else commit(`New must: ${title}`, s => { s.musts.push({ id: E.uid(), ...data, created: today(), log: {} }); });
  closeSheet();
}

/* week sheet */
function openWeek() {
  openSheet(() => {
    const t = today(), ws = E.weekStart(t), rv = revealReady();
    const em = E.emergencyInWeek(st, t);
    const bars = [0, 1, 2, 3, 4, 5, 6].map(i => {
      const k = E.addDays(ws, i); let sc = null, label = '';
      if (k < t) { const r = st.results[k]; sc = r ? r.score : null; label = r && r.emergency ? 'E' : sc == null ? '–' : num(sc); }
      else if (k === t) { if (st.emergency[t]) label = 'E'; else if (rv) { sc = E.scoreDay(st, t).score; label = sc == null ? '–' : num(sc); } else label = '?'; }
      else label = '';
      const h = sc == null ? 0 : Math.abs(sc);
      return `<div class="b ${k === t ? 'today' : ''}"><span class="s num">${label}</span><div class="tube"><i class="${sc < 0 ? 'neg' : ''}" style="height:${h}%"></i></div>${E.DAYS[E.weekday(k)][0]}</div>`;
    }).join('');
    const hist = [];
    for (let i = 1; i <= 4; i++) { const w0 = E.addDays(ws, -7 * i); if (w0 < E.weekStart(st.created)) break; const w = E.weekStats(st, w0, t); hist.push(`<div class="h"><span>${shortDate(w0)} – ${shortDate(E.addDays(w0, 6))}</span><span class="num">${w.avg == null ? '–' : num(w.avg)}</span></div>`); }
    const lastWs = E.addDays(ws, -7), hasLast = lastWs >= E.weekStart(st.created) && E.weekStats(st, lastWs, t).scoredDays;
    return `<h3>This week</h3><div class="sub">${shortDate(ws)} – ${shortDate(E.addDays(ws, 6))} · each day scored out of 100</div>
      <div class="bars7">${bars}</div>
      <button class="btn ${rv ? 'main' : ''}" data-act="reveal-today" ${rv ? '' : 'disabled'}>${st.emergency[t] ? 'Today is an emergency day' : rv ? 'See tonight’s score' : `Tonight’s score shows at ${st.settings.reveal}`}</button>
      ${hasLast ? '<button class="btn" data-act="wrapped-last">Last week’s Wrapped</button>' : ''}
      <div class="field"><span class="lbl">Emergency day</span>
        ${st.emergency[t] ? `<div class="note">Today isn’t scored and your musts are off.</div><button class="btn ghost" data-act="emergency-off">Cancel the emergency day</button>`
          : em ? `<div class="note">Used on ${dayWord(em)}. One per week, no stacking.</div>`
          : `<div class="note">Once a week, for real emergencies. Today won’t be scored and musts switch off. Missed reminders still count.</div><button class="btn danger" data-act="emergency">Use it today</button>`}</div>
      ${hist.length ? `<div class="field"><span class="lbl">Past weeks</span><div class="hist">${hist.join('')}</div></div>` : ''}`;
  });
}
/* day sheet (from the calendar) */
function openDay(k) {
  openSheet(() => {
    const t = today();
    const list = st.reminders.filter(r => r.date === k).sort((a, b) => (a.time || '99').localeCompare(b.time || '99'));
    const res = k < t ? st.results[k] : null;
    return `<h3>${dayWord(k)}</h3><div class="sub">${shortDate(k)}${res ? ` · scored ${res.emergency ? 'nothing (emergency day)' : res.score == null ? '–' : num(res.score)}` : ''}</div>
      ${list.length ? `<div class="rows">${list.map(r => row(r, r.done ? 'done' : E.dueOf(r) < t ? 'missed' : 'week')).join('')}</div>` : '<div class="empty">Nothing on this day.</div>'}
      <form id="dayadd" data-k="${k}" class="two" style="grid-template-columns:minmax(0,1fr) auto"><input class="inp" id="f-dayadd" placeholder="Add something for this day" autocomplete="off"><button class="btn main" type="submit" style="flex:none;padding:0 18px">Add</button></form>`;
  });
}
document.addEventListener('submit', e => {
  if (e.target.id !== 'dayadd') return;
  e.preventDefault(); const k = e.target.dataset.k, v = $('#f-dayadd').value.trim(); if (!v) return;
  const p = E.parse(v, now());
  const r = { id: E.uid(), title: p.title || v, date: k < today() ? today() : k, time: p.time, repeat: p.repeat, prio: p.prio, size: p.size || 's', done: false, created: now(), seq: 0 };
  commit(`Added to ${dayWord(r.date)}`, s => { s.reminders.push(r); });
});

/* settings */
function openSettings() {
  openSheet(() => {
    const S = st.settings;
    return `<h3>Settings</h3>
      <div class="field"><label for="f-name">Your name</label><input class="inp" id="f-name" value="${esc(S.name || '')}" placeholder="For the greeting" maxlength="24"></div>
      <div class="field"><span class="lbl">How Karle pings you</span>${seg('ping', S.ping, [['off', 'Off'], ['shortcut', 'Reminders app'], ['calendar', 'Calendar']])}
        <div class="note" data-when="ping=off" ${S.ping === 'off' ? '' : 'hidden'}>A web app can’t send its own notifications on iPhone. Pick one of the other two so you actually get pinged.</div></div>
      <div data-when="ping=shortcut" ${S.ping === 'shortcut' ? '' : 'hidden'} style="display:flex;flex-direction:column;gap:12px">
        <div class="note">Every dated reminder gets copied into Apple Reminders, which pings you on time. Set up once:</div>
        <ol class="steps">
          <li>Open the <b>Shortcuts</b> app, tap <b>+</b>, name it <code>${esc(S.shortcut || 'Karle')}</code>.</li>
          <li>Add <b>Get Dictionary from Input</b> (input: Shortcut Input).</li>
          <li>Add <b>Get Dictionary Value</b> for key <code>due</code>, then <b>Get Dates from Input</b> on that value.</li>
          <li>Add <b>Get Dictionary Value</b> for key <code>title</code>.</li>
          <li>Add <b>Add New Reminder</b>: title = the <code>title</code> value, turn on <b>Alert</b> and set it to the <b>Dates</b>.</li>
        </ol>
        <div class="field"><label for="f-sc">Shortcut name</label><input class="inp" id="f-sc" value="${esc(S.shortcut || 'Karle')}"></div>
        <button class="btn" data-act="test-ping">Send a test reminder</button>
      </div>
      <div data-when="ping=calendar" ${S.ping === 'calendar' ? '' : 'hidden'}><div class="note">Each dated reminder opens as a Calendar event with an alert. Tap <b>Add</b> each time.</div></div>
      <div data-when="ping=shortcut|calendar" ${S.ping !== 'off' ? '' : 'hidden'}>${sw('auto', S.autoSend, 'Send automatically', 'As soon as you add a dated reminder')}</div>
      <div class="two"><div class="field"><label for="f-alert">Ping time if no time given</label><input class="inp" type="time" id="f-alert" value="${S.alertAt}"></div>
        <div class="field"><label for="f-rev">Score shows at</label><input class="inp" type="time" id="f-rev" value="${S.reveal}"></div></div>
      <button class="btn main" data-act="save-settings">Save settings</button>
      <div class="field"><span class="lbl">How to type</span><div class="cheat">
        <code>call mom fri 6pm</code><span>Friday at 18:00</span>
        <code>pay fee 15 nov</code><span>a date</span>
        <code>buy charger</code><span>no date, goes to Anytime</span>
        <code>water plants every sun</code><span>repeats</span>
        <code>! submit form tmrw</code><span>! = important, 1.5× points</span>
        <code>+s +m +b</code><span>small, medium, big (2, 6, 15 pts)</span>
        <code>study 5h daily</code><span>a must with a timer</span>
        <code>gym 4x a week</code><span>a must, any 4 days</span>
        <code>must stretch</code><span>a daily must</span></div>
        <div class="note">Swipe a reminder right to finish it, left to push it to tomorrow.</div></div>
      <div class="field"><span class="lbl">Scoring</span><div class="note">Each day: points earned ÷ points planned, out of 100, never below −50. Reminders are worth 2, 6 or 15. Timer musts earn 1 point per 10 minutes. A missed reminder costs 25% more for every day it stays open; finishing it late gives back half. Score shows once at night. Wrapped arrives every Monday.</div></div>
      <div class="field"><span class="lbl">Backup</span><div class="btns"><button class="btn" data-act="backup">Copy backup</button><button class="btn" data-act="restore-open">Restore</button></div>
        <div id="restore" hidden style="display:flex;flex-direction:column;gap:10px"><textarea class="inp" id="f-restore" placeholder="Paste a backup here"></textarea><button class="btn main" data-act="restore">Restore this backup</button></div></div>
      <button class="btn danger" data-act="erase">Erase everything</button>
      <div class="note" style="text-align:center">Karle 3.0</div>`;
  });
}
function saveSettings() {
  commit('Settings saved', s => {
    Object.assign(s.settings, { name: val('f-name').trim(), ping: segVal('ping'), shortcut: val('f-sc').trim() || s.settings.shortcut || 'Karle', autoSend: swVal('auto'), alertAt: val('f-alert') || '09:00', reveal: val('f-rev') || '21:30' });
  }, { undo: false });
  closeSheet();
}

/* first run */
function openWelcome() {
  openSheet(() => `<h3>Karle</h3><div class="sub">Throw things in. It sorts them and keeps at you.</div>
    <div class="cheat"><code>return book tomorrow</code><span>a reminder</span><code>call mom fri 6pm</code><span>with a time</span><code>gym 4x a week</code><span>a must it forces on you</span></div>
    <div class="field"><label for="f-name">Your name</label><input class="inp" id="f-name" placeholder="Optional" maxlength="24"></div>
    <div class="field"><span class="lbl">How should it ping you?</span>${seg('ping', 'off', [['off', 'Decide later'], ['shortcut', 'Reminders app'], ['calendar', 'Calendar']])}
    <div class="note">iPhone doesn’t let web apps send their own notifications. Reminders app is the smoothest; the setup steps are in Settings.</div></div>
    <button class="btn main" data-act="welcome-done">Start</button>`);
}

/* ---------- reveal & Wrapped ---------- */
function revealReady() { const t = today(); return !st.emergency[t] && (nowMinOfDay() >= E.toMin(st.settings.reveal) || nowMinOfDay() < E.ROLL_H * 60); }
function verdict(s) {
  if (s >= 95) return 'That’s how it’s done.'; if (s >= 80) return 'Good. Not perfect.'; if (s >= 60) return 'Decent. You left points on the table.';
  if (s >= 40) return 'Half a day’s work.'; if (s >= 0) return 'Weak.'; return 'You went backwards.';
}
function showReveal(d) {
  const t = today(), live = d === t;
  const r = live ? E.scoreDay(st, d) : st.results[d];
  if (!r || r.score == null) return false;
  const L = [];
  const due = live ? r.rem.due : r.due, done = live ? r.rem.done : r.done, late = live ? r.rem.late.length : r.late, pen = live ? r.penalty : r.penalty;
  if (due) L.push(['Reminders', `${done} of ${due}`]);
  if (late) L.push(['Overdue cleared', `${late}, half points`]);
  for (const m of r.musts) {
    if (m.status === 'required') L.push([m.title, m.type === 'time' ? `${dur(m.got)} of ${dur(m.target)}` : m.frac >= 1 ? 'done' : '<b class="red">skipped</b>']);
    else if (m.frac >= 1) L.push([m.title, 'extra, bonus']);
  }
  if (pen) L.push(['Overdue penalty', `<b class="red">−${Math.round(pen * 10) / 10} pts</b>`]);
  const worst = (r.costs || []).slice().sort((a, b) => b[1] - a[1])[0];
  if (worst && worst[1] >= 1) L.push(['Cost you most', `<b class="red">${esc(worst[0])}</b>`]);
  const C = 2 * Math.PI * 44;
  $('#full').innerHTML = `<div class="fs reveal" data-act="full-close" role="dialog" aria-label="Score">
    <div class="date">${dayWord(d)}, ${shortDate(d)}</div>
    <div class="dial"><svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="44" fill="none" stroke="${r.score < 0 ? 'var(--pink-ink)' : 'var(--pink)'}" stroke-width="5" stroke-linecap="round" stroke-dasharray="0 ${C}" id="arc"/></svg>
      <div class="face"><div class="n num" id="rv">0</div><div class="o">out of 100</div></div></div>
    <div class="verdict">${verdict(r.score)}</div>
    <div class="lines">${L.map(([a, b]) => `<div><span>${esc(a)}</span><b>${b}</b></div>`).join('') || '<div><span>Nothing much happened.</span></div>'}</div>
    <div class="tap">Tap anywhere to close</div></div>`;
  const el = $('#rv'), arc = $('#arc'), target = r.score, t0 = performance.now(), D = 1400;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const step = ts => {
    if (!el.isConnected) return;
    const k = reduce ? 1 : Math.min(1, (ts - t0) / D), e = 1 - Math.pow(1 - k, 3), v = Math.round(target * e);
    el.textContent = num(v); el.classList.toggle('neg', v < 0);
    arc.setAttribute('stroke-dasharray', `${Math.abs(v) / 100 * C} ${C}`);
    if (k < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
  commit(null, s => { if (!s.seen.reveal || d > s.seen.reveal) s.seen.reveal = d; }, { undo: false, keepSheet: true });
  return true;
}

let W = null;
function showWrapped(ws) {
  const t = today(), { w, p, title, line } = E.wrappedFor(st, ws, t);
  const delta = (cur, prev, fmt = v => v, unit = '') => {
    if (prev == null) return '<div class="delta flat">No last week to compare</div>';
    const dv = Math.round((cur - prev) * 10) / 10;
    if (!dv) return '<div class="delta flat">Same as last week</div>';
    return `<div class="delta ${dv > 0 ? 'up' : 'down'}">${dv > 0 ? '▲' : '▼'} ${fmt(Math.abs(dv))}${unit} vs last week</div>`;
  };
  const cards = [];
  cards.push(`<div class="k">${shortDate(ws)} – ${shortDate(E.addDays(ws, 6))}</div><div class="big">${esc(title)}</div><div class="p">${esc(line)}</div><div class="p dim">Tap to go on.</div>`);
  const bars = w.days.map(x => {
    const h = x.score == null ? 0 : Math.abs(x.score);
    return `<div class="b ${w.best && x.day === w.best.day ? 'best' : ''} ${w.worst && x.day === w.worst.day && w.worst !== w.best ? 'worst' : ''}"><span class="s num">${x.emergency ? 'E' : x.score == null ? '–' : num(x.score)}</span><div class="tube"><i class="${x.score < 0 ? 'neg' : ''}" style="height:${h}%"></i></div>${E.DAYS[E.weekday(x.day)][0]}</div>`;
  }).join('');
  cards.push(`<div class="k">Average score</div><div class="big num">${w.avg == null ? '–' : num(w.avg)}<small> / 100</small></div>${w.avg != null ? delta(w.avg, p && p.avg, v => v, ' pts') : ''}<div class="bars7">${bars}</div>`);
  cards.push(`<div class="k">Reminders</div><div class="big num">${w.onTime}<small> of ${w.dueCount} on time</small></div>${delta(w.onTime, p && p.onTime)}
    <div class="p">${w.late.length} finished late. ${w.doneAll} done in total.</div>
    ${w.stillOpen.length ? `<div class="p"><b class="red">${w.stillOpen.length} still open.</b> Oldest: “${esc(w.stillOpen[0].title)}”, due ${shortDate(w.stillOpen[0].date)}.</div>` : '<div class="p">Nothing left hanging.</div>'}`);
  if (w.musts.length) {
    const pm = p ? Object.fromEntries(p.musts.map(m => [m.title, m])) : {};
    cards.push(`<div class="k">Musts</div><div class="big num">${w.hitAll}<small> of ${w.reqAll} hit</small></div>${delta(w.hitAll, p && p.reqAll ? p.hitAll : null)}
      ${w.musts.map(m => `<div class="mrow"><div class="l"><b>${esc(m.title)}</b><span>${m.type === 'time' ? dur(m.mins) + (pm[m.title] ? ` (${m.mins >= pm[m.title].mins ? '+' : '−'}${dur(Math.abs(m.mins - pm[m.title].mins))})` : '') + ' · ' : ''}${m.hit}/${m.req}${m.extra ? ` +${m.extra} extra` : ''}</span></div><div class="track thin"><div class="fill ${m.hit ? '' : 'zero'}" style="width:${m.req ? Math.round(m.hit / m.req * 100) : (m.extra ? 100 : 0)}%"></div></div></div>`).join('')}`);
  }
  cards.push(`<div class="k">Worst of the week</div>${w.worst ? `<div class="big">${E.DAYS_LONG[E.weekday(w.worst.day)]}<small class="num"> · ${num(w.worst.score)}</small></div>` : '<div class="big">None</div>'}
    ${w.costliest ? `<div class="p">What cost you most: <b class="red">${esc(w.costliest[0])}</b>, ${Math.round(w.costliest[1])} points across the week.</div>` : '<div class="p">Nothing cost you points.</div>'}`);
  cards.push(`<div class="k">That’s the week</div><div class="big">${esc(title)}</div>
    <div class="p">${w.avg != null ? `Averaged ${num(w.avg)}. ` : ''}${w.onTime} reminders on time, ${w.stillOpen.length} still open.${w.musts.length ? ` Musts hit ${w.hitAll} of ${w.reqAll}.` : ''}${w.minutes ? ` ${dur(w.minutes)} on timers.` : ''}</div><div class="p dim">The new week already started.</div>`);
  W = { cards, i: 0 };
  $('#full').innerHTML = `<div class="fs wrapped" role="dialog" aria-label="Week Wrapped"><div class="pg">${cards.map(() => '<i></i>').join('')}</div>
    <div class="zones"><button data-act="w-prev" aria-label="Previous"></button><button data-act="w-next" aria-label="Next"></button></div>
    <button class="round x" data-act="full-close" aria-label="Close">${ICON.x}</button><div class="wcard"></div></div>`;
  drawCard(true);
  commit(null, s => { if (!s.seen.wrapped || ws > s.seen.wrapped) s.seen.wrapped = ws; }, { undo: false, keepSheet: true });
}
function drawCard(first) {
  const root = $('.wrapped'); if (!root || !W) return;
  root.querySelectorAll('.pg i').forEach((b, k) => b.classList.toggle('on', k <= W.i));
  const c = root.querySelector('.wcard'); c.innerHTML = W.cards[W.i];
  if (!first && c.animate && !matchMedia('(prefers-reduced-motion: reduce)').matches) c.animate([{ opacity: 0, transform: 'translateY(12px)' }, { opacity: 1, transform: 'none' }], { duration: 240, easing: 'ease-out' });
}
const wNext = () => { if (!W) return; if (W.i < W.cards.length - 1) { W.i++; drawCard(); } else closeFull(); };
const wPrev = () => { if (W && W.i > 0) { W.i--; drawCard(); } };
function closeFull() { W = null; $('#full').innerHTML = ''; }
let wsx = null, wswiped = 0;
document.addEventListener('touchstart', e => { if (e.target.closest('.wrapped')) wsx = e.touches[0].clientX; }, { passive: true });
document.addEventListener('touchend', e => { if (wsx == null) return; const dx = e.changedTouches[0].clientX - wsx; wsx = null; if (Math.abs(dx) > 50) { wswiped = Date.now(); dx < 0 ? wNext() : wPrev(); } });

/* ---------- taps ---------- */
const remSheetOpen = btn => !!(btn.closest('#sheet') && $('#sheet #f-date'));
const armed = new Map();
function confirmTap(btn, label) {
  if (btn.classList.contains('armed')) return true;
  btn.classList.add('armed'); const old = btn.textContent; btn.textContent = label || 'Tap again to confirm';
  armed.set(btn, setTimeout(() => { btn.classList.remove('armed'); btn.textContent = old; }, 3000));
  return false;
}
const A = {
  undo, close: closeSheet, settings: openSettings, week: openWeek,
  'toggle-done'() { ui.showDone = !ui.showDone; render(); },
  'toggle-later'() { ui.showLater = true; render(); },
  'jump-musts'() { const el = $('#musts'); if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' }); },
  day(ds) { openDay(ds.k); },
  'open-rem'(ds) { if (Date.now() - swipedAt < 400) return; openRem(ds.id); },
  'done-rem'(ds, btn) { const inRem = remSheetOpen(btn); doneRem(ds.id); if (inRem) closeSheet(); },
  'undone-rem'(ds, btn) { const inRem = remSheetOpen(btn); undoneRem(ds.id); if (inRem) closeSheet(); },
  'save-rem'(ds) { saveRem(ds.id); },
  'quick-date'(ds) { $('#f-date').value = ds.k; if (!ds.k) $('#f-time').value = ''; },
  snooze(ds) {
    const r = findR(ds.id); if (!r) return; const t = today(); closeSheet();
    if (ds.m === 'tmrw') { moveRem(r.id, E.addDays(t, 1), 'Moved to tomorrow'); return; }
    let mins;
    if (ds.m === 'tonight') mins = Math.max(E.toMin('21:00'), nowMinOfDay() + 30);
    else { mins = Math.max(nowMinOfDay(), r.date === t && r.time ? E.toMin(r.time) : 0) + 60; }
    if (mins >= 24 * 60) { moveRem(r.id, E.addDays(t, 1), 'Moved to tomorrow'); return; }
    commit(`Moved to ${E.hhmm(mins)}`, s => { const x = s.reminders.find(y => y.id === r.id); x.date = t; x.time = E.hhmm(mins); x.seq = (x.seq || 0) + 1; });
  },
  ping(ds) { const r = findR(ds.id); if (r) sendPing(r, false); },
  'del-rem'(ds, btn) { if (!confirmTap(btn, 'Tap again to delete')) return; const r = findR(ds.id); closeSheet(); commit(`Deleted “${r ? r.title : ''}”`, s => { s.reminders = s.reminders.filter(x => x.id !== ds.id); }); },
  'new-must'() { openMust(null); },
  'open-must'(ds) { openMust(ds.id); },
  'save-must'(ds) { saveMust(ds.id || null); },
  'del-must'(ds, btn) {
    if (!confirmTap(btn, 'Tap again to delete')) return; const m = findM(ds.id); closeSheet();
    commit(`Deleted “${m ? m.title : ''}”`, s => { if (s.timer && s.timer.id === ds.id) s.timer = null; s.musts = s.musts.filter(x => x.id !== ds.id); });
  },
  tick(ds) {
    const t = today(), m = findM(ds.id); if (!m) return; const on = E.logged(m, t) >= 1;
    commit(on ? `${m.title}: not done` : `${m.title}: done`, s => { const x = s.musts.find(y => y.id === ds.id); x.log[t] = on ? 0 : 1; });
  },
  adj(ds) { const t = today(); commit(null, s => { const x = s.musts.find(y => y.id === ds.id); x.log[t] = Math.max(0, (x.log[t] || 0) + +ds.d); }, { keepSheet: false }); },
  'timer-start'(ds) { timerStart(ds.id); },
  'timer-stop'() { timerStop(); },
  'away-yes'() { closeSheet(); timerStop(); },
  'away-left'() { const end = awaySeen || st.timer.seen; closeSheet(); timerStop(end); },
  'away-drop'(ds, btn) { if (!confirmTap(btn, 'Tap again to throw it away')) return; closeSheet(); commit('Session thrown away', s => { s.timer = null; }); },
  seg(ds, btn) { btn.parentElement.querySelectorAll('button').forEach(b => b.classList.toggle('on', b === btn)); syncWhen(); },
  sw(ds, btn) { btn.classList.toggle('on'); btn.setAttribute('aria-checked', btn.classList.contains('on')); },
  chip(ds, btn) { btn.classList.toggle('on'); },
  step(ds) { const el = $('#f-target'); const v = Math.min(16 * 60, Math.max(5, +el.dataset.v + +ds.d)); el.dataset.v = v; el.textContent = dur(v); },
  stepn(ds) { const el = $('#f-n'); const v = Math.min(7, Math.max(1, +el.dataset.v + +ds.d)); el.dataset.v = v; el.textContent = `${v}× a week`; },
  'save-settings': saveSettings,
  'test-ping'() { const S = st.settings; S.shortcut = val('f-sc').trim() || 'Karle'; S.ping = 'shortcut'; save(); sendPing({ id: 'test', title: 'Karle test', date: today(), time: E.hhmm(Math.min(nowMinOfDay() + 2, 1439)) }, false); },
  backup(ds, btn) {
    const text = JSON.stringify(st);
    const fallback = () => { $('#restore').hidden = false; const ta = $('#f-restore'); ta.value = text; ta.select(); toast('Select all and copy it'); };
    try { navigator.clipboard.writeText(text).then(() => toast('Backup copied. Paste it into Notes.'), fallback); } catch { fallback(); }
  },
  'restore-open'() { $('#restore').hidden = false; },
  restore(ds, btn) {
    let s; try { s = JSON.parse(val('f-restore')); } catch { toast('That isn’t a Karle backup'); return; }
    if (!s || s.v !== 3 || !Array.isArray(s.reminders)) { toast('That isn’t a Karle backup'); return; }
    if (!confirmTap(btn, 'Tap again to replace everything')) return;
    closeSheet(); commit('Backup restored', x => { Object.keys(x).forEach(k => delete x[k]); Object.assign(x, E.migrate(s, now())); });
  },
  erase(ds, btn) { if (!confirmTap(btn, 'Tap again. This deletes everything')) return; closeSheet(); commit('Erased', s => { Object.keys(s).forEach(k => delete s[k]); Object.assign(s, E.fresh(now())); s.onboarded = true; }); },
  'welcome-done'() { commit(null, s => { s.onboarded = true; s.settings.name = val('f-name').trim(); s.settings.ping = segVal('ping'); }, { undo: false }); closeSheet(); if (st.settings.ping === 'shortcut') toast('Set up the shortcut in Settings when you can'); },
  'reveal-today'() { closeSheet(); if (!showReveal(today())) toast('Nothing scored today yet'); },
  'wrapped-last'() { closeSheet(); showWrapped(E.addDays(E.weekStart(today()), -7)); },
  emergency(ds, btn) { if (!confirmTap(btn, 'Tap again. One per week')) return; const t = today(); commit('Emergency day. Today isn’t scored.', s => { s.emergency[t] = true; if (s.timer) logTimer(s, now()); }); },
  'emergency-off'() { const t = today(); commit('Emergency day cancelled', s => { delete s.emergency[t]; }); },
  'full-close'() { closeFull(); },
  'w-next'() { if (Date.now() - wswiped < 400) return; wNext(); },
  'w-prev'() { if (Date.now() - wswiped < 400) return; wPrev(); }
};
document.addEventListener('click', e => {
  const btn = e.target.closest('[data-act]'); if (!btn) return;
  const f = A[btn.dataset.act]; if (!f) return;
  if (btn.tagName === 'BUTTON') e.preventDefault();
  f(btn.dataset, btn);
});
document.addEventListener('keydown', e => { if (e.key === 'Escape') { if ($('#full').innerHTML) closeFull(); else closeSheet(); } });

/* ---------- loops ---------- */
let tick = null;
function startTick() {
  clearInterval(tick);
  tick = setInterval(() => {
    if (!st.timer) { clearInterval(tick); tick = null; return; }
    const el = $('#lcd'); if (!el) return;
    const s = Math.floor(Math.max(0, now() - st.timer.start) / 1000);
    el.textContent = `${Math.floor(s / 3600)}:${String(Math.floor(s / 60) % 60).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
  }, 1000);
}
let lastDay = today();
function minuteLoop() {
  const t = today();
  if (t !== lastDay || !st.lastFinal || st.lastFinal < E.addDays(t, -1)) {
    lastDay = t;
    if (E.finalize(st, t)) save();
  }
  if (!$('#sheet .sh') && !$('#full').innerHTML && document.activeElement !== $('#dumpIn')) render();
  maybeMoments();
}
function maybeMoments() {
  if ($('#full').innerHTML || $('#sheet .sh') || !st.onboarded) return;
  const t = today();
  const wd = E.wrappedDue(st, t);
  if (wd) { showWrapped(wd); return; }
  const y = E.addDays(t, -1);
  if ((!st.seen.reveal || st.seen.reveal < y) && st.results[y] && st.results[y].score != null && y >= st.created) { showReveal(y); return; }
  if (revealReady() && (!st.seen.reveal || st.seen.reveal < t) && E.scoreDay(st, t).score != null) showReveal(t);
}
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') { checkAway(); minuteLoop(); }
  else if (st.timer) { st.timer.seen = now(); save(); }
});
setInterval(() => { if (document.visibilityState === 'visible' && st.timer && !$('#sheet .away')) { st.timer.seen = now(); save(); } }, 15000);
setInterval(minuteLoop, 30000);

/* ---------- boot ---------- */
E.finalize(st, today()); save();
drawDock(); render();
if (st.timer) { checkAway(); startTick(); }
if (!st.onboarded) openWelcome(); else maybeMoments();
if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
window.karle = { get state() { return st; } };
