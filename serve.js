// node serve.js              start the server
// node serve.js key "<name>"  print a new key link for someone
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
body{margin:0;overflow-wrap:anywhere;background:var(--bg);color:var(--fg);font:15px/1.6 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace}
main{max-width:44rem;margin:0 auto;padding:var(--s4) var(--s3) 80px}
a{color:inherit;text-decoration:none}
.y{color:var(--y)}.c{color:var(--c)}.m{color:var(--m)}.dim{color:var(--dim)}
h1{margin:0;font-size:1.3rem}
nav{display:flex;gap:var(--s4);margin:var(--s2) 0 var(--s3);border-bottom:1px solid var(--line)}
nav a{padding:10px 0;color:var(--dim)}
nav a.on{color:var(--fg);border-bottom:2px solid var(--c)}
nav sup{color:var(--m);font-size:10px}
h3{margin:var(--s4) 0 var(--s2);font-size:15px;font-weight:normal;color:var(--dim)}
.cards{display:grid;gap:var(--s2);margin-top:var(--s3)}
.card{display:block;padding:var(--s3);background:var(--card);border:1px solid var(--line);border-radius:8px}
.card.shop{border-left:4px solid var(--c)}
.card .top{display:flex;justify-content:space-between;gap:var(--s2)}
.card .top span{white-space:nowrap}
ul{list-style:none;margin:0;padding:0}
li{display:flex;align-items:baseline;gap:1ch;padding:10px 0;border-bottom:1px solid var(--line);transition:opacity .2s}
li>span{flex:1}
.meta{color:var(--dim);font-size:12px;white-space:nowrap}
.done>span{color:var(--dim);text-decoration:line-through}
label{display:block;margin-top:var(--s3);color:var(--dim)}
input,textarea{display:block;width:100%;padding:var(--s2) 0;background:none;color:var(--fg);font:inherit;font-size:16px;border:0;border-bottom:1px solid var(--line);caret-color:var(--c)}
textarea{resize:vertical}
input:focus,textarea:focus{outline:0;border-color:var(--c)}
button,.btn{display:inline-block;padding:10px var(--s3);background:none;color:var(--c);font:inherit;font-size:15px;border:1px solid var(--c);border-radius:4px;cursor:pointer}
li button{padding:10px;margin:-10px;border:0;white-space:nowrap}
button.x{color:var(--dim);padding:10px 18px;margin:-10px -16px -10px -10px}
.row{display:flex;gap:var(--s2);margin-top:var(--s3);flex-wrap:wrap}
.pending{opacity:.5}
li.gone{opacity:.25}
body.busy button{cursor:progress}
footer{margin-top:48px;padding-top:var(--s3);border-top:1px solid var(--line);color:var(--dim);font-size:12px}
footer b{color:var(--fg);font-weight:normal}
#logo i{font-style:normal}
.spin{font-style:normal;color:var(--c)}
#logo .m{color:#ff3fb4}#logo .y{color:#f2b705}#logo .c{color:#12b5c4}
#status{position:fixed;left:50%;bottom:var(--s3);transform:translateX(-50%);padding:var(--s1) var(--s3);background:var(--bg);border:1px solid var(--line);border-radius:4px;font-size:13px;white-space:nowrap}
#status:empty{display:none}
#status.ok{color:var(--c)}#status.err{color:var(--m)}`;

// runs in the browser: instant feedback on tap, then a second step once the db answers
function browser() {
  const $ = (s) => document.querySelector(s);
  const SPIN = '⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏';
  const still = matchMedia('(prefers-reduced-motion:reduce)').matches;
  let busy = false, timer = 0, shown = 0;

  // one timer, only running while something is saving or loading
  const start = (at) => {
    const mark = document.createElement('i');
    mark.className = 'spin';
    mark.textContent = SPIN[0];
    at(mark);
    busy = true;
    document.body.classList.add('busy');
    let f = 0;
    if (!still) timer = setInterval(() => document.querySelectorAll('.spin').forEach((el) => el.textContent = SPIN[++f % SPIN.length]), 100);
    return mark;
  };
  const stop = () => { busy = false; clearInterval(timer); document.body.classList.remove('busy'); };

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
    if (a && !busy && !e.ctrlKey && !e.metaKey && !e.shiftKey) start((m) => a.append(' ', m));
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
    const mark = start((m) => row ? row.querySelector('.x').before(m) : form.querySelector('button').parentNode.append(m));
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
const page = (c, title, body) => `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title>
<meta property="og:title" content="Rush Powersports">
<meta property="og:description" content="Shop jobs, parts and status.">
<meta property="og:site_name" content="rush.rxtm.net">
<meta property="og:image" content="https://rush.rxtm.net/og-rush.png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image"><style>${css}</style><main>
<h1>Rush Powersports</h1>
<nav>${[['jobs', '/jobs', ''], ['ebay', '/ebay', ' <sup>soon</sup>'], ['tires', '/tires', ' <sup>soon</sup>']]
    .map(([t, href, sup]) => `<a href="${href}${c.q}"${c.tab === t ? ' class="on"' : ''}>${t === 'tires' ? 'tire shop' : t}${sup}</a>`).join('')}</nav>
${body}
<footer><div>${logo} <b>Resource Automation</b></div>
<div>user ${esc(c.k.label)} · key …${c.k.key.slice(-4)}${c.id ? ` · job …${String(c.id).slice(-6)}` : ''}</div>
<div>db ${esc(process.env.MONGODB_DB)} · server ${Date.now() - c.t0}ms · rev ${esc(REV)} · up ${Math.round(process.uptime() / 60)}m · net <span id="net">?</span></div>
</footer></main><div id="status"></div><script>(${browser})()</script>
<script type="speculationrules">{"prefetch":[{"where":{"href_matches":"/*"},"eagerness":"conservative"}]}</script>`;

const nextPart = (s) => PARTS[(PARTS.indexOf(s) + 1) % PARTS.length];
const day = (d) => d.toLocaleDateString('en-CA', { timeZone: 'America/Chicago' });
const ago = (d) => { const m = (Date.now() - d) / 60000; return m < 1 ? 'now' : m < 60 ? `${m | 0}m` : m < 1440 ? `${m / 60 | 0}h` : `${m / 1440 | 0}d`; };
// hidden until the browser checks it fits beside the text (fit() in browser())
const meta = (l) => l.changedBy ? `<small class="meta" hidden>${esc(l.changedBy)} · ${ago(l.changedAt)}</small>` : '';

// no name field: machine · customer, or the id's tail when both are blank
const name = (j) => j.shop ? 'Shop' : [j.machine, j.customer].filter(Boolean).join(' · ') || `job …${String(j._id).slice(-4)}`;

const card = (j, q) => {
  const need = j.parts.filter((p) => p.state === 'need').length;
  const next = j.todo.find((t) => !t.done);
  const done = j.todo.filter((t) => t.done).length;
  return `<a class="card${j.shop ? ' shop' : ''}" href="/job/${j._id}${q}"><div class="top"><b>${esc(j.machine || name(j))}</b>${j.todo.length ? `<span class="dim">${done}/${j.todo.length} ✓</span>` : ''}</div>
${j.machine && j.customer ? `<div class="dim">${esc(j.customer)}</div>` : ''}<div>${need ? `<span class="m">${need} part${need > 1 ? 's' : ''} needed</span> · ` : ''}${next ? esc(next.text) : '<span class="dim">nothing left to do</span>'}</div></a>`;
};

const list = (c, open, done) => page(c, 'Rush Powersports', `<a class="btn" href="/new${c.q}">+ new job</a>
<div class="cards">${open.map((j) => card(j, c.q)).join('\n')}</div>
${done.length ? `<h3># recently done</h3><div class="cards">${done.map((j) => card(j, c.q)).join('\n')}</div>` : ''}`);

const soon = (c) => page(c, 'Coming soon', '<p class="dim"># coming soon</p>');

const fields = (j = {}) => j.shop ? '' : `<label>machine (year make model)<input name="machine" maxlength="2000" value="${esc(j.machine)}"></label>
<label>customer<input name="customer" maxlength="2000" value="${esc(j.customer)}"></label>
<label>phone<input name="phone" type="tel" maxlength="2000" value="${esc(j.phone)}"></label>
<label>quote<input name="quote" maxlength="2000" value="${esc(j.quote)}"></label>`;

const newJob = (c) => page(c, 'New job', `<b>new job</b>
<form method="post" action="/new${c.q}">${fields()}
<label>what they want done (one per line)<textarea name="todo" rows="4" maxlength="2000" placeholder="won&#39;t start&#10;new tires"></textarea></label>
<div class="row"><button>save</button></div></form>`);

const job = (c, j) => {
  const act = `method="post" action="/job/${j._id}${c.q}"`;
  // buttons send the state they are asking for, so a repeat or stale tap can't flip the wrong way
  return page(c, name(j), `<b>${esc(name(j))}</b>
${j.shop ? '' : `<div class="dim">${j.phone ? `<a class="c" href="tel:${esc(j.phone)}">${esc(j.phone)}</a> · ` : ''}in ${day(j.inAt)}${j.quote ? ` · quoted ${esc(j.quote)}` : ''}${j.doneAt ? ` · <span class="y">done</span>` : ''}</div>`}
<form ${act}>
<h3># to do</h3><ul>${j.todo.map((t) => `<li class="${t.done ? 'done' : ''}"><button name="a" value="todo:${t.id}:${t.done ? 0 : 1}" data-next="${t.done ? '[ ]' : '[x]'}">${t.done ? '[x]' : '[ ]'}</button><span>${esc(t.text)}</span>${meta(t)}<button class="x" name="a" value="rmtodo:${t.id}">×</button>`).join('')}</ul>
<h3># parts</h3><ul>${j.parts.map((p) => `<li><button name="a" value="part:${p.id}:${nextPart(p.state)}" class="${COLOR[p.state]}" data-next="[${nextPart(p.state)}]" data-cls="${COLOR[nextPart(p.state)]}">[${p.state}]</button><span>${esc(p.text)}</span>${meta(p)}<button class="x" name="a" value="rmpart:${p.id}">×</button>`).join('')}</ul>
</form>
<form ${act}><label>add<textarea name="text" rows="2" maxlength="2000" placeholder="type it, then tap + to do or + part&#10;one per line adds several"></textarea></label>
<div class="row"><button name="a" value="add:todo">+ to do</button><button name="a" value="add:part">+ part</button></div></form>
<form ${act}><h3># details</h3>${fields(j)}
<label>notes<textarea name="notes" rows="4" maxlength="10000">${esc(j.notes)}</textarea></label>
<div class="row"><button name="a" value="save">save</button>${j.shop ? '' : `<button name="a" value="done:${j.doneAt ? 0 : 1}">${j.doneAt ? 'reopen' : 'mark done'}</button>`}</div></form>`);
};

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
      const c = { k, q: `?key=${k.key}`, t0, tab: 'jobs' };
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
      const [, route, id] = url.pathname.split('/');

      if (route === '' || route === 'jobs') {
        const [open, done] = await Promise.all([
          jobs.find({ doneAt: null }).sort({ shop: -1, inAt: 1 }).toArray(),
          jobs.find({ doneAt: { $ne: null } }).sort({ doneAt: -1 }).limit(5).toArray(),
        ]);
        return res.end(list(c, open, done));
      }
      if (route === 'ebay') return res.end(soon({ ...c, tab: 'ebay' }));
      if (route === 'tires') return res.end(soon({ ...c, tab: 'tires' }));

      if (route === 'new') {
        if (!f) return res.end(newJob(c));
        const { insertedId } = await jobs.insertOne({ shop: false, ...set, todo: lines('todo').map((s) => line('todo', s)), parts: [], inAt: new Date(), doneAt: null, createdBy: k.label });
        return back(`/job/${insertedId}`);
      }

      if (route !== 'job' || !/^[0-9a-f]{24}$/.test(id)) return res.writeHead(404).end();
      const _id = new ObjectId(id);
      if (!f) {
        const j = await jobs.findOne({ _id });
        return j ? res.end(job({ ...c, id }, j)) : res.writeHead(404).end();
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
      if (update) await jobs.updateOne(filter, update);
      back(op === 'done' && arg === '1' ? '/jobs' : `/job/${id}`);
    } catch (e) {
      console.error(e);
      res.writeHead(500).end();
    }
  }).listen(port, () => console.log(`serving on port ${port}`));
}

async function addKey(db, label) {
  const keys = db.collection('keys');
  await keys.createIndex({ key: 1 }, { unique: true });
  const key = crypto.randomBytes(16).toString('hex');
  await keys.insertOne({ key, label, scopes: ['shop'], createdAt: new Date() });
  console.log(`${label}: /?key=${key}`);
}

if (!process.env.MONGODB_URI || !process.env.MONGODB_DB) {
  console.error('set MONGODB_URI and MONGODB_DB');
  process.exit(1);
}
const client = new MongoClient(process.env.MONGODB_URI, { minPoolSize: 2 }); // warm connections so parallel queries skip the handshake
const db = client.db(process.env.MONGODB_DB);
const [cmd, arg] = process.argv.slice(2);
(cmd === 'key' && arg ? addKey(db, arg).finally(() => client.close()) : serve(db))
  .catch((e) => { console.error(e.message || e); process.exitCode = 1; client.close(); });
