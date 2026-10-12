// node serve.js              start the server
// node serve.js key "<name>" [crew] [manager] [admin] [ebay]  print a new key link for someone
//   crew: can be assigned jobs. manager: sees all jobs, assigns and adds them. admin: manages keys (from the team tab). neither: only jobs assigned to that name
const crypto = require('crypto');
const fs = require('fs');
const http = require('http');
const path = require('path');
const { MongoClient, ObjectId } = require('mongodb');

const env = path.join(__dirname, '.env');
if (fs.existsSync(env)) process.loadEnvFile(env);

const FIELDS = ['machine', 'customer', 'phone', 'quote', 'notes'];
// only managers change these (and the in date); others don't get the boxes, and the server ignores them if sent.
// phone and quote are also hidden from others; customer and in date still show on the card
const MANAGER_ONLY = ['customer', 'phone', 'quote'];
const PARTS = ['need', 'ordered', 'in'];
const COLOR = { need: 'm', ordered: 'y', in: 'c' };
const REV = process.env.K_REVISION || 'local';
const BUCKET = 'rush-photos-61436';
const ogImage = fs.readFileSync(path.join(__dirname, 'og-rush.png'));
const icon = fs.readFileSync(path.join(__dirname, 'icon-bars.png'));
// the browser tab gets the logo's bars on no background; home screens keep icon-bars.png, on white
const tabIcon = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 3 2"><rect width="1" height="2" fill="#ff3fb4"/><rect x="1" width="1" height="2" fill="#f2b705"/><rect x="2" width="1" height="2" fill="#12b5c4"/></svg>')}`;

const css = `
:root{color-scheme:light;--bg:#f6f4ef;--fg:#1d1d1d;--dim:#858585;--line:#e6e3db;--y:#a87600;--c:#0a8f9c;--m:#c8177a;--card:#fff;--mono:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;--s1:4px;--s2:8px;--s3:16px;--s4:24px}
*{box-sizing:border-box}
html{-webkit-text-size-adjust:100%;text-size-adjust:100%}
body{margin:0;overflow-wrap:anywhere;background:var(--bg);color:var(--fg);font:15px/1.5 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
/* like MDN: what people read, tap and type is the phone's own font on white; what the app generates sits in cream mono boxes */
.card,header,footer,button,.btn,.meta,#status{font-family:var(--mono);font-size:13px;line-height:1.6}
header,.card,button,.btn{background:var(--card);color:var(--fg);border:1px solid var(--line);border-radius:8px}
main{max-width:44rem;margin:0 auto;padding:var(--s4) var(--s3) 80px}
a{color:inherit;text-decoration:none}
.y{color:var(--y)}.c{color:var(--c)}.m{color:var(--m)}.dim{color:var(--dim)}
header{padding:0 var(--s3);margin-bottom:var(--s3)}
h1{margin:0 0 var(--s3);font-size:18px}
/* few tabs on purpose; if they ever outgrow a phone they wrap rather than run off the edge */
nav{position:relative;display:flex;flex-wrap:wrap;gap:0 var(--s3)}
nav a{padding:12px 0;color:var(--dim);border-bottom:2px solid transparent;transition:color .15s,border-color .15s}
nav a.on{color:var(--fg);border-color:var(--c)}
nav sup{color:var(--m);font-size:10px}
.filter{position:relative;display:flex;flex-wrap:wrap;gap:0 var(--s3);font:13px var(--mono)}
.filter a{padding:12px 0;color:var(--dim);border-bottom:2px solid transparent;transition:color .15s,border-color .15s}
.filter a.on{color:var(--fg);border-color:var(--c)}
.filter>.spin{position:absolute;right:0;top:50%;transform:translateY(-50%);line-height:1}
/* parts tab: the part text is a button that looks like text; machine and who sit small underneath */
li button.t{display:block;padding:0;margin:0;font:inherit;color:var(--fg);text-align:left;white-space:normal}
li small{display:block;color:var(--dim);font-size:12px}
li small a{color:var(--c)}
h2{margin:var(--s4) 0 var(--s2);font-size:17px}
.list{padding:0 var(--s3)}
.list li:last-child{border-bottom:0}
.cards{display:grid;gap:var(--s2);margin-top:var(--s3)}
.card{position:relative;display:block;padding:var(--s3)}
.card.shop{border-left:4px solid var(--c)}
.card .top{display:flex;justify-content:space-between;gap:var(--s2)}
/* two rows, each with its own short right side, so the left text gets nearly the full width */
.card .top span{white-space:nowrap}
.card sup{color:var(--m);font-size:10px}
h2 .sort{position:relative;float:right;padding:12px 0;margin-top:-12px;font:13px var(--mono);color:var(--dim);border-bottom:2px solid transparent;transition:color .15s,border-color .15s}
.sort>.spin{position:absolute;right:100%;white-space:nowrap;top:50%;transform:translateY(-50%);margin-right:1ch;line-height:1}
ul{list-style:none;margin:0;padding:0}
li{display:flex;align-items:baseline;gap:1ch;padding:12px 0;border-bottom:1px solid var(--line);transition:opacity .2s}
li>span{flex:1}
/* backlog: a bar of █ to scale, then the count lined up on the right */
.bar{font-style:normal;white-space:nowrap}
.chart{display:block;width:100%;height:auto;margin:var(--s2) 0}
.axis{display:flex;justify-content:space-between;gap:var(--s2);color:var(--dim);font-size:12px}
.sw{display:inline-block;width:10px;height:10px;border-radius:2px;margin:0 4px 0 0;vertical-align:-1px}
.sw+.sw{margin-left:var(--s2)}
#tip{margin-top:var(--s2)}
li>a{flex:1;display:flex;align-items:baseline;gap:1ch}
li>a>span{flex:1}
li .n{min-width:4ch;text-align:right;font-weight:normal;white-space:nowrap}
.qr{display:block;width:220px;max-width:100%;margin:var(--s2) 0 var(--s3)}
.who{display:block;font-size:18px}
.meta{color:var(--dim);font-size:12px;white-space:nowrap}
.done>span{color:var(--dim);text-decoration:line-through}
label{display:block;margin-top:var(--s3);color:var(--dim)}
input,textarea,select{display:block;width:100%;padding:var(--s2) 0;background:none;color:var(--fg);font:inherit;font-size:16px;border:0;border-bottom:1px solid var(--line);caret-color:var(--c)}
textarea{resize:vertical}
input:focus,textarea:focus,select:focus{outline:0;border-color:var(--c)}
button,.btn{display:inline-block;padding:12px var(--s3);color:var(--c);cursor:pointer}
li button,button.tag{padding:12px;margin:-12px;border:0;border-radius:4px;background:none;box-shadow:none;white-space:nowrap}
button.x{color:var(--dim);padding:12px 18px;margin:-12px -16px -12px -10px}
/* anything you can press sits on a 1px ledge: hover lifts it a little, pressing sinks it */
button,.btn,a.card{box-shadow:0 1px 0 var(--line);transition:border-color .15s,box-shadow .15s,background .15s,color .15s}
button:active,.btn:active,a.card:active{transform:translateY(1px);box-shadow:none}
button:disabled{opacity:.5;pointer-events:none}
:focus-visible{outline:2px solid var(--c);outline-offset:2px}
@media (hover:hover){
nav a:hover{color:var(--fg)}
nav a:not(.on):hover,h2 .sort:hover{border-color:var(--line)}
h2 .sort:hover{color:var(--fg)}
.filter a:not(.on):hover{color:var(--fg);border-color:var(--line)}
button:hover,.btn:hover,a.card:hover{border-color:var(--c);box-shadow:0 2px 6px rgba(0,0,0,.06)}
li button:hover,button.tag:hover{background:var(--bg);box-shadow:none}
button.x:hover{color:var(--m)}
}
.card>p:last-child{margin-bottom:0}
/* the tag highlights tightly around its text; an invisible layer keeps the tap target big */
button.tag{position:relative;padding:0 4px;margin:0 -4px}
button.tag::after{content:"";position:absolute;inset:-10px -4px}
.row{display:flex;gap:var(--s2);margin-top:var(--s3);flex-wrap:wrap}
.pending{opacity:.5}
li.gone{opacity:.25}
body.busy button{cursor:progress}
footer{margin-top:48px;padding-top:var(--s3);border-top:1px solid var(--line);color:var(--dim);font-size:12px}
footer b{color:var(--fg);font-weight:normal}
#logo i{font-style:normal}
#logo .m,.spin .m{color:#ff3fb4}#logo .y,.spin .y{color:#f2b705}#logo .c,.spin .c{color:#12b5c4}
/* waiting: the logo's bars blink at unrelated speeds, so the pattern looks random and needs no js */
.spin{font-style:normal;font-size:.75em}
/* in the nav and on cards the bars float in spare space, so nothing moves */
nav>.spin{position:absolute;right:0;top:50%;transform:translateY(-50%);line-height:1}
.card>.spin{position:absolute;right:var(--s3);bottom:3px;line-height:1}
.spin i{font-style:normal;animation:flick .5s steps(1) infinite}
.spin i+i{animation-duration:.7s}
.spin i+i+i{animation-duration:1.1s}
@keyframes flick{50%{opacity:.15}}
@media (prefers-reduced-motion:reduce){.spin i{animation:none}}
#status{position:fixed;left:50%;bottom:var(--s3);transform:translateX(-50%);padding:var(--s1) var(--s3);border:1px solid var(--line);border-radius:4px;background:var(--card);white-space:nowrap}
#status:empty{display:none}
/* photos: square tiles, oldest first, so the first is "before" and the last is "after" */
.photos{display:grid;grid-template-columns:repeat(auto-fill,minmax(96px,1fr));gap:var(--s2)}
.photos li{display:block;position:relative;padding:0;border:0}
.photos img{display:block;width:100%;aspect-ratio:1;object-fit:cover;background:var(--line);border:1px solid var(--line);border-radius:8px}
.photos small{display:block;color:var(--dim);font:12px var(--mono)}
.photos button.x{position:absolute;top:0;right:0;margin:0;padding:2px 8px;background:var(--card);border-radius:0 8px 0 8px}
label.btn{display:inline-block;margin:0;color:var(--c)}
label.btn input{position:absolute;width:1px;height:1px;opacity:0}
#status.ok{color:var(--c)}#status.err{color:var(--m)}`;

// runs in the browser: instant feedback on tap, then a second step once the db answers
function browser() {
  const $ = (s) => document.querySelector(s);
  let busy = false, shown = 0;

  // a copy of the footer logo, which css makes flicker while something is saving or loading
  const start = (at) => {
    const mark = document.createElement('i');
    mark.className = 'spin';
    mark.innerHTML = $('#logo').innerHTML;
    // start each bar somewhere random in its blink, so quick saves don't all show the same pattern
    for (const bar of mark.children) bar.style.animationDelay = `-${Math.random()}s`;
    at(mark);
    busy = true;
    document.body.classList.add('busy');
    return mark;
  };
  const stop = () => { busy = false; document.body.classList.remove('busy'); };

  const status = (html, cls = '') => {
    const s = $('#status'), n = ++shown;
    s.className = cls;
    s.innerHTML = html;
    if (cls === 'ok') setTimeout(() => n === shown && status(''), 2500);
  };
  // backlog chart: hovering or tapping a day shows its numbers
  document.addEventListener('pointerover', (e) => { const t = e.target.closest('[data-tip]'); if (t && $('#tip')) $('#tip').textContent = t.dataset.tip; });
  const net = () => { const n = $('#net'); if (n) n.textContent = navigator.onLine ? 'online' : 'offline'; };
  addEventListener('online', net);
  addEventListener('offline', net);
  addEventListener('pageshow', () => { stop(); document.querySelectorAll('.spin').forEach((el) => el.remove()); net(); });

  // show a row's "who · when" only when the row's text still fits on one line beside it
  const fit = () => {
    const metas = [...document.querySelectorAll('.meta')];
    metas.forEach((m) => m.hidden = false);
    metas.filter((m) => m.previousElementSibling.offsetHeight > parseFloat(getComputedStyle(m.previousElementSibling).lineHeight) * 1.5)
      .forEach((m) => m.hidden = true);
  };
  let frame;
  addEventListener('resize', () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(fit); });

  document.addEventListener('click', (e) => {
    const a = e.target.closest('a[href^="/"]');
    if (a && !busy && !e.ctrlKey && !e.metaKey && !e.shiftKey) start((m) => a.closest('nav, .filter') ? a.closest('nav, .filter').append(m) : a.append(' ', m));
  });

  // the clipboard api only exists on https and localhost, so fall back to a hidden textarea on plain http
  document.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-copy]');
    if (!b) return;
    try { await navigator.clipboard.writeText(b.dataset.copy); } catch {
      const t = document.createElement('textarea');
      t.value = b.dataset.copy;
      document.body.append(t);
      t.select();
      document.execCommand('copy');
      t.remove();
    }
    status('✓ copied', 'ok');
  });

  // put the page the server sent back in place of this one
  const swap = async (r, t) => {
    if (!r.ok) throw new Error(r.status);
    const doc = new DOMParser().parseFromString(await r.text(), 'text/html');
    $('main').replaceWith(doc.querySelector('main'));
    document.title = doc.title;
    if (r.url !== location.href) history.replaceState(null, '', r.url);
    fit();
    status(`✓ saved <span class="dim">${Math.round(performance.now() - t)}ms</span>`, 'ok');
  };

  // photos shrink on the phone (a 5MB camera shot becomes ~300KB, location data dropped), then a small and a big jpeg go up together
  const jpeg = (img, max, q) => {
    const s = Math.min(1, max / Math.max(img.width, img.height)), cv = document.createElement('canvas');
    cv.width = Math.round(img.width * s);
    cv.height = Math.round(img.height * s);
    cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
    return new Promise((ok) => cv.toBlob(ok, 'image/jpeg', q));
  };
  document.addEventListener('change', async (e) => {
    const input = e.target.closest('[data-photo]');
    if (!input || busy || !input.files.length) return;
    const files = [...input.files], mark = start((m) => input.parentElement.after(m)), t = performance.now();
    try {
      for (const [i, file] of files.entries()) {
        if (files.length > 1) status(`photo ${i + 1} of ${files.length}…`);
        const img = await createImageBitmap(file), small = await jpeg(img, 480, 0.7), big = await jpeg(img, 1600, 0.82);
        const r = await fetch(input.dataset.photo, { method: 'POST', headers: { 'x-thumb': small.size }, body: new Blob([small, big]) });
        if (i === files.length - 1) await swap(r, t); else if (!r.ok) throw new Error(r.status);
      }
    } catch (err) {
      mark.remove();
      input.value = '';
      status(`✗ photo not saved (${navigator.onLine ? err.message : 'offline'}) · try again`, 'err');
    }
    stop();
    net();
  });

  document.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (busy) return;
    const form = e.target, btn = e.submitter, row = btn && btn.closest('li');
    const body = new URLSearchParams(new FormData(form, btn));
    const undo = btn && [btn.innerHTML, btn.className];
    if (btn && btn.dataset.next) { btn.textContent = btn.dataset.next; btn.className = btn.dataset.cls || ''; }
    if (btn && btn.value.startsWith('rm')) row.classList.add('gone');
    if (btn) btn.classList.add('pending');
    if (row && row.querySelector('.meta')) row.querySelector('.meta').hidden = true;
    const x = row && row.querySelector('.x');
    const mark = start((m) => x ? x.before(m) : row ? row.append(m) : (form.querySelector('.row') || form).append(m));
    const t = performance.now();
    try {
      // parts tab rows post to their own job; formAction without the attribute is the page url, so check it's set
      await swap(await fetch(btn && btn.hasAttribute('formaction') ? btn.formAction : form.action, { method: 'POST', body }), t);
    } catch (err) {
      if (btn) [btn.innerHTML, btn.className] = undo;
      if (row) row.classList.remove('gone');
      mark.remove();
      status(`✗ not saved (${navigator.onLine ? err.message : 'offline'}) · try again`, 'err');
    }
    stop();
    net();
  });
  net();
  fit();
}

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);
const logo = '<span id="logo"><i class="m">█</i><i class="y">█</i><i class="c">█</i></span>';

// c: { k, q, t0, tab, id } built per request
// the key's name leads the tab title and the texted-link preview, so it's clear whose link is whose
const page = (c, title, body) => `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(c.k.label)} · ${esc(title)}</title>
<meta property="og:title" content="Rush Powersports · ${esc(c.k.label)}">
<meta property="og:description" content="${esc(`for ${c.k.label} only · ${c.manager ? 'sees all shop jobs' : `sees jobs assigned to ${c.k.label}`}`)}">
<meta property="og:site_name" content="rush.rxtm.net">
<meta property="og:image" content="https://rush.rxtm.net/og-rush.png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
<link rel="icon" href="${tabIcon}"><link rel="apple-touch-icon" href="/icon-bars.png"><style>${css}</style><main>
<h1>Rush Powersports</h1><header>
<nav>${[['jobs', '/jobs', c.fresh ? ` <sup>${c.fresh}</sup>` : ''], ['parts', '/parts', c.need ? ` <sup>${c.need}</sup>` : ''], ['issues', '/issues', ''], ...(c.manager ? [['backlog', '/backlog', '']] : []), ...(c.manager || c.admin ? [['team', c.admin ? '/keys' : '/team', '']] : [])]
    .map(([t, href, sup]) => `<a href="${href}${c.q}"${c.tab === t ? ' class="on"' : ''}>${t}${sup}</a>`).join('')}</nav></header>
${body}
<footer><div>${logo} <b>Resource Automation</b></div>
<div>user ${esc(c.k.label)} · key …${c.k.key.slice(-4)}${c.id ? ` · job …${String(c.id).slice(-6)}` : ''}</div>
<div>db ${esc(process.env.MONGODB_DB)} · server ${Date.now() - c.t0}ms · rev ${esc(REV)} · up ${Math.round(process.uptime() / 60)}m · net <span id="net">?</span></div>
</footer></main><div id="status"></div><script>(${browser})()</script>
<script type="speculationrules">{"prefetch":[{"where":{"href_matches":"/*"},"eagerness":"conservative"}]}</script>`;

const nextPart = (s) => PARTS[(PARTS.indexOf(s) + 1) % PARTS.length];
const day = (d) => d.toLocaleDateString('en-CA', { timeZone: 'America/Chicago' });
// calendar days between two dates in shop time: 6, or as words "today", "1 day", "6 days"
const dayCount = (from, to) => Math.round((Date.parse(day(to)) - Date.parse(day(from))) / 864e5);
const days = (from, to) => { const n = dayCount(from, to); return n < 1 ? 'today' : n === 1 ? '1 day' : `${n} days`; };
const ago = (d) => { const m = (Date.now() - d) / 60000; return m < 1 ? 'now' : m < 60 ? `${m | 0}m` : m < 1440 ? `${m / 60 | 0}h` : `${m / 1440 | 0}d`; };
// 10 digits (or 11 starting with 1) shows as 405-313-3584; anything else stays as typed
const tel = (s) => { const d = String(s || '').replace(/\D/g, '').replace(/^1(?=\d{10}$)/, ''); return d.length === 10 ? `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}` : s; };
// hidden until the browser checks it fits beside the text (fit() in browser())
const meta = (l) => l.changedBy ? `<small class="meta" hidden>${esc(l.changedBy)} · ${ago(l.changedAt)}</small>` : '';

// no name field: machine · customer, or the id's tail when both are blank
const name = (j) => j.shop ? 'Shop' : [j.machine, j.customer].filter(Boolean).join(' · ') || `job …${String(j._id).slice(-4)}`;

// "2/3 ✓", cyan once everything is done
const tally = (j) => {
  const done = j.todo.filter((t) => t.done).length;
  return j.todo.length ? `<span class="${done === j.todo.length ? 'c' : 'dim'}">${done}/${j.todo.length} ✓</span>` : '';
};
const needed = (j) => {
  const n = j.parts.filter((p) => p.state === 'need').length;
  return n ? `<span class="m">${n} part${n > 1 ? 's' : ''} needed</span>` : '';
};

// opened in the last 24h: "new" on the card, counted in the jobs tab badge
const isNew = (j) => !j.shop && !j.doneAt && Date.now() - j.inAt < 864e5;

// top right of job cards and the job page: "in 2026-10-08 · 1 day"
const age = (j) => j.shop ? '' : `<span class="dim">in ${day(j.inAt)} · ${days(j.inAt, j.doneAt || new Date())}</span>`;

// one job card for the jobs list and the job page. on the list it's a link; on the job page (act = its form attributes)
// it's a form, so managers can tap the [name] tag, and it adds phone, quote and done (links can't nest inside the list's link)
const card = (c, j, act) => {
  const who = c.manager && !j.shop && (act ? assignTag(c, j) : esc(j.assignedTo || 'nobody assigned'));
  const sub = [j.machine && j.customer && esc(j.customer), who].filter(Boolean).join(' · ');
  const info = act && [c.manager && j.phone && `<a class="c" href="tel:${esc(j.phone)}">${esc(tel(j.phone))}</a>`, c.manager && j.quote && `quoted ${esc(j.quote)}`, j.doneAt && '<span class="y">done</span>'].filter(Boolean).join(' · ');
  return `<${act ? `form ${act}` : `a href="/job/${j._id}${c.q}"`} class="card${j.shop ? ' shop' : ''}"><div class="top"><b>${esc(j.machine || name(j))}${isNew(j) ? ' <sup>new</sup>' : ''}</b>${age(j)}</div>
${sub || tally(j) ? `<div class="top"><div class="dim">${sub}</div>${tally(j)}</div>` : ''}
${info ? `<div class="dim">${info}</div>` : ''}${needed(j) ? `<div>${needed(j)}</div>` : ''}</${act ? 'form' : 'a'}>`;
};

// backlog buckets: the backlog tab counts them, and each row links to the jobs tab showing only that bucket (?f=id)
const inDays = (j) => dayCount(j.inAt, new Date());
const has = (j, s) => j.parts.some((p) => p.state === s);
const BUCKETS = [
  { id: '0-7', box: 'days', label: '0–7 days', test: (j) => inDays(j) <= 7 },
  { id: '8-14', box: 'days', label: '8–14 days', test: (j) => inDays(j) > 7 && inDays(j) <= 14 },
  { id: '15-30', box: 'days', label: '15–30 days', test: (j) => inDays(j) > 14 && inDays(j) <= 30, cls: 'y' },
  { id: 'over-30', box: 'days', label: 'over 30 days', test: (j) => inDays(j) > 30, cls: 'm' },
  { id: 'parts-needed', box: 'wait', label: 'parts needed', test: (j) => has(j, 'need'), cls: 'm' },
  { id: 'parts-ordered', box: 'wait', label: 'parts ordered', test: (j) => has(j, 'ordered'), cls: 'y' },
  { id: 'nobody', box: 'wait', label: 'nobody assigned', test: (j) => !j.assignedTo, cls: 'dim' },
  { id: 'todos-done', box: 'wait', label: 'to-dos all done', test: (j) => j.todo.length > 0 && j.todo.every((t) => t.done) },
];
// "who:Brad" is made per person, since the crew changes; what the jobs tab says it's showing
const bucket = (f) => f && f.startsWith('who:') ? { id: f, label: f.slice(4), test: (j) => j.assignedTo === f.slice(4), say: `assigned to ${f.slice(4)}` }
  : BUCKETS.find((b) => b.id === f);
const say = (b) => b.say || (b.box === 'days' ? `${b.label} in shop` : b.label);

// a filter (c.f) hides the shop job and recently done, and the sort link keeps it
const list = (c, open, done) => {
  const f = c.f ? `&f=${encodeURIComponent(c.f.id)}` : '', s = c.sort ? '&sort=new' : '';
  return page(c, c.f ? say(c.f) : 'Rush Powersports', `${c.manager ? `<a class="btn" href="/new${c.q}">+ new job</a>` : ''}
<h2>Open Jobs <span class="dim">${open.filter((j) => !j.shop).length}</span><a class="sort" href="/jobs${c.q}${f}${c.sort ? '' : '&sort=new'}">${c.sort ? 'newest first' : 'oldest first'}</a></h2>
${c.f ? `<p class="dim">only <b class="${c.f.cls || 'c'}">${esc(say(c.f))}</b> · <a class="c" href="/jobs${c.q}${s}">× show all</a></p>` : ''}
<div class="cards">${open.map((j) => card(c, j)).join('\n') || '<p class="dim">none right now.</p>'}</div>
${done.length ? `<h2>Recently done</h2><div class="cards">${done.map((j) => card(c, j)).join('\n')}</div>` : ''}`);
};

// managers: open jobs (not the shop job) by bucket. bars are to scale within each box; tap a row for those jobs
// back-calculated: on day d a job was open if it came in by d and wasn't done until after d.
// a reopened job loses its old done date, so it counts as open the whole time. last 90 days at most
const history = (all, now) => {
  const today = day(now), ins = all.map((j) => [j, day(j.inAt), j.doneAt && day(j.doneAt)]);
  const first = Math.max(Date.parse(ins.reduce((m, [, i]) => i < m ? i : m, today)), Date.parse(today) - 89 * 864e5);
  const out = [];
  for (let t = first; t <= Date.parse(today); t += 864e5) {
    const d = new Date(t).toISOString().slice(0, 10), open = ins.filter(([, i, o]) => i <= d && (!o || o > d));
    const over = open.filter(([, i]) => (t - Date.parse(i)) / 864e5 > 30).length;
    out.push({ d, under: open.length - over, over });
  }
  return out;
};

// stacked bars, one per day; tap or hover a day to read it in the line above. colors checked for colorblind separation
const UNDER = '#0a8f9c', OVER = '#ff3fb4';
const historyChart = (h) => {
  const W = 600, H = 240, max = Math.max(1, ...h.map((x) => x.under + x.over)), slot = W / h.length, w = Math.max(1, slot - 2);
  const y = (n) => n / max * H, md = (d) => `${+d.slice(5, 7)}/${+d.slice(8)}`;
  const tip = (x) => `${md(x.d)}: ${x.under + x.over} open, ${x.over} over 30 days`;
  const bars = h.map((x, i) => {
    const X = i * slot + (slot - w) / 2, hu = y(x.under), ho = y(x.over), gap = hu && ho ? 2 : 0;
    return `<g data-tip="${tip(x)}"><rect x="${i * slot}" width="${slot}" height="${H}" fill="transparent"/>${hu ? `<rect x="${X}" y="${H - hu}" width="${w}" height="${hu}" rx="1" fill="${UNDER}"/>` : ''}${ho ? `<rect x="${X}" y="${H - hu - gap - ho}" width="${w}" height="${ho}" rx="1" fill="${OVER}"/>` : ''}</g>`;
  }).join('');
  return `<div class="card"><div class="axis"><span><i class="sw" style="background:${UNDER}"></i>30 days or less <i class="sw" style="background:${OVER}"></i>over 30</span><span>max ${max}</span></div>
<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="open jobs per day, ${tip(h[h.length - 1])}"><line x1="0" x2="${W}" y1="${H - 0.5}" y2="${H - 0.5}" stroke="var(--line)"/>${bars}</svg>
<div class="axis"><span>${md(h[0].d)}</span><span>today</span></div><div id="tip">${tip(h[h.length - 1])}</div></div>`;
};

const backlogPage = (c, open, all) => {
  const box = (rows) => {
    const n = rows.map((b) => open.filter(b.test).length), max = Math.max(1, ...n);
    return `<div class="card list"><ul>${rows.map((b, i) => `<li><a href="/jobs${c.q}&f=${encodeURIComponent(b.id)}"><span>${esc(b.label)}</span><i class="bar ${b.cls || 'c'}">${'█'.repeat(Math.ceil(n[i] / max * 12))}</i><b class="n">${n[i]}</b></a></li>`).join('')}</ul></div>`;
  };
  const people = [...new Set(open.map((j) => j.assignedTo).filter(Boolean))].sort();
  return page(c, 'Backlog', `<h2>Backlog</h2>
<p class="dim">${!open.length ? 'no open jobs.' : `${open.length} open job${open.length > 1 ? 's' : ''}, ${open.filter(bucket('over-30').test).length || 'none'} over 30 days old. the oldest ${dayCount(open[0].inAt, new Date()) < 1 ? 'came in today' : `is ${days(open[0].inAt, new Date())}`}.`}</p>
<h2>Open jobs by day</h2>${historyChart(history(all, new Date()))}
<h2>Days in shop</h2>${box(BUCKETS.filter((b) => b.box === 'days'))}
<h2>Waiting on</h2>${box(BUCKETS.filter((b) => b.box === 'wait'))}
<h2>Who has them</h2>${box([...people.map((w) => bucket(`who:${w}`)), { ...bucket('nobody'), label: 'nobody' }])}
<h2>Oldest</h2><div class="card list"><ul>${open.slice(0, 5).map((j) => `<li><span><a href="/job/${j._id}${c.q}">${esc(name(j))}</a></span><b class="n">${days(j.inAt, new Date())}</b></li>`).join('') || '<li class="dim">nothing open</li>'}</ul></div>`);
};


// every part on open jobs; each button posts to its own job, then the server sends us back here with the same filter
const partsPage = (c, rows, counts, state) => page(c, 'Parts', `<h2>Open Parts</h2>
<div class="filter">${['', ...PARTS].map((s) => `<a href="/parts${c.q}${s ? `&state=${s}` : ''}"${s === state ? ' class="on"' : ''}>${s || 'all'} ${s ? counts[s] : rows.total}</a>`).join('')}</div>
<form method="post" action="/parts${c.q}"><input type="hidden" name="to" value="parts"><input type="hidden" name="state" value="${state}">
<div class="card list"><ul>${rows.map(({ j, p }) => {
    const go = `name="a" value="part:${p.id}:${nextPart(p.state)}" formaction="/job/${j._id}${c.q}"`;
    return `<li><button ${go} class="${COLOR[p.state]}" data-next="[${nextPart(p.state)}]" data-cls="${COLOR[nextPart(p.state)]}">[${p.state}]</button><span><button class="t" ${go}>${esc(p.text)}</button>
<small><a href="/job/${j._id}${c.q}">${esc(j.machine || name(j))}</a>${p.createdBy ? ` · ${esc(p.createdBy)}` : ''}</small></span></li>`;
  }).join('') || '<li class="dim">nothing here</li>'}</ul></div></form>`);

// people see the issues they wrote; admins see all of them and tick them off
const issueRow = (c, i) => `<li class="${i.doneAt ? 'done' : ''}">${c.admin ? `<button name="a" value="done:${i._id}:${i.doneAt ? 0 : 1}" data-next="${i.doneAt ? '[ ]' : '[x]'}">${i.doneAt ? '[x]' : '[ ]'}</button>` : ''}<span>${esc(i.text)}</span>${meta(i)}</li>`;
const issuesPage = (c, open, done) => page(c, 'Issues', `<form method="post" action="/issues${c.q}"><h2>Tell us</h2>
<textarea name="text" rows="3" maxlength="2000" aria-label="issue" placeholder="what's broken, or what you'd like"></textarea>
<div class="row"><button name="a" value="add">+ send</button></div></form>
<form method="post" action="/issues${c.q}"><h2>Open</h2><div class="card list"><ul>${open.map((i) => issueRow(c, i)).join('') || '<li class="dim">nothing yet</li>'}</ul></div>
${done.length ? `<h2>Fixed</h2><div class="card list"><ul>${done.map((i) => issueRow(c, i)).join('')}</ul></div>` : ''}</form>`);

const fields = (c, j = {}) => j.shop ? '' : `<label>machine (year make model)<input name="machine" maxlength="2000" value="${esc(j.machine)}"></label>
${c.manager ? `<label>customer<input name="customer" maxlength="2000" value="${esc(j.customer)}"></label>
<label>phone<input name="phone" type="tel" maxlength="2000" value="${esc(tel(j.phone))}"></label>
<label>quote<input name="quote" maxlength="2000" value="${esc(j.quote)}"></label>
<label>in date<input name="in" type="date" max="${day(new Date())}" value="${day(j.inAt || new Date())}"></label><input type="hidden" name="in0" value="${j.inAt ? day(j.inAt) : ''}">` : ''}`;

// managers pick from key labels; keep the current name even if its key was revoked
const assign = (c, j = {}) => c.manager && !j.shop ? `<label>assigned to<select name="assignedTo"><option value="">nobody</option>${[...new Set([...c.who, j.assignedTo].filter(Boolean))]
  .map((w) => `<option${w === j.assignedTo ? ' selected' : ''}>${esc(w)}</option>`).join('')}</select></label>` : '';

// on a job, managers tap [name] to cycle through the crew, then nobody
const assignTag = (c, j) => {
  const cycle = ['', ...c.who.sort()], next = cycle[(cycle.indexOf(j.assignedTo || '') + 1) % cycle.length];
  const tag = (w) => `[${esc(w || 'nobody')}]`;
  return `<button class="tag ${j.assignedTo ? 'c' : 'dim'}" name="a" value="assign:${esc(next)}" data-next="${tag(next)}" data-cls="tag ${next ? 'c' : 'dim'}">${tag(j.assignedTo)}</button>`;
};

const newJob = (c) => page(c, 'New job', `<h2>New job</h2>
<form method="post" action="/new${c.q}">${fields(c)}${assign(c)}
<label>what they want done (one per line)<textarea name="todo" rows="4" maxlength="2000" placeholder="won&#39;t start&#10;new tires"></textarea></label>
<div class="row"><button>↵ save</button></div></form>`);

const job = (c, j) => {
  const act = `method="post" action="/job/${j._id}${c.q}"`, photos = j.photos || [], src = (p) => `/photo/${j._id}/${p.id}`;
  // buttons send the state they are asking for, so a repeat or stale tap can't flip the wrong way
  return page(c, name(j), `${card(c, j, act)}
<section><form ${act}>
<h2>To do</h2><div class="card list"><ul>${j.todo.map((t) => `<li class="${t.done ? 'done' : ''}"><button name="a" value="todo:${t.id}:${t.done ? 0 : 1}" data-next="${t.done ? '[ ]' : '[x]'}">${t.done ? '[x]' : '[ ]'}</button><span>${esc(t.text)}</span>${meta(t)}<button class="x" name="a" value="rmtodo:${t.id}">×</button>`).join('') || '<li class="dim">nothing yet</li>'}</ul></div>
<h2>Parts</h2><div class="card list"><ul>${j.parts.map((p) => `<li><button name="a" value="part:${p.id}:${nextPart(p.state)}" class="${COLOR[p.state]}" data-next="[${nextPart(p.state)}]" data-cls="${COLOR[nextPart(p.state)]}">[${p.state}]</button><span>${esc(p.text)}</span>${meta(p)}<button class="x" name="a" value="rmpart:${p.id}">×</button>`).join('') || '<li class="dim">none</li>'}</ul></div>
</form>
<form ${act}><h2>Add</h2><textarea name="text" rows="2" maxlength="2000" aria-label="add" placeholder="type it, then tap + to do or + part&#10;one per line adds several"></textarea>
<div class="row"><button name="a" value="add:todo">+ to do</button><button name="a" value="add:part">+ part</button></div></form></section>
<section><form ${act}><h2>Photos</h2>${photos.length ? `<ul class="photos">${photos.map((p) => `<li><a href="${src(p)}.jpg${c.q}"><img src="${src(p)}-t.jpg${c.q}" alt="photo" loading="lazy"></a><small>${day(p.at).slice(5).replace('-', '/')} ${esc(p.by)}</small><button class="x" name="a" value="rmphoto:${p.id}" aria-label="remove photo">×</button></li>`).join('')}</ul>` : '<p class="dim">none yet. before and after shots go here.</p>'}
<div class="row"><label class="btn">+ photo<input type="file" accept="image/*" multiple data-photo="/job/${j._id}/photo${c.q}"></label></div></form></section>
<section><form ${act}><h2>Details</h2>${fields(c, j)}
<label>notes<textarea name="notes" rows="4" maxlength="10000">${esc(j.notes)}</textarea></label>${assign(c, j)}
<div class="row"><button name="a" value="save">↵ save</button>${j.shop ? '' : `<button name="a" value="done:${j.doneAt ? 0 : 1}">${j.doneAt ? '↺ reopen' : '✓ mark done'}</button>`}</div></form></section>`);
};

// just a name and a code per person, no link to copy or tap, so nobody shares the wrong one or opens it as someone else
const teamPage = (c, people) => page(c, 'Team', `<p class="dim">have them scan their code with their phone camera.</p>
<div class="cards">${people.map(([who, link]) => `<div class="card"><b class="who">${esc(who)}</b>${qr(link)}</div>`).join('\n')}</div>${people.length ? '' : '<p class="dim">no one to show yet.</p>'}`);

const SCOPES = [['shop', 'can open the app'], ['crew', 'can be assigned jobs'], ['manager', 'sees all jobs, assigns and adds them'], ['admin', 'manages keys, from the team tab'], ['ebay', 'ebay listing helper (coming soon)']];

const keysPage = (c, all) => page(c, 'Keys', `<h2>Add key</h2><form method="post" action="/keys${c.q}"><label>name<input name="label" maxlength="40" placeholder="Brad"></label>
<div class="row"><button name="a" value="add">+ key</button></div>
<p class="dim">new keys only see jobs assigned to that name. open a key to turn on more, like manager.</p></form>
<h2>Keys</h2><div class="cards">${all.map((x) => `<a class="card" href="/keys/${x._id}${c.q}">${esc(x.label)}${x.scopes.filter((s) => s !== 'shop').map((s) => ` <span class="y">${esc(s)}</span>`).join('')}${x.scopes.includes('shop') ? '' : ' <span class="m">off</span>'} <span class="dim">…${x.key.slice(-4)}${x.key === c.k.key ? ' · you' : ''}</span></a>`).join('')}</div>`);

// your own key can't be changed here, so you can't lock yourself out
const keyPage = (c, x, link) => {
  const own = x.key === c.k.key;
  return page(c, `${x.label}'s key`, `<div class="card"><b>${esc(x.label)}</b>
<div class="dim">key …${x.key.slice(-4)} · made ${day(x.createdAt)}${x.createdBy ? ` by ${esc(x.createdBy)}` : ''}</div></div>
<section><h2>Scan to open jobs</h2><div class="card">${qr(link)}<a class="c" href="${esc(link)}" target="_blank" rel="noopener">${esc(link)}</a>
<div class="row"><button type="button" data-copy="${esc(x.key)}">⧉ copy key</button></div>
<p class="dim">anyone with this link gets in with these scopes.</p></div></section>
<section><form method="post" action="/keys/${x._id}${c.q}"><h2>Scopes</h2><div class="card list"><ul>${SCOPES.map(([s, what]) => {
    const on = x.scopes.includes(s);
    return `<li><button name="a" value="scope:${s}:${on ? 0 : 1}" data-next="${on ? '[ ]' : '[x]'}"${own ? ' disabled' : ''}>${on ? '[x]' : '[ ]'}</button><span>${s} <span class="dim">${what}</span></span></li>`;
  }).join('')}</ul></div></form></section>
${own ? '<p class="dim">this is your key, so it can&#39;t be changed or revoked here.</p>'
    : `<form method="post" action="/keys/${x._id}${c.q}"><div class="row"><button name="a" value="revoke">× revoke key</button></div></form>`}`);
};

// tiny QR encoder: byte mode, version 5 (37x37), error level L, mask 0. fits links up to 106 bytes
function qr(text) {
  const data = [...Buffer.from(text)];
  if (data.length > 106) throw new Error('qr: text too long');
  const bits = [];
  const put = (v, n) => { for (let i = n - 1; i >= 0; i--) bits.push(v >> i & 1); };
  put(4, 4); put(data.length, 8); data.forEach((b) => put(b, 8)); put(0, 4);
  while (bits.length % 8) bits.push(0);
  const cw = [];
  for (let i = 0; i < bits.length; i += 8) cw.push(parseInt(bits.slice(i, i + 8).join(''), 2));
  for (let p = 0; cw.length < 108; p ^= 1) cw.push(p ? 0x11 : 0xec);

  // reed-solomon: 26 error correction codewords over GF(256)
  const exp = [], log = [];
  for (let i = 0, x = 1; i < 255; i++) { exp[i] = x; log[x] = i; x = x << 1 ^ (x & 128 ? 0x11d : 0); }
  const mul = (a, b) => a && b ? exp[(log[a] + log[b]) % 255] : 0;
  let gen = [1];
  for (let i = 0; i < 26; i++) gen = [...gen, 0].map((g, j) => g ^ (j ? mul(gen[j - 1], exp[i]) : 0));
  const rem = [...cw, ...Array(26).fill(0)];
  for (let i = 0; i < 108; i++) { const f = rem[i]; if (f) for (let j = 0; j < 27; j++) rem[i + j] ^= mul(gen[j], f); }
  const all = [...cw, ...rem.slice(108)];

  // fixed patterns first (fn marks them so data and mask skip them)
  const n = 37, m = [...Array(n)].map(() => Array(n).fill(0)), fn = m.map((row) => row.map(() => false));
  const set = (r, c, v) => { m[r][c] = v ? 1 : 0; fn[r][c] = true; };
  for (const [r0, c0] of [[0, 0], [0, n - 7], [n - 7, 0]])
    for (let r = -1; r <= 7; r++) for (let c = -1; c <= 7; c++) {
      const ring = Math.max(Math.abs(r - 3), Math.abs(c - 3));
      if (r0 + r >= 0 && c0 + c >= 0 && r0 + r < n && c0 + c < n) set(r0 + r, c0 + c, ring !== 2 && ring !== 4);
    }
  for (let r = -2; r <= 2; r++) for (let c = -2; c <= 2; c++) set(30 + r, 30 + c, Math.max(Math.abs(r), Math.abs(c)) !== 1);
  for (let i = 8; i < n - 8; i++) { set(6, i, i % 2 === 0); set(i, 6, i % 2 === 0); }
  const fmt = 0b111011111000100, bit = (i) => fmt >> i & 1; // level L, mask 0
  for (let i = 0; i < 6; i++) set(i, 8, bit(i));
  set(7, 8, bit(6)); set(8, 8, bit(7)); set(8, 7, bit(8));
  for (let i = 9; i < 15; i++) set(8, 14 - i, bit(i));
  for (let i = 0; i < 8; i++) set(8, n - 1 - i, bit(i));
  for (let i = 8; i < 15; i++) set(n - 15 + i, 8, bit(i));
  set(n - 8, 8, 1);

  // data zigzags up and down two columns at a time from the bottom right
  let i = 0;
  for (let right = n - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let v = 0; v < n; v++) for (let j = 0; j < 2; j++) {
      const c = right - j, r = (right + 1) & 2 ? v : n - 1 - v;
      if (!fn[r][c] && i < all.length * 8) m[r][c] = all[i >> 3] >> (7 - (i & 7)) & 1, i++;
    }
  }
  let d = '';
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (m[r][c] ^ (!fn[r][c] && (r + c) % 2 === 0)) d += `M${c + 4} ${r + 4}h1v1h-1z`;
  return `<svg class="qr" viewBox="0 0 45 45" shape-rendering="crispEdges" role="img" aria-label="qr code"><rect width="45" height="45" fill="#fff"/><path d="${d}"/></svg>`;
}

// zero deps, like backup.js: on Cloud Run the metadata server hands out a token; locally set GCS_TOKEN to `gcloud auth print-access-token`
let token = { until: 0 };
async function gcs(name, body) {
  if (!process.env.GCS_TOKEN && Date.now() > token.until) {
    const t = await (await fetch('http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token', { headers: { 'Metadata-Flavor': 'Google' } })).json();
    token = { v: t.access_token, until: Date.now() + (t.expires_in - 300) * 1000 };
  }
  const o = encodeURIComponent(name), auth = { Authorization: `Bearer ${process.env.GCS_TOKEN || token.v}` };
  // ifGenerationMatch=0: a photo is never overwritten
  const r = body ? await fetch(`https://storage.googleapis.com/upload/storage/v1/b/${BUCKET}/o?uploadType=media&ifGenerationMatch=0&name=${o}`, { method: 'POST', headers: { ...auth, 'Content-Type': 'image/jpeg' }, body })
    : await fetch(`https://storage.googleapis.com/storage/v1/b/${BUCKET}/o/${o}?alt=media`, { headers: auth });
  if (!r.ok) throw new Error(`gcs ${r.status} ${name}`);
  return r;
}

async function serve(db) {
  const jobs = db.collection('jobs'), keys = db.collection('keys');
  await jobs.updateOne({ shop: true }, { $setOnInsert: { shop: true, todo: [], parts: [], notes: '', inAt: new Date(), doneAt: null } }, { upsert: true });
  const port = process.env.PORT || 3000;

  // keys barely change, so skip the db round trip for a minute (revoking a key takes up to a minute)
  const cache = new Map();
  const findKey = async (key) => {
    const hit = cache.get(key);
    if (hit && Date.now() - hit.at < 60000) return hit.k;
    const k = await keys.findOne({ key, scopes: 'shop' });
    if (k) cache.set(key, { k, at: Date.now() });
    return k;
  };

  http.createServer(async (req, res) => {
    try {
      const t0 = Date.now();
      const url = new URL(req.url, 'http://x');
      if (url.pathname === '/og-rush.png') return res.writeHead(200, { 'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=86400' }).end(ogImage);
      // phones ask for these on their own, even without the links in the page
      if (/^\/(icon-bars\.png|favicon\.ico|apple-touch-icon[\w-]*\.png)$/.test(url.pathname)) return res.writeHead(200, { 'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=86400' }).end(icon);
      const key = url.searchParams.get('key');
      const k = key && await findKey(key);
      if (!k) return res.writeHead(404).end();
      const admin = k.scopes.includes('admin'), manager = k.scopes.includes('manager');
      const c = { k, admin, manager, q: `?key=${k.key}`, t0, tab: 'jobs' };
      // everyone else only reaches the shop job and jobs assigned to their name
      const mine = manager ? {} : { $or: [{ shop: true }, { assignedTo: k.label }] };
      const [, route, id, sub] = url.pathname.split('/');
      const _id = /^[0-9a-f]{24}$/.test(id) && new ObjectId(id);

      // photos sit in the bucket as <db>/<job>/<id>.jpg and <id>-t.jpg (the small one); src keeps the db, so dev shows prod's copied photos.
      // you see a photo only if you see its job. names never get reused, so phones keep them for good
      if (route === 'photo' && _id && req.method === 'GET') {
        const [, pid, t = ''] = /^([0-9a-f]{8})(-t)?\.jpg$/.exec(sub) || [];
        const j = pid && await jobs.findOne({ _id, ...mine }, { projection: { photos: { $elemMatch: { id: pid } } } });
        if (!j || !j.photos) return res.writeHead(404).end();
        const r = await gcs(`${j.photos[0].src}${t}.jpg`);
        return res.writeHead(200, { 'Content-Type': 'image/jpeg', 'Cache-Control': 'private, max-age=31536000, immutable' }).end(Buffer.from(await r.arrayBuffer()));
      }
      // the phone sends the small jpeg then the big one in one body; x-thumb says where the small one ends
      if (route === 'job' && _id && sub === 'photo' && req.method === 'POST') {
        if (!await jobs.countDocuments({ _id, ...mine })) return res.writeHead(404).end();
        const chunks = [];
        let size = 0;
        for await (const chunk of req) if ((size += chunk.length) > 4e6) return res.writeHead(413).end(); else chunks.push(chunk);
        const all = Buffer.concat(chunks), n = +req.headers['x-thumb'], jpg = (b) => b.length > 3 && b[0] === 0xff && b[1] === 0xd8;
        const small = all.subarray(0, n), big = all.subarray(n);
        if (!jpg(small) || !jpg(big)) return res.writeHead(400).end();
        const pid = crypto.randomBytes(4).toString('hex'), src = `${process.env.MONGODB_DB}/${id}/${pid}`;
        await Promise.all([gcs(`${src}-t.jpg`, small), gcs(`${src}.jpg`, big)]);
        await jobs.updateOne({ _id }, { $push: { photos: { id: pid, src, by: k.label, at: new Date() } } });
        return res.writeHead(303, { Location: `/job/${id}${c.q}` }).end();
      }

      // nav badges: jobs opened in the last 24h, and parts still needed on open jobs
      const [fresh, [need]] = await Promise.all([
        jobs.countDocuments({ shop: false, doneAt: null, inAt: { $gt: new Date(Date.now() - 864e5) }, ...mine }),
        jobs.aggregate([{ $match: { doneAt: null, ...mine } }, { $unwind: '$parts' }, { $match: { 'parts.state': 'need' } }, { $count: 'n' }]).toArray(),
      ]);
      c.fresh = fresh;
      c.need = need ? need.n : 0;
      const back = (to) => res.writeHead(303, { Location: to + c.q }).end();
      res.setHeader('Content-Type', 'text/html; charset=utf-8');

      let f;
      if (req.method === 'POST') {
        const chunks = [];
        let size = 0;
        for await (const chunk of req) if ((size += chunk.length) > 60000) return res.writeHead(413).end(); else chunks.push(chunk);
        f = new URLSearchParams(Buffer.concat(chunks).toString('utf8'));
      }
      const text = (name) => (f.get(name) || '').trim().slice(0, name === 'notes' ? 10000 : 2000);
      const lines = (name) => text(name).split('\n').map((s) => s.trim()).filter(Boolean);
      const line = (kind, s) => ({ id: crypto.randomBytes(4).toString('hex'), text: s, ...(kind === 'todo' ? { done: false } : { state: 'need' }), createdBy: k.label });
      const set = {};
      if (f) for (const name of FIELDS) if (f.has(name) && (manager || !MANAGER_ONLY.includes(name))) set[name] = text(name);
      // in date: today means now; a past day means noon that day in shop time; unchanged or future is ignored
      const inDay = f && manager && f.get('in');
      if (/^\d{4}-\d{2}-\d{2}$/.test(inDay) && inDay !== f.get('in0') && inDay <= day(new Date()))
        set.inAt = inDay === day(new Date()) ? new Date() : new Date(`${inDay}T12:00:00-06:00`);
      if (f && manager && f.has('assignedTo')) set.assignedTo = text('assignedTo');

      if (route === '' || route === 'jobs') {
        c.sort = url.searchParams.get('sort') === 'new';
        c.f = bucket(url.searchParams.get('f'));
        const [open, done] = await Promise.all([
          jobs.find({ doneAt: null, ...mine }).sort({ shop: -1, inAt: c.sort ? -1 : 1 }).toArray(),
          c.f ? [] : jobs.find({ doneAt: { $ne: null }, ...mine }).sort({ doneAt: -1 }).limit(5).toArray(),
        ]);
        return res.end(list(c, c.f ? open.filter((j) => !j.shop && c.f.test(j)) : open, done));
      }
      if (route === 'backlog') {
        if (!manager) return res.writeHead(404).end();
        // every job open at some point in the last 90 days feeds the chart
        const all = await jobs.find({ shop: { $ne: true }, $or: [{ doneAt: null }, { doneAt: { $gte: new Date(Date.now() - 91 * 864e5) } }] }).sort({ inAt: 1 }).toArray();
        return res.end(backlogPage({ ...c, tab: 'backlog' }, all.filter((j) => !j.doneAt), all));
      }
      if (route === 'parts') {
        const state = PARTS.includes(url.searchParams.get('state')) ? url.searchParams.get('state') : '';
        const all = (await jobs.find({ doneAt: null, ...mine }).sort({ shop: -1, inAt: 1 }).toArray())
          .flatMap((j) => j.parts.map((p) => ({ j, p })))
          .sort((a, b) => PARTS.indexOf(a.p.state) - PARTS.indexOf(b.p.state));
        const counts = Object.fromEntries(PARTS.map((s) => [s, all.filter((r) => r.p.state === s).length]));
        const rows = state ? all.filter((r) => r.p.state === state) : all;
        rows.total = all.length;
        return res.end(partsPage({ ...c, tab: 'parts' }, rows, counts, state));
      }

      if (route === 'issues' && !id) {
        const issues = db.collection('issues'), theirs = admin ? {} : { changedBy: k.label };
        if (!f) {
          const [open, done] = await Promise.all([
            issues.find({ doneAt: null, ...theirs }).sort({ changedAt: -1 }).toArray(),
            issues.find({ doneAt: { $ne: null }, ...theirs }).sort({ doneAt: -1 }).limit(10).toArray(),
          ]);
          return res.end(issuesPage({ ...c, tab: 'issues' }, open, done));
        }
        const [op, arg, val] = (f.get('a') || '').split(':');
        // changedBy/changedAt is who wrote it, so meta() shows "who · when" like job lines
        if (op === 'add' && text('text')) await issues.insertOne({ text: text('text'), changedBy: k.label, changedAt: new Date(), doneAt: null });
        if (op === 'done' && admin && /^[0-9a-f]{24}$/.test(arg)) await issues.updateOne({ _id: new ObjectId(arg) }, { $set: { doneAt: val === '1' ? new Date() : null, doneBy: k.label } });
        return back('/issues');
      }

      const origin = `${req.headers['x-forwarded-proto'] || 'http'}://${req.headers.host}`;
      if (route === 'team') {
        if (!manager) return res.writeHead(404).end();
        // shop-only keys, newest first, one per name
        const people = new Map();
        for (const x of await keys.find({ scopes: { $all: ['shop'], $nin: ['manager', 'admin'] } }).sort({ createdAt: -1 }).toArray())
          if (!people.has(x.label)) people.set(x.label, `${origin}/jobs?key=${x.key}`);
        return res.end(teamPage({ ...c, tab: 'team' }, [...people].sort()));
      }

      if (route === 'keys') {
        if (!admin) return res.writeHead(404).end();
        if (!id) {
          if (!f) return res.end(keysPage({ ...c, tab: 'team' }, await keys.find().sort({ createdAt: 1 }).toArray()));
          if (f.get('a') !== 'add' || !text('label')) return back('/keys');
          const x = await addKey(db, text('label').slice(0, 40), [], k.label);
          return back(`/keys/${x._id}`);
        }
        if (!/^[0-9a-f]{24}$/.test(id)) return res.writeHead(404).end();
        const other = { _id: new ObjectId(id), key: { $ne: k.key } };
        if (f) {
          const [op, arg, val] = (f.get('a') || '').split(':');
          if (op === 'scope' && SCOPES.some(([s]) => s === arg)) await keys.updateOne(other, val === '1' ? { $addToSet: { scopes: arg } } : { $pull: { scopes: arg } });
          if (op === 'revoke') await keys.deleteOne(other);
          cache.clear();
          return back(op === 'revoke' ? '/keys' : `/keys/${id}`);
        }
        const x = await keys.findOne({ _id: other._id });
        const link = x && `${origin}/jobs?key=${x.key}`;
        return x ? res.end(keyPage({ ...c, tab: 'team' }, x, link)) : res.writeHead(404).end();
      }

      if (route === 'new') {
        if (!manager) return res.writeHead(404).end();
        if (!f) return res.end(newJob({ ...c, who: await keys.distinct('label', { scopes: { $all: ['shop', 'crew'] } }) }));
        const { insertedId } = await jobs.insertOne({ shop: false, todo: lines('todo').map((s) => line('todo', s)), parts: [], inAt: new Date(), ...set, doneAt: null, createdBy: k.label });
        return back(`/job/${insertedId}`);
      }

      if (route !== 'job' || !_id || sub) return res.writeHead(404).end();
      if (!f) {
        const [j, who] = await Promise.all([jobs.findOne({ _id, ...mine }), manager ? keys.distinct('label', { scopes: { $all: ['shop', 'crew'] } }) : []]);
        return j ? res.end(job({ ...c, id, who }, j)) : res.writeHead(404).end();
      }

      // change only the one line or field, by id, so two people tapping at once don't overwrite each other
      const [op, arg, val] = (f.get('a') || '').split(':');
      const lid = /^[0-9a-f]{8}$/.test(arg) ? arg : null;
      let filter = { _id }, update;
      if (op === 'todo' && lid) [filter, update] = [{ _id, 'todo.id': lid }, { $set: { 'todo.$.done': val === '1', 'todo.$.changedBy': k.label, 'todo.$.changedAt': new Date() } }];
      else if (op === 'part' && lid && PARTS.includes(val)) [filter, update] = [{ _id, 'parts.id': lid }, { $set: { 'parts.$.state': val, 'parts.$.changedBy': k.label, 'parts.$.changedAt': new Date() } }];
      else if (op === 'rmtodo' && lid) update = { $pull: { todo: { id: lid } } };
      else if (op === 'rmpart' && lid) update = { $pull: { parts: { id: lid } } };
      // only off the job; the files stay in the bucket, so a mis-tap can be undone by hand
      else if (op === 'rmphoto' && lid) update = { $pull: { photos: { id: lid } } };
      else if (op === 'add' && (arg === 'todo' || arg === 'part')) update = { $push: { [arg === 'todo' ? 'todo' : 'parts']: { $each: lines('text').map((s) => line(arg, s)) } } };
      else if (op === 'assign' && manager) [filter, update] = [{ _id, shop: false }, { $set: { assignedTo: f.get('a').slice(7, 47) } }];
      else if (op === 'save' && Object.keys(set).length) update = { $set: set };
      else if (op === 'done') [filter, update] = [{ _id, shop: false }, { $set: { ...set, doneAt: arg === '1' ? new Date() : null } }];
      if (update) await jobs.updateOne({ ...filter, ...mine }, update);
      if (f.get('to') === 'parts') return res.writeHead(303, { Location: `/parts${c.q}${PARTS.includes(f.get('state')) ? `&state=${f.get('state')}` : ''}` }).end();
      back(op === 'done' && arg === '1' ? '/jobs' : `/job/${id}`);
    } catch (e) {
      console.error(e);
      res.writeHead(500).end();
    }
  }).listen(port, () => console.log(`serving on port ${port}`));
}

async function addKey(db, label, extra, by) {
  const keys = db.collection('keys');
  await keys.createIndex({ key: 1 }, { unique: true });
  const k = { key: crypto.randomBytes(16).toString('hex'), label, scopes: [...new Set(['shop', ...extra])], createdAt: new Date(), ...(by && { createdBy: by }) };
  await keys.insertOne(k);
  return k;
}

if (!process.env.MONGODB_URI || !process.env.MONGODB_DB) {
  console.error('set MONGODB_URI and MONGODB_DB');
  process.exit(1);
}
const client = new MongoClient(process.env.MONGODB_URI, { minPoolSize: 2 }); // warm connections so parallel queries skip the handshake
const db = client.db(process.env.MONGODB_DB);
const [cmd, arg, ...extra] = process.argv.slice(2);
(cmd === 'key' && arg ? addKey(db, arg, extra.filter((x) => SCOPES.some(([s]) => s === x))).then((k) => console.log(`${k.label}: /?key=${k.key}`)).finally(() => client.close()) : serve(db))
  .catch((e) => { console.error(e.message || e); process.exitCode = 1; client.close(); });
