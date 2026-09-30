// node serve.js              start the server
// node serve.js key "<name>" [manager] [admin] [ebay]  print a new key link for someone
//   manager: sees all jobs, assigns and adds them. admin: the keys tab. neither: only jobs assigned to that name
const crypto = require('crypto');
const fs = require('fs');
const http = require('http');
const path = require('path');
const { MongoClient, ObjectId } = require('mongodb');

const env = path.join(__dirname, '.env');
if (fs.existsSync(env)) process.loadEnvFile(env);

const FIELDS = ['machine', 'customer', 'phone', 'quote', 'notes'];
const PARTS = ['need', 'ordered', 'in'];
const COLOR = { need: 'm', ordered: 'y', in: 'c' };
const REV = process.env.K_REVISION || 'local';
const ogImage = fs.readFileSync(path.join(__dirname, 'og-rush.png'));

const css = `
:root{color-scheme:light;--bg:#fbfaf7;--fg:#1d1d1d;--dim:#858585;--line:#e4e2dc;--y:#a87600;--c:#0a8f9c;--m:#c8177a;--card:#fff;--s1:4px;--s2:8px;--s3:16px;--s4:24px}
*{box-sizing:border-box}
html{-webkit-text-size-adjust:100%;text-size-adjust:100%}
body{margin:0;overflow-wrap:anywhere;background:var(--bg);color:var(--fg);font:13px/1.6 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace}
main{max-width:44rem;margin:0 auto;padding:var(--s4) var(--s3) 80px}
a{color:inherit;text-decoration:none}
.y{color:var(--y)}.c{color:var(--c)}.m{color:var(--m)}.dim{color:var(--dim)}
h1{margin:0;font-size:1.3rem}
nav{position:relative;display:flex;gap:var(--s4);margin:var(--s2) 0 var(--s3);border-bottom:1px solid var(--line)}
nav a{padding:12px 0;color:var(--dim)}
nav a.on{color:var(--fg);border-bottom:2px solid var(--c)}
nav sup{color:var(--m);font-size:10px}
h3{margin:var(--s4) 0 var(--s2);font-size:13px;font-weight:normal;color:var(--dim)}
.cards{display:grid;gap:var(--s2);margin-top:var(--s3)}
.card{position:relative;display:block;padding:var(--s3);background:var(--card);border:1px solid var(--line);border-radius:8px}
.card.shop{border-left:4px solid var(--c)}
.card .top{display:flex;justify-content:space-between;gap:var(--s2)}
.card .top span{white-space:nowrap}
section.card{margin-top:var(--s3)}
.card>form:first-child>h3:first-child,.card>h3:first-child{margin-top:0}
ul{list-style:none;margin:0;padding:0}
li{display:flex;align-items:baseline;gap:1ch;padding:12px 0;border-bottom:1px solid var(--line);transition:opacity .2s}
li>span{flex:1}
li>a{flex:1;padding:12px 0;margin:-12px 0}
.qr{display:block;width:220px;max-width:100%;margin:var(--s2) 0 var(--s3)}
.who{font-size:1.3rem}
.meta{color:var(--dim);font-size:12px;white-space:nowrap}
.done>span{color:var(--dim);text-decoration:line-through}
label{display:block;margin-top:var(--s3);color:var(--dim)}
input,textarea,select{display:block;width:100%;padding:var(--s2) 0;background:none;color:var(--fg);font:inherit;font-size:16px;border:0;border-bottom:1px solid var(--line);caret-color:var(--c)}
textarea{resize:vertical}
input:focus,textarea:focus,select:focus{outline:0;border-color:var(--c)}
button,.btn{display:inline-block;padding:12px var(--s3);background:none;color:var(--c);font:inherit;font-size:13px;border:1px solid var(--c);border-radius:4px;cursor:pointer}
li button{padding:12px;margin:-12px;border:0;white-space:nowrap}
button.x{color:var(--dim);padding:12px 18px;margin:-12px -16px -12px -10px}
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
nav>.spin{position:absolute;right:0;top:100%;margin-top:var(--s1);line-height:1}
.card>.spin{position:absolute;right:var(--s3);bottom:3px;line-height:1}
.spin i{font-style:normal;animation:flick .5s steps(1) infinite}
.spin i+i{animation-duration:.7s}
.spin i+i+i{animation-duration:1.1s}
@keyframes flick{50%{opacity:.15}}
@media (prefers-reduced-motion:reduce){.spin i{animation:none}}
#status{position:fixed;left:50%;bottom:var(--s3);transform:translateX(-50%);padding:var(--s1) var(--s3);background:var(--bg);border:1px solid var(--line);border-radius:4px;font-size:13px;white-space:nowrap}
#status:empty{display:none}
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
    if (a && !busy && !e.ctrlKey && !e.metaKey && !e.shiftKey) start((m) => a.closest('nav') ? a.closest('nav').append(m) : a.append(' ', m));
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
    const mark = start((m) => x ? x.before(m) : row ? row.append(m) : form.querySelector('button').parentNode.append(m));
    const t = performance.now();
    try {
      const r = await fetch(form.action, { method: 'POST', body });
      if (!r.ok) throw new Error(r.status);
      const doc = new DOMParser().parseFromString(await r.text(), 'text/html');
      $('main').replaceWith(doc.querySelector('main'));
      document.title = doc.title;
      if (r.url !== location.href) history.replaceState(null, '', r.url);
      fit();
      status(`✓ saved <span class="dim">${Math.round(performance.now() - t)}ms</span>`, 'ok');
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
<meta name="twitter:card" content="summary_large_image"><style>${css}</style><main>
<h1>Rush Powersports</h1>
<nav>${[['jobs', '/jobs', ''], ...(c.k.scopes.includes('ebay') ? [['ebay', '/ebay', ' <sup>soon</sup>']] : []), ...(c.manager ? [['team', '/team', '']] : []), ...(c.admin ? [['keys', '/keys', '']] : [])]
    .map(([t, href, sup]) => `<a href="${href}${c.q}"${c.tab === t ? ' class="on"' : ''}>${t}${sup}</a>`).join('')}</nav>
${body}
<footer><div>${logo} <b>Resource Automation</b></div>
<div>user ${esc(c.k.label)} · key …${c.k.key.slice(-4)}${c.id ? ` · job …${String(c.id).slice(-6)}` : ''}</div>
<div>db ${esc(process.env.MONGODB_DB)} · server ${Date.now() - c.t0}ms · rev ${esc(REV)} · up ${Math.round(process.uptime() / 60)}m · net <span id="net">?</span></div>
</footer></main><div id="status"></div><script>(${browser})()</script>
<script type="speculationrules">{"prefetch":[{"where":{"href_matches":"/*"},"eagerness":"conservative"}]}</script>`;

const nextPart = (s) => PARTS[(PARTS.indexOf(s) + 1) % PARTS.length];
const day = (d) => d.toLocaleDateString('en-CA', { timeZone: 'America/Chicago' });
// calendar days between two dates in shop time: "today", "1 day", "6 days"
const days = (from, to) => { const n = Math.round((Date.parse(day(to)) - Date.parse(day(from))) / 864e5); return n < 1 ? 'today' : n === 1 ? '1 day' : `${n} days`; };
const ago = (d) => { const m = (Date.now() - d) / 60000; return m < 1 ? 'now' : m < 60 ? `${m | 0}m` : m < 1440 ? `${m / 60 | 0}h` : `${m / 1440 | 0}d`; };
// hidden until the browser checks it fits beside the text (fit() in browser())
const meta = (l) => l.changedBy ? `<small class="meta" hidden>${esc(l.changedBy)} · ${ago(l.changedAt)}</small>` : '';

// no name field: machine · customer, or the id's tail when both are blank
const name = (j) => j.shop ? 'Shop' : [j.machine, j.customer].filter(Boolean).join(' · ') || `job …${String(j._id).slice(-4)}`;

const card = (c, j) => {
  const sub = [j.machine && j.customer, c.manager && !j.shop && (j.assignedTo || 'nobody assigned')].filter(Boolean).join(' · ');
  const need = j.parts.filter((p) => p.state === 'need').length;
  const next = j.todo.find((t) => !t.done);
  const done = j.todo.filter((t) => t.done).length;
  return `<a class="card${j.shop ? ' shop' : ''}" href="/job/${j._id}${c.q}"><div class="top"><b>${esc(j.machine || name(j))}</b>${j.todo.length ? `<span class="${done === j.todo.length ? 'c' : 'dim'}">${done}/${j.todo.length} ✓</span>` : ''}</div>
${sub ? `<div class="dim">${esc(sub)}</div>` : ''}<div>${need ? `<span class="m">${need} part${need > 1 ? 's' : ''} needed</span> · ` : ''}${next ? esc(next.text) : '<span class="dim">nothing left to do</span>'}</div></a>`;
};

const list = (c, open, done) => page(c, 'Rush Powersports', `${c.manager ? `<a class="btn" href="/new${c.q}">+ new job</a>` : ''}
<div class="cards">${open.map((j) => card(c, j)).join('\n')}</div>
${done.length ? `<h3># recently done</h3><div class="cards">${done.map((j) => card(c, j)).join('\n')}</div>` : ''}`);

const soon = (c) => page(c, 'Coming soon', '<p class="dim"># coming soon</p>');

const fields = (j = {}) => j.shop ? '' : `<label>machine (year make model)<input name="machine" maxlength="2000" value="${esc(j.machine)}"></label>
<label>customer<input name="customer" maxlength="2000" value="${esc(j.customer)}"></label>
<label>phone<input name="phone" type="tel" maxlength="2000" value="${esc(j.phone)}"></label>
<label>quote<input name="quote" maxlength="2000" value="${esc(j.quote)}"></label>`;

// managers pick from key labels; keep the current name even if its key was revoked
const assign = (c, j = {}) => c.manager && !j.shop ? `<label>assigned to<select name="assignedTo"><option value="">nobody</option>${[...new Set([...c.who, j.assignedTo].filter(Boolean))]
  .map((w) => `<option${w === j.assignedTo ? ' selected' : ''}>${esc(w)}</option>`).join('')}</select></label>` : '';

const newJob = (c) => page(c, 'New job', `<b>new job</b>
<form method="post" action="/new${c.q}">${fields()}${assign(c)}
<label>what they want done (one per line)<textarea name="todo" rows="4" maxlength="2000" placeholder="won&#39;t start&#10;new tires"></textarea></label>
<div class="row"><button>save</button></div></form>`);

const job = (c, j) => {
  const act = `method="post" action="/job/${j._id}${c.q}"`;
  // buttons send the state they are asking for, so a repeat or stale tap can't flip the wrong way
  return page(c, name(j), `<b>${esc(name(j))}</b>
${j.shop ? '' : `<div class="dim">${j.phone ? `<a class="c" href="tel:${esc(j.phone)}">${esc(j.phone)}</a> · ` : ''}in ${day(j.inAt)} (${days(j.inAt, j.doneAt || new Date())})${j.quote ? ` · quoted ${esc(j.quote)}` : ''}${j.doneAt ? ` · <span class="y">done</span>` : ''}</div>`}
<section class="card"><form ${act}>
<h3># to do</h3><ul>${j.todo.map((t) => `<li class="${t.done ? 'done' : ''}"><button name="a" value="todo:${t.id}:${t.done ? 0 : 1}" data-next="${t.done ? '[ ]' : '[x]'}">${t.done ? '[x]' : '[ ]'}</button><span>${esc(t.text)}</span>${meta(t)}<button class="x" name="a" value="rmtodo:${t.id}">×</button>`).join('')}</ul>
<h3># parts</h3><ul>${j.parts.map((p) => `<li><button name="a" value="part:${p.id}:${nextPart(p.state)}" class="${COLOR[p.state]}" data-next="[${nextPart(p.state)}]" data-cls="${COLOR[nextPart(p.state)]}">[${p.state}]</button><span>${esc(p.text)}</span>${meta(p)}<button class="x" name="a" value="rmpart:${p.id}">×</button>`).join('')}</ul>
</form>
<form ${act}><h3># add</h3><textarea name="text" rows="2" maxlength="2000" aria-label="add" placeholder="type it, then tap + to do or + part&#10;one per line adds several"></textarea>
<div class="row"><button name="a" value="add:todo">+ to do</button><button name="a" value="add:part">+ part</button></div></form></section>
<section class="card"><form ${act}><h3># details</h3>${fields(j)}${assign(c, j)}
<label>notes<textarea name="notes" rows="4" maxlength="10000">${esc(j.notes)}</textarea></label>
<div class="row"><button name="a" value="save">save</button>${j.shop ? '' : `<button name="a" value="done:${j.doneAt ? 0 : 1}">${j.doneAt ? 'reopen' : 'mark done'}</button>`}</div></form></section>`);
};

// just a name and a code per person, no link to copy or tap, so nobody shares the wrong one or opens it as someone else
const teamPage = (c, people) => page(c, 'Team', `<p class="dim">have them scan their code with their phone camera.</p>
${people.map(([who, link]) => `<section class="card"><b class="who">${esc(who)}</b>${qr(link)}</section>`).join('\n') || '<p class="dim"># no one to show yet</p>'}`);

const SCOPES = [['shop', 'can open the app'], ['manager', 'sees all jobs, assigns and adds them'], ['admin', 'this keys tab'], ['ebay', 'the ebay tab (coming soon)']];

const keysPage = (c, all) => page(c, 'Keys', `<form method="post" action="/keys${c.q}"><label>name<input name="label" maxlength="40" placeholder="Brad"></label>
<div class="row"><button name="a" value="add:shop">+ key</button><button name="a" value="add:manager">+ manager key</button></div>
<p class="dim">manager keys see all jobs, assign and add them. other keys only see jobs assigned to that name.</p></form>
<h3># keys</h3><ul>${all.map((x) => `<li><a href="/keys/${x._id}${c.q}">${esc(x.label)}${x.scopes.filter((s) => s !== 'shop').map((s) => ` <span class="y">${esc(s)}</span>`).join('')}${x.scopes.includes('shop') ? '' : ' <span class="m">off</span>'} <span class="dim">…${x.key.slice(-4)}${x.key === c.k.key ? ' · you' : ''}</span></a></li>`).join('')}</ul>`);

// your own key can't be changed here, so you can't lock yourself out
const keyPage = (c, x, link) => {
  const own = x.key === c.k.key;
  return page(c, `${x.label}'s key`, `<b>${esc(x.label)}</b>
<div class="dim">key …${x.key.slice(-4)} · made ${day(x.createdAt)}${x.createdBy ? ` by ${esc(x.createdBy)}` : ''}</div>
<section class="card"><h3># scan to open jobs</h3>${qr(link)}<a class="c" href="${esc(link)}" target="_blank" rel="noopener">${esc(link)}</a>
<div class="row"><button type="button" data-copy="${esc(x.key)}">copy key</button></div>
<p class="dim">anyone with this link gets in with these scopes.</p></section>
<section class="card"><form method="post" action="/keys/${x._id}${c.q}"><h3># scopes</h3><ul>${SCOPES.map(([s, what]) => {
    const on = x.scopes.includes(s);
    return `<li><button name="a" value="scope:${s}:${on ? 0 : 1}" data-next="${on ? '[ ]' : '[x]'}"${own ? ' disabled' : ''}>${on ? '[x]' : '[ ]'}</button><span>${s} <span class="dim">${what}</span></span></li>`;
  }).join('')}</ul></form></section>
${own ? '<p class="dim">this is your key, so it can&#39;t be changed or revoked here.</p>'
    : `<form method="post" action="/keys/${x._id}${c.q}"><div class="row"><button name="a" value="revoke">revoke key</button></div></form>`}`);
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
      const key = url.searchParams.get('key');
      const k = key && await findKey(key);
      if (!k) return res.writeHead(404).end();
      const admin = k.scopes.includes('admin'), manager = k.scopes.includes('manager');
      const c = { k, admin, manager, q: `?key=${k.key}`, t0, tab: 'jobs' };
      // everyone else only reaches the shop job and jobs assigned to their name
      const mine = manager ? {} : { $or: [{ shop: true }, { assignedTo: k.label }] };
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
      if (f) for (const name of FIELDS) if (f.has(name)) set[name] = text(name);
      if (f && manager && f.has('assignedTo')) set.assignedTo = text('assignedTo');
      const [, route, id] = url.pathname.split('/');

      if (route === '' || route === 'jobs') {
        const [open, done] = await Promise.all([
          jobs.find({ doneAt: null, ...mine }).sort({ shop: -1, inAt: 1 }).toArray(),
          jobs.find({ doneAt: { $ne: null }, ...mine }).sort({ doneAt: -1 }).limit(5).toArray(),
        ]);
        return res.end(list(c, open, done));
      }
      if (route === 'ebay' && c.k.scopes.includes('ebay')) return res.end(soon({ ...c, tab: 'ebay' }));

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
          if (!f) return res.end(keysPage({ ...c, tab: 'keys' }, await keys.find().sort({ createdAt: 1 }).toArray()));
          const [op, arg] = (f.get('a') || '').split(':');
          if (op !== 'add' || !text('label')) return back('/keys');
          const x = await addKey(db, text('label').slice(0, 40), arg === 'manager' ? ['manager'] : [], k.label);
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
        return x ? res.end(keyPage({ ...c, tab: 'keys' }, x, link)) : res.writeHead(404).end();
      }

      if (route === 'new') {
        if (!manager) return res.writeHead(404).end();
        if (!f) return res.end(newJob({ ...c, who: await keys.distinct('label') }));
        const { insertedId } = await jobs.insertOne({ shop: false, ...set, todo: lines('todo').map((s) => line('todo', s)), parts: [], inAt: new Date(), doneAt: null, createdBy: k.label });
        return back(`/job/${insertedId}`);
      }

      if (route !== 'job' || !/^[0-9a-f]{24}$/.test(id)) return res.writeHead(404).end();
      const _id = new ObjectId(id);
      if (!f) {
        const [j, who] = await Promise.all([jobs.findOne({ _id, ...mine }), manager ? keys.distinct('label') : []]);
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
      else if (op === 'add' && (arg === 'todo' || arg === 'part')) update = { $push: { [arg === 'todo' ? 'todo' : 'parts']: { $each: lines('text').map((s) => line(arg, s)) } } };
      else if (op === 'save' && Object.keys(set).length) update = { $set: set };
      else if (op === 'done') [filter, update] = [{ _id, shop: false }, { $set: { ...set, doneAt: arg === '1' ? new Date() : null } }];
      if (update) await jobs.updateOne({ ...filter, ...mine }, update);
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
