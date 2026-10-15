// html for every page. the full app shell (tabs, home screen polish) comes later; this carries v1's paper look
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { ROLES, showPhone, can } = require('./auth');

const REV = process.env.K_REVISION || 'local';

// anything but prod gets the dark DEV icon and "Rush (dev)" name, so a home screen can hold both without mixing them up.
// the name shows under the home screen icon and in the tab
const live = process.env.MONGODB_DB === 'prod';
const APP = live ? 'Rush' : 'Rush (dev)';
// links carry a fingerprint of the file, so a phone that kept an old icon or manifest fetches the new one
const v = (b) => crypto.createHash('sha256').update(b).digest('hex').slice(0, 8);
const icon = fs.readFileSync(path.join(__dirname, live ? 'icon-bars.png' : 'icon-dev.png'));
const iconUrl = `/icon.png?v=${v(icon)}`;
const manifest = JSON.stringify({ ...require('./manifest.json'), name: live ? 'Rush Powersports' : 'Rush Powersports (dev)', short_name: APP, icons: [{ src: iconUrl, sizes: '180x180', type: 'image/png' }] });
const manifestUrl = `/manifest.json?v=${v(manifest)}`;

const css = `
:root{color-scheme:light;--bg:#f6f4ef;--fg:#1d1d1d;--dim:#858585;--line:#e6e3db;--y:#a87600;--c:#0a8f9c;--m:#c8177a;--card:#fff;--mono:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;--s1:4px;--s2:8px;--s3:16px;--s4:24px}
*{box-sizing:border-box}
html{-webkit-text-size-adjust:100%;text-size-adjust:100%}
body{margin:0;overflow-wrap:anywhere;background:var(--bg);color:var(--fg);font:15px/1.5 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
/* installed on a home screen the page runs under the notch and home bar, so pad by the safe areas */
main{max-width:44rem;margin:0 auto;padding:max(var(--s4),env(safe-area-inset-top)) max(var(--s3),env(safe-area-inset-right)) max(80px,env(safe-area-inset-bottom)) max(var(--s3),env(safe-area-inset-left))}
.card,footer,button,.btn{font-family:var(--mono);font-size:13px;line-height:1.6}
.card,button,.btn{background:var(--card);color:var(--fg);border:1px solid var(--line);border-radius:8px}
a{color:var(--c);text-decoration:none}
.y{color:var(--y)}.c{color:var(--c)}.m{color:var(--m)}.dim{color:var(--dim)}
h1{margin:0 0 var(--s3);font-size:18px}
h2{margin:var(--s4) 0 var(--s2);font-size:17px}
.cards{display:grid;gap:var(--s2)}
.card{display:block;padding:var(--s3)}
.card p:first-child{margin-top:0}
ul{list-style:none;margin:var(--s2) 0 0;padding:0}
li{display:flex;align-items:baseline;gap:1ch;padding:8px 0;border-bottom:1px solid var(--line)}
li:last-child{border-bottom:0}
li>span{flex:1}
time{white-space:nowrap}
ol{margin:var(--s2) 0 0;padding-left:2.5ch}
ol li{display:list-item}
label{display:block;margin-top:var(--s3);color:var(--dim)}
/* 16px inputs, or iPhone zooms in on tap */
input,textarea{display:block;width:100%;padding:var(--s2) 0;background:none;color:var(--fg);font:inherit;font-size:16px;border:0;border-bottom:1px solid var(--line);border-radius:0;caret-color:var(--c);resize:vertical}
input:focus,textarea:focus{outline:0;border-color:var(--c)}
input[readonly]{color:var(--dim)}
input::placeholder{color:#c4c0b6}
button,.btn{display:inline-block;padding:12px var(--s3);color:var(--c);cursor:pointer;box-shadow:0 1px 0 var(--line);transition:border-color .15s,box-shadow .15s}
button:active,.btn:active{transform:translateY(1px);box-shadow:none}
button:disabled{opacity:.5;pointer-events:none}
button.tag{padding:8px 6px;margin:-8px 0;border:0;background:none;box-shadow:none}
button.c{color:var(--c)}button.dim{color:var(--dim)}
@media (hover:hover){button:hover,.btn:hover{border-color:var(--c)}button.tag:hover{background:var(--bg)}}
:focus-visible{outline:2px solid var(--c);outline-offset:2px}
.row{display:flex;gap:var(--s2);margin-top:var(--s3);flex-wrap:wrap;align-items:center}
.row form{margin:0}
.err{color:var(--m)}
/* two rows of underlined tabs under the title: sections, then that section's pages, smaller */
nav{display:flex;flex-wrap:wrap;gap:0 var(--s3);border-bottom:1px solid var(--line)}
nav a{margin-bottom:-1px;padding:10px 0;color:var(--dim);border-bottom:2px solid transparent}
nav [aria-current]{color:var(--fg);border-color:var(--c)}
nav+nav{margin-bottom:var(--s3);font-size:13px}
@media (hover:hover){nav a:hover{color:var(--fg)}}
/* settings rows (profile): label, value, "change" on the right; tap to open the form underneath. details/summary, no js */
details+details{border-top:1px solid var(--line)}
summary{display:flex;gap:1ch;padding:12px 0;cursor:pointer;list-style:none}
summary::-webkit-details-marker{display:none}
summary span{flex:1}
summary::after{content:"change";color:var(--c)}
details[open] summary::after{content:"cancel";color:var(--dim)}
details form{padding-bottom:var(--s3)}
/* page to page slides instead of flashing, where the browser can (Safari 18.2+, Chrome); elsewhere it's an instant switch */
@view-transition{navigation:auto}
footer{margin-top:48px;padding-top:var(--s3);border-top:1px solid var(--line);color:var(--dim);font-size:12px}
footer b{color:var(--fg);font-weight:normal}
#logo i{font-style:normal}#logo .m{color:#ff3fb4}#logo .y{color:#f2b705}#logo .c{color:#12b5c4}
/* home hero: a black panel, edge to edge on a phone. the art is a 48 column text grid that scales to fill the panel's width (cqw);
   glow on the bars, sparks and lettering makes them read as light */
.hero{container-type:inline-size;margin:var(--s3) calc(-1 * var(--s3)) var(--s4);background:#0b0b0b}
@media (min-width:46rem){.hero{margin-inline:0;border-radius:8px}}
.hero pre{margin:0;padding:1.5em 0;font:calc(100cqw / 30)/1.15 var(--mono);text-align:center;color:#fff}
.hero i{font-style:normal}
.hero .m{color:#ff3fb4;text-shadow:0 0 .6em #ff3fb4}.hero .y{color:#f2b705;text-shadow:0 0 .6em #f2b705}.hero .c{color:#12b5c4;text-shadow:0 0 .6em #12b5c4}
.hero .d{color:#6a6a6a}.hero .dd{color:#333}.hero .tf{color:#3a3a3a}.hero .g{color:#b5b2aa;text-shadow:0 0 .4em rgba(246,244,239,.3)}
.hero .t{color:#f6f4ef;text-shadow:0 0 .5em rgba(246,244,239,.5)}`;

// runs in the browser: the home page hero, the share sheet where there is one (phones), copy everywhere
function browser() {
  // home hero: the logo's three bars throw sparse sparks onto black, and RUSH POWERSPORTS V2 powers on letter by letter like neon,
  // then flickers now and then; under it By Resource Automation, with a glint sweeping across. a grid of text cells redrawn
  // 20 times a second; phones set to reduce motion get one still frame
  const hero = document.querySelector('#hero');
  if (hero) {
    const W = 48, H = 14, still = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const bars = [['m', 18], ['y', 22], ['c', 26]], top = 3; // each bar 4 cells wide and 4 tall: the logo's 1:2, since cells are tall
    const word = 'R U S H   P O W E R S P O R T S   V 2', wx = (W - word.length) >> 1;
    const tag = 'By Resource Automation', tx = (W - tag.length) >> 1;
    const on = [...word].map(() => still ? 0 : 8 + Math.random() * 30 | 0), off = [...word].map(() => 0); // frames to power on / to flicker
    let sparks = [], t = 0;
    const draw = () => {
      const g = [...Array(H)].map(() => Array(W).fill([' ', '']));
      const put = (x, y, ch, cls) => { x = Math.round(x); y = Math.round(y); if (x >= 0 && y >= 0 && x < W && y < H) g[y][x] = [ch, cls]; };
      // a new spark leaves a side of a random bar in its color, flying outward (up to 60° off level), arcing down as it slows
      if (!still && Math.random() < .55) {
        const [cls, bx] = bars[Math.random() * 3 | 0], left = Math.random() < .5, a = (Math.random() - .5) * 2.1 + (left ? Math.PI : 0), v = .6 + Math.random() * 1.1;
        sparks.push({ x: left ? bx - 1 : bx + 4, y: top + Math.random() * 4, dx: Math.cos(a) * v, dy: Math.sin(a) * v / 2, life: 0, max: 16 + Math.random() * 22 | 0, cls });
      }
      sparks = sparks.filter((s) => s.life++ < s.max);
      for (const s of sparks) {
        s.x += s.dx; s.y += s.dy; s.dy += .03; s.dx *= .97;
        // hot: a streak pointing the way it flies, in its bar's color. cooling: a grey dot, then a faint one
        const age = s.life / s.max, k = s.dy / (Math.abs(s.dx) + .001);
        const streak = Math.abs(k) < .3 ? '-' : Math.abs(k) > 1.5 ? '|' : (k > 0) === (s.dx > 0) ? '\\' : '/';
        put(s.x, s.y, age < .35 ? streak : age < .7 ? '·' : '.', age < .35 ? s.cls : age < .7 ? 'd' : 'dd');
      }
      for (const [cls, bx] of bars) for (let y = top; y < top + 4; y++) for (let x = bx; x < bx + 4; x++) put(x, y, !still && Math.random() < .01 ? '▓' : '█', cls);
      [...word].forEach((ch, i) => {
        if (ch === ' ') return;
        let cls = 't';
        if (on[i] > 0) cls = --on[i] > 5 ? '' : Math.random() < .5 ? 'tf' : 't'; // dark, then a stutter, then on
        else if (off[i] > 0) { off[i]--; cls = 'tf'; }
        else if (!still && Math.random() < .0015) off[i] = 2 + Math.random() * 5 | 0;
        if (cls) put(wx + i, 10, ch, cls);
      });
      // fades in after the title, then every 21 seconds (420 frames) a glint sweeps left to right (lit letter, half-lit either side),
      // and now and then one letter drops out for a frame
      if (still || t > 45) [...tag].forEach((ch, i) => {
        const d = still ? 9 : Math.abs((t - 45) % 420 - i * 1.5);
        put(tx + i, 12, ch, d < 1 ? 't' : d < 3 ? 'g' : !still && Math.random() < .001 ? 'dd' : 'd');
      });
      // one <i> per run of same-colored cells
      hero.innerHTML = g.map((row) => {
        let out = '', run = '', cur = '';
        const flush = () => { out += cur ? `<i class="${cur}">${run}</i>` : run; run = ''; };
        for (const [ch, cls] of row) { if (cls !== cur) { flush(); cur = cls; } run += ch; }
        flush();
        return out;
      }).join('\n');
      t++;
    };
    draw();
    if (!still) setInterval(() => document.hidden || draw(), 50); // nothing drawn while the page is out of sight
  }
  document.querySelectorAll('[data-share]').forEach((b) => { b.hidden = !navigator.share; });
  document.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-share],[data-copy]');
    if (!b) return;
    if (b.dataset.share) {
      try { await navigator.share({ text: b.dataset.text, url: b.dataset.share }); } catch {}
      return;
    }
    // the clipboard api only exists on https and localhost, so fall back to a hidden textarea
    try { await navigator.clipboard.writeText(b.dataset.copy); } catch {
      const t = document.createElement('textarea');
      t.value = b.dataset.copy;
      document.body.append(t);
      t.select();
      document.execCommand('copy');
      t.remove();
    }
    b.textContent = '✓ copied';
  });
}

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const day = (d) => d.toLocaleDateString('en-US', { timeZone: 'America/Chicago', month: 'numeric', day: 'numeric' });
const ago = (d) => { const m = (Date.now() - d) / 60000; return m < 1 ? 'just now' : m < 60 ? `${m | 0}m ago` : m < 1440 ? `${m / 60 | 0}h ago` : `${m / 1440 | 0}d ago`; };
const logo = '<span id="logo"><i class="m">█</i><i class="y">█</i><i class="c">█</i></span>';
const tabIcon = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 3 2"><rect width="1" height="2" fill="#ff3fb4"/><rect x="1" width="1" height="2" fill="#f2b705"/><rect x="2" width="1" height="2" fill="#12b5c4"/></svg>')}`;

// sections, each with its pages; urls are /<section>/<page>. can() hides what someone can't use (no can: everyone),
// so adding a page is one line here plus its route in server.js
const NAV = [
  { id: 'account', label: 'Account', pages: [{ id: 'home', label: 'Home' }, { id: 'issues', label: 'Issues' }, { id: 'profile', label: 'Profile' }] },
  { id: 'admin', label: 'Admin', can: 'admin', pages: [
    { id: 'users', label: 'Users' }, { id: 'sessions', label: 'Sessions' }, { id: 'invites', label: 'Invites' }, { id: 'events', label: 'Events' }] },
];
const sections = (user) => NAV.filter((s) => !s.can || can(user, s.can)).map((s) => ({ ...s, pages: s.pages.filter((p) => !p.can || can(user, p.can)) }));
// where / and /<section> land: the first page someone can use
const landing = (user, section) => {
  const s = sections(user).find((x) => !section || x.id === section);
  return s ? `/${s.id}/${s.pages[0].id}` : null;
};

// c.at is "<section>/<page>": a row of section tabs, then a row of that section's page tabs
const bars = (c) => {
  const [sec, pg] = c.at.split('/'), mine = sections(c.user), here = mine.find((s) => s.id === sec);
  const nav = (label, items) => `<nav aria-label="${label}">${items.map(([href, text, on]) => `<a href="${href}"${on ? ' aria-current="page"' : ''}>${esc(text)}</a>`).join('')}</nav>`;
  return nav('Sections', mine.map((s) => [`/${s.id}`, s.label, s === here])) + nav('Pages', here.pages.map((p) => [`/${sec}/${p.id}`, p.label, p.id === pg]));
};

// c: { user, at, t0 }; signed-out pages (no user) get no bars
const page = (c, title, body) => {
  const b = c.user && c.at ? bars(c) : '';
  return `<!doctype html><html lang="en"><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="referrer" content="same-origin"><meta name="theme-color" content="#f6f4ef"><meta name="apple-mobile-web-app-title" content="${APP}">
<title>${esc(title)} · ${APP}</title>
<link rel="manifest" href="${manifestUrl}"><link rel="apple-touch-icon" href="${iconUrl}"><link rel="icon" href="${tabIcon}">
<style>${css}</style><main><h1>Rush Powersports</h1>${b}
${body}
<footer><div>${logo} <b>By Resource Automation</b></div>
<div>${c.user ? `user ${esc(c.user.name)} · ` : ''}db ${esc(process.env.MONGODB_DB)} · server ${Date.now() - c.t0}ms · rev ${esc(REV)}</div>
</footer></main><script>(${browser})()</script>
<script type="speculationrules">{"prefetch":[{"where":{"href_matches":"/*"},"eagerness":"conservative"}]}</script>`;
};

const error = (msg) => msg ? `<p class="err">${esc(msg)}</p>` : '';

const login = (c, { phone = '', msg } = {}) => page(c, 'Sign in', `<h2>Sign in</h2>${error(msg)}
<form method="post" action="/login">
<label>phone<input name="phone" type="tel" inputmode="tel" autocomplete="username" required value="${esc(phone)}"></label>
<label>password<input name="password" type="password" autocomplete="current-password" required></label>
<div class="row"><button>↵ sign in</button></div></form>
<p class="dim">no password yet, or forgot it? ask for a new login link.</p>`);

// the phone shows as the username, so the iPhone saves it together with the password it suggests
const invite = (c, user, token, msg) => page(c, 'Set password', `<h2>Hi ${esc(user.name)}</h2>
<p>Set a password for your Rush login. Your iPhone can suggest one and remember it for you.</p>${error(msg)}
<form method="post" action="/invite/${esc(token)}">
<label>phone<input name="phone" type="tel" autocomplete="username" readonly value="${esc(showPhone(user.phone))}"></label>
<label>new password <span class="dim">(8 or more characters)</span><input name="password" type="password" autocomplete="new-password" minlength="8" maxlength="200" required></label>
<div class="row"><button>↵ save password</button></div></form>`);

const inviteGone = (c) => page(c, 'Link used up', `<h2>This link doesn't work anymore</h2>
<p>Login links work once, for 7 days. Ask for a new one, or <a href="/login">sign in</a> if you already set a password.</p>`);

const invited = (c) => page(c, 'Password saved', `<h2>You're in, ${esc(c.user.name)}</h2>
<div class="card"><b>Put Rush on your home screen</b><ol>
<li>tap Share (the square with the arrow)</li>
<li>tap Add to Home Screen</li>
<li>open Rush from your home screen and sign in with your phone number. your iPhone fills in the password.</li></ol></div>
<div class="row"><a class="btn" href="/">keep going here →</a></div>`);

// Account → Home, where everyone lands: what v2 is, the hero (browser() draws it into #hero), and a tour of what you can reach
const home = (c) => {
  const stops = [
    ['/account/profile', 'Account → Profile', 'change your name, phone or password, or sign out.'],
    [null, 'Home screen', 'in Safari tap Share, then Add to Home Screen. open Rush from there and sign in once; your iPhone fills in the password.'],
    ...(can(c.user, 'admin') ? [
      ['/admin/users', 'Admin → Users', 'add someone, turn roles on and off, and make a login link to text them.'],
      ['/admin/sessions', 'Admin → Sessions', 'every phone that\'s signed in. × signs one out.'],
      ['/admin/invites', 'Admin → Invites', 'login links nobody has used yet. × cancels one.'],
      ['/admin/events', 'Admin → Events', 'who did what, newest first.'],
    ] : []),
  ];
  return page({ ...c, at: 'account/home' }, 'Home', `<p>Rush v2 is the shop's app rebuilt from the ground up to live on your phone's home screen, with jobs, parts and tasks arriving one section at a time.</p>
<div class="hero"><pre id="hero" aria-hidden="true"></pre></div>
<h2>Quick tour</h2><div class="card"><ol>${stops.map(([href, name, what]) => `<li><b>${href ? `<a href="${href}">${name}</a>` : name}</b> ${what}</li>`).join('')}</ol></div>`);
};

// Account → Profile: change your name, phone and password, and sign out. c.msg is [form, text, ok]: the message shows under that form.
// phone and password need your current password, so an unlocked phone left on the bench can't lock you out
const profile = (c) => {
  const u = c.user, [form, text, ok] = c.msg || [];
  const current = '<label>current password<input name="current" type="password" autocomplete="current-password" required></label>';
  // a settings row: label and current value, tap to open its form. stays open when that form came back with an error
  const row = (id, label, value, fields) => `<details${form === id && !ok ? ' open' : ''}><summary><b>${label}</b><span class="dim">${value}</span></summary>
<form method="post" action="/account/profile">${fields}<div class="row"><button name="a" value="${id}">↵ save ${id}</button></div></form></details>`;
  return page({ ...c, at: 'account/profile' }, 'Profile', `${text ? `<p class="${ok ? 'c' : 'err'}">${esc(text)}</p>` : ''}
<div class="card">
${row('name', 'Name', esc(u.name), `<label>name<input name="name" maxlength="40" required value="${esc(u.name)}"></label>`)}
${row('phone', 'Phone', esc(showPhone(u.phone)), `<p class="dim">this is what you sign in with. check it twice: a wrong number locks you out until an admin sends you a new login link.</p>
<label>new phone<input name="phone" type="tel" inputmode="tel" required></label>${current}`)}
${row('password', 'Password', '••••••••', `<input name="username" autocomplete="username" value="${esc(showPhone(u.phone))}" hidden>${current}
<label>new password <span class="dim">(8 or more characters)</span><input name="password" type="password" autocomplete="new-password" minlength="8" maxlength="200" required></label>
<p class="dim">signs you out on your other phones.</p>`)}
</div>
<p class="dim">roles: ${u.roles.length ? esc(u.roles.join(' · ')) : 'none yet'}</p>
<form method="post" action="/logout"><div class="row"><button>sign out</button></div></form>`);
};

// shown once, right after it's made: only its hash is kept, so it can't be shown again later
const inviteBox = (link) => `<h2>Login link for ${esc(link.name)}</h2><div class="card">
<p>send this to ${esc(link.name)}. it works once, for 7 days.</p>
<p class="dim">${esc(link.url)}</p>
<div class="row"><button type="button" data-share="${esc(link.url)}" data-text="${esc(`${link.name}, here's your Rush Powersports login link. It works once, for 7 days.`)}" hidden>↗ share</button><button type="button" data-copy="${esc(link.url)}">⧉ copy</button></div></div>`;

// your own card can't change your roles or remove you, so you can't lock yourself out
const user = (c, u) => {
  const own = String(u._id) === String(c.user._id);
  const status = u.hash ? '' : u.invite ? `<div class="y">login link open until ${day(u.invite.expiresAt)}</div>` : '<div class="m">no password yet</div>';
  return `<form method="post" action="/admin/users" class="card"><b>${esc(u.name)}</b> <span class="dim">${esc(showPhone(u.phone))}${own ? ' · you' : ''}</span>${status}
<div class="row">${ROLES.map((r) => {
    const on = u.roles.includes(r);
    return `<button class="tag ${on ? 'c' : 'dim'}" name="a" value="role:${u._id}:${r}:${on ? 0 : 1}"${own ? ' disabled' : ''}>${on ? '[x]' : '[ ]'} ${r}</button>`;
  }).join('')}</div>
<div class="row"><button name="a" value="invite:${u._id}">↗ ${u.hash ? 'new login link' : 'login link'}</button>${own ? '' : `<button name="a" value="remove:${u._id}">× remove</button>`}</div></form>`;
};

const users = (c, all, link) => {
  const active = all.filter((u) => !u.disabledAt), removed = all.filter((u) => u.disabledAt);
  return page({ ...c, at: 'admin/users' }, 'Users', `${link ? inviteBox(link) : ''}
<div class="cards">${active.map((u) => user(c, u)).join('\n')}</div>
<h2>Add someone</h2>${error(c.msg)}<form method="post" action="/admin/users">
<label>name<input name="name" maxlength="40" required placeholder="Brad"></label>
<label>phone<input name="phone" type="tel" inputmode="tel" required placeholder="405-555-0123"></label>
<div class="row"><button name="a" value="add">+ add and make login link</button></div></form>
${removed.length ? `<h2>Removed</h2><form method="post" action="/admin/users" class="card"><ul>${removed.map((u) => `<li><span>${esc(u.name)} <span class="dim">${esc(showPhone(u.phone))}</span></span><button class="tag c" name="a" value="restore:${u._id}">↺ restore</button></li>`).join('')}</ul></form>` : ''}`);
};

// one row per item in a card, with an × button on the right when the row can be acted on
const list = (action, rows, empty) => `<form method="post" action="${action}" class="card"><ul>${rows.map(([text, x]) => `<li><span>${text}</span>${x ? `<button class="tag dim" name="a" value="${x}" aria-label="remove">×</button>` : ''}</li>`).join('') || `<li class="dim">${empty}</li>`}</ul></form>`;

// every signed-in phone, last used first. yours has no ×: use sign out
const sessions = (c, all, who) => page({ ...c, at: 'admin/sessions' }, 'Sessions', list('/admin/sessions', all.map((s) => {
  const mine = String(s._id) === String(c.session._id);
  return [`<a href="/admin/sessions/${s._id}">${esc(who(s.userId))} · ${esc(s.device)}</a> <span class="dim">seen ${ago(s.seenAt)} · since ${day(s.createdAt)}${mine ? ' · this one' : ''}</span>`, !mine && `revoke:${s._id}`];
}), 'nobody signed in'));

// one session, every field but the token hash
const session = (c, s, name) => {
  const { hash, ...rest } = s, rows = { ...rest, user: name };
  return page({ ...c, at: 'admin/sessions' }, 'Session', `<div class="card"><ul>${Object.entries(rows).map(([k, v]) => `<li><span>${esc(k)}</span><span class="dim">${esc(v instanceof Date ? v.toISOString() : String(v))}</span></li>`).join('')}</ul></div>
<p><a href="/admin/sessions">← sessions</a></p>`);
};

// Account → Issues: anyone writes a problem or idea; admins tick them off (a done one can be reopened)
const issues = (c, all) => {
  const admin = can(c.user, 'admin'), row = (i) => `<li><span><a href="/account/issues/${i._id}">${esc(i.text.length > 80 ? i.text.slice(0, 80) + '…' : i.text)}</a> <span class="dim">${esc(i.by.name)} · ${ago(i.at)}${i.doneAt ? ` · done ${ago(i.doneAt)}` : ''}</span></span>${admin ? `<button class="tag dim" name="a" value="${i.doneAt ? 'reopen' : 'done'}:${i._id}">${i.doneAt ? '↺' : '✓'}</button>` : ''}</li>`;
  const open = all.filter((i) => !i.doneAt), done = all.filter((i) => i.doneAt);
  return page({ ...c, at: 'account/issues' }, 'Issues', `${error(c.msg)}<form method="post" action="/account/issues">
<label>what's wrong, or what would help?<textarea name="text" maxlength="500" rows="3" required></textarea></label>
<div class="row"><button name="a" value="add">+ add issue</button></div></form>
<h2>Open</h2><form method="post" action="/account/issues" class="card"><ul>${open.map(row).join('') || '<li class="dim">nothing open</li>'}</ul></form>
${done.length ? `<h2>Done</h2><form method="post" action="/account/issues" class="card"><ul>${done.map(row).join('')}</ul></form>` : ''}`);
};

// one issue: its writer or an admin can change the text or delete it; admins also mark it done
const issue = (c, i) => {
  const admin = can(c.user, 'admin'), mine = String(i.by.userId) === String(c.user._id), url = '/account/issues/' + i._id;
  return page({ ...c, at: 'account/issues' }, 'Issue', `${error(c.msg)}<div class="card"><p>${esc(i.text)}</p>
<p class="dim">${esc(i.by.name)} · ${ago(i.at)}${i.doneAt ? ` · done ${ago(i.doneAt)}` : ' · open'}</p></div>
${mine || admin ? `<form method="post" action="${url}"><label>text<textarea name="text" maxlength="500" rows="4" required>${esc(i.text)}</textarea></label>
<div class="row"><button name="a" value="save">↵ save</button>${admin ? `<button name="a" value="${i.doneAt ? 'reopen' : 'done'}">${i.doneAt ? '↺ reopen' : '✓ done'}</button>` : ''}<button name="a" value="delete">× delete</button></div></form>` : ''}
<p><a href="/account/issues">← issues</a></p>`);
};

// login links not used yet; × makes one stop working
const invites = (c, all, who) => page({ ...c, at: 'admin/invites' }, 'Invites', list('/admin/invites', all.map((i) =>
  [`${esc(who(i.userId))} <span class="dim">by ${esc(i.createdBy.name)} · until ${day(i.expiresAt)}</span>`, `cancel:${i._id}`]), 'no open login links') +
  '<p class="dim">new links are made on the Users tab.</p>');

// the events log in plain words, newest first. who(id) turns a user id into a name
const said = (e, who) => {
  const by = esc(e.by.name), them = esc(who(e.userId));
  return {
    invite: `${by} made a login link for ${them}`,
    'password set': `${them} set a password`,
    login: `${them} signed in`,
    roles: `${by} turned ${e.on ? 'on' : 'off'} ${esc(e.role)} for ${them}`,
    revoke: `${by} signed out ${them}'s ${esc(e.device)}`,
    remove: `${by} removed ${them}`,
    restore: `${by} restored ${them}`,
    cancel: `${by} cancelled ${them}'s login link`,
    name: `${esc(e.from)} changed their name to ${esc(e.to)}`,
    phone: `${them} changed their phone`,
    'password change': `${them} changed their password`,
  }[e.what] || `${by}: ${esc(e.what)}`;
};
const events = (c, all, who) => page({ ...c, at: 'admin/events' }, 'Events', `
<div class="card"><ul>${all.map((e) => `<li><span>${said(e, who)}</span><time class="dim">${ago(e.at)}</time></li>`).join('') || '<li class="dim">nothing yet</li>'}</ul></div>
${all.length === 100 ? '<p class="dim">the last 100.</p>' : ''}`);

module.exports = { icon, manifest, landing, login, invite, inviteGone, invited, home, profile, users, sessions, session, issues, issue, invites, events };
