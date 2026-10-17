// html for every page. the full app shell (tabs, home screen polish) comes later; this carries v1's paper look
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { ROLES, showPhone, can } = require('./auth');
const qr = require('./qr');

const REV = process.env.K_REVISION || 'local';

// anything but prod gets the dark DEV icon and "Rush (dev)" name, so a home screen can hold both without mixing them up.
// the name shows under the home screen icon and in the tab
const live = process.env.MONGODB_DB === 'prod';
const APP = live ? 'Rush V2' : 'Rush V2 (dev)';
// links carry a fingerprint of the file, so a phone that kept an old icon or manifest fetches the new one
const v = (b) => crypto.createHash('sha256').update(b).digest('hex').slice(0, 8);
const icon = fs.readFileSync(path.join(__dirname, live ? 'icon-bars.png' : 'icon-dev.png'));
const iconUrl = `/icon.png?v=${v(icon)}`;
const manifest = JSON.stringify({ ...require('./manifest.json'), name: live ? 'Rush Powersports V2' : 'Rush Powersports V2 (dev)', short_name: APP, icons: [{ src: iconUrl, sizes: '180x180', type: 'image/png' }] });
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
.hero .t{color:#f6f4ef;text-shadow:0 0 .5em rgba(246,244,239,.5)}
.invite{margin-bottom:var(--s4)}
.qr{display:block;width:176px;height:176px;border:1px solid var(--line);border-radius:4px}
/* charts: every color is a role on .chart, so a chart is recolored in one place. its own scheme (the dataviz palette's dark steps)
   apart from the app's cyan, on a dark panel so charts read as their own surface; marks wear --series, text only wears the inks. small system sans, not the mono the rest of the app uses */
.chart{color-scheme:dark;--surface:#1a1a19;--ink:#f0efec;--ink2:#c3c2b7;--muted:#898781;--grid:#2c2c2a;--axis:#383835;--series:#3987e5;--tip:#f0efec;--on-tip:#1a1a19;
  margin:0 0 var(--s4);background:var(--surface);border-color:rgba(255,255,255,.10);font:12px/1.4 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;color:var(--ink2)}
* + .chart{margin-top:var(--s4)}
.chart figcaption{margin-bottom:var(--s4);display:flex;flex-wrap:wrap;gap:0 var(--s2);align-items:baseline}
.chart figcaption b{font-size:13px;font-weight:600;color:var(--ink)}
.chart figcaption span{color:var(--muted)}
.plot{position:relative;height:140px;margin:0 0 0 28px}
.plot .grid{position:absolute;left:0;right:0;border-top:1px solid var(--grid)}
.plot .grid.base{border-color:var(--axis)}
.plot .grid span{position:absolute;white-space:nowrap;right:calc(100% + 8px);top:-.7em;color:var(--muted);font-variant-numeric:tabular-nums}
.cols,.xs{display:flex;position:relative}
.cols{height:100%}
.col{flex:1;position:relative;display:flex;align-items:flex-end;justify-content:center;padding:0 1px;outline-offset:-1px}
.col i{font-style:normal;display:block;position:relative;width:100%;max-width:24px;height:var(--h);background:var(--series);border-radius:4px 4px 0 0;transition:opacity .15s}
.col:hover i,.col:focus i{opacity:.75}
.col i b{white-space:nowrap;position:absolute;bottom:calc(100% + 3px);left:50%;transform:translateX(-50%);font-weight:500;color:var(--ink)}
.xs{margin:var(--s2) 0 0 28px;height:16px}
.xs span{flex:1;position:relative}
.xs span b{position:absolute;left:50%;transform:translateX(-50%);font-weight:400;color:var(--muted);white-space:nowrap}
/* tooltip: value first, then the date; on hover and keyboard focus, flipped inward at the edges so it never leaves the card */
.tip{display:none;position:absolute;bottom:calc(var(--h) + 22px);left:50%;transform:translateX(-50%);z-index:1;padding:var(--s1) var(--s2);background:var(--tip);color:var(--on-tip);border-radius:6px;white-space:nowrap;pointer-events:none}
.tip b{font-weight:600}.tip span{opacity:.7}
.col:hover .tip,.col:focus .tip{display:block}
.col.l .tip{left:0;transform:none}.col.r .tip{left:auto;right:0;transform:none}
.chart details{margin-top:var(--s4)}
.chart summary{display:block;padding:0;color:var(--muted)}
.chart summary::after,.chart details[open] summary::after{content:"";}
.chart summary::before{content:"▸ "}.chart details[open] summary::before{content:"▾ "}
.chart li{padding:6px 0;border-color:var(--grid)}`;

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
    // an icon button flashes a check and goes back; the login link's text button stays copied
    if (b.hasAttribute('data-icon')) { b.textContent = '✓'; setTimeout(() => { b.textContent = '⧉'; }, 1500); } else b.textContent = '✓ copied';
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
  { id: 'account', label: 'Account', pages: [{ id: 'home', label: 'Home' }, { id: 'profile', label: 'Profile' }, { id: 'issues', label: 'Issues' }, { id: 'sessions', label: 'Sessions' }] },
  { id: 'admin', label: 'Admin', can: 'admin', pages: [
    { id: 'issues', label: 'Issues' }, { id: 'users', label: 'Users' }, { id: 'sessions', label: 'Sessions' }, { id: 'invites', label: 'Invites' }, { id: 'events', label: 'Events' }] },
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
<style>${css}</style><main><h1>Rush Powersports V2</h1>${b}
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
// black modules on white with 4 modules of quiet zone, whatever the page colors, so a phone camera reads it
const qrSvg = (text) => {
  const m = qr.matrix(text), n = m.length;
  const d = m.flatMap((row, r) => row.map((v, c) => v === 1 ? `M${c} ${r}h1v1h-1z` : '')).join('');
  return `<svg class="qr" viewBox="-4 -4 ${n + 8} ${n + 8}" role="img" aria-label="QR code of the login link" shape-rendering="crispEdges"><rect x="-4" y="-4" width="${n + 8}" height="${n + 8}" fill="#fff"/><path d="${d}" fill="#000"/></svg>`;
};
const inviteBox = (link) => `<h2>Login link for ${esc(link.name)}</h2><div class="card invite">
<p>send this to ${esc(link.name)}, or have them scan this with their phone camera. it works once, for 7 days.</p>
${qrSvg(link.url)}
<p class="dim">${esc(link.url)}</p>
<div class="row"><button type="button" data-share="${esc(link.url)}" data-text="${esc(`${link.name}, here's your Rush Powersports login link. It works once, for 7 days.`)}" hidden>↗ share</button><button type="button" data-copy="${esc(link.url)}">⧉ copy</button></div></div>`;

// your own card can't change your roles or remove you, so you can't lock yourself out
const user = (c, u) => {
  const own = String(u._id) === String(c.user._id);
  const status = u.hash ? '' : u.invite ? `<div class="y">login link open until ${day(u.invite.expiresAt)}</div>` : '<div class="m">no password yet</div>';
  const locked = u.lockedUntil > new Date() ? '<div class="m">locked</div>' : '';
  return `<form method="post" action="/admin/users" class="card"><b><a href="/admin/users/${u._id}">${esc(u.name)}</a></b> <span class="dim">${esc(showPhone(u.phone))}${own ? ' · you' : ''}</span>${status}${locked}
<div class="row">${ROLES.map((r) => {
    const on = u.roles.includes(r);
    return `<button class="tag ${on ? 'c' : 'dim'}" name="a" value="role:${u._id}:${r}:${on ? 0 : 1}"${own ? ' disabled' : ''}>${on ? '[x]' : '[ ]'} ${r}</button>`;
  }).join('')}</div>
<div class="row"><button name="a" value="invite:${u._id}">↗ ${u.hash ? 'new login link' : 'login link'}</button>${own ? '' : `<button name="a" value="remove:${u._id}">× remove</button>`}</div></form>`;
};

const clock = (d) => d.toLocaleTimeString('en-US', { timeZone: 'America/Chicago', hour: 'numeric', minute: '2-digit' });

// Admin → Users → one person
const person = (c, u, ss, link) => {
  const own = String(u._id) === String(c.user._id), locked = u.lockedUntil > new Date();
  const status = [u.disabledAt && 'removed', !u.hash && 'no password yet', locked && `locked until ${clock(u.lockedUntil)}`, u.fails > 0 && `${u.fails} wrong tries`].filter(Boolean).join(' · ');
  return page({ ...c, at: 'admin/users' }, u.name, `${link ? inviteBox(link) : ''}${error(c.msg)}
<form method="post" action="/admin/users/${u._id}" class="card">
<label>name<input name="name" maxlength="40" required value="${esc(u.name)}"></label>
<label>phone<input name="phone" type="tel" inputmode="tel" required value="${esc(showPhone(u.phone))}"></label>
<div class="row"><button name="a" value="save">↵ save</button></div>
${status ? `<p class="m">${status}</p>` : ''}
<div class="row">${ROLES.map((r) => {
    const on = u.roles.includes(r);
    return `<button class="tag ${on ? 'c' : 'dim'}" name="a" value="role:${u._id}:${r}:${on ? 0 : 1}"${own ? ' disabled' : ''}>${on ? '[x]' : '[ ]'} ${r}</button>`;
  }).join('')}</div>
<div class="row">${u.disabledAt ? '' : `<button name="a" value="invite:${u._id}">↗ ${u.hash ? 'new login link' : 'login link'}</button>`}${locked || u.fails > 0 ? `<button name="a" value="unlock:${u._id}">↺ unlock</button>` : ''}${own ? '' : u.disabledAt ? `<button name="a" value="restore:${u._id}">↺ restore</button><button name="a" value="delete:${u._id}">× delete for good</button>` : `<button name="a" value="remove:${u._id}">× remove</button>`}</div></form>
<h2>Signed in</h2><div class="card"><ul>${ss.map((s) => `<li><span><a href="/admin/sessions/${s._id}">${esc(s.device)}</a> <span class="dim">seen ${ago(s.seenAt)} · since ${day(s.createdAt)}</span></span></li>`).join('') || '<li class="dim">no phones</li>'}</ul></div>
<p><a href="/admin/users">← users</a></p>`);
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

// Account → Sessions: your own signed-in phones. yours has no ×: use sign out
const mySessions = (c, all) => page({ ...c, at: 'account/sessions' }, 'Sessions', list('/account/sessions', all.map((s) => {
  const mine = String(s._id) === String(c.session._id);
  return [`${esc(s.device)} <span class="dim">seen ${ago(s.seenAt)} · since ${day(s.createdAt)}${mine ? ' · this one' : ''}</span>`, !mine && `revoke:${s._id}`];
}), 'nothing') + '<p class="dim">× signs a phone out.</p>');

// every signed-in phone, last used first. yours has no ×: use sign out
const sessions = (c, all, who) => page({ ...c, at: 'admin/sessions' }, 'Sessions', list('/admin/sessions', all.map((s) => {
  const mine = String(s._id) === String(c.session._id);
  return [`<a href="/admin/sessions/${s._id}">${esc(who(s.userId))} · ${esc(s.device)}</a> <span class="dim">seen ${ago(s.seenAt)} · since ${day(s.createdAt)}${mine ? ' · this one' : ''}</span>`, !mine && `revoke:${s._id}`];
}), 'nobody signed in'));

// one session, every field but the token hash
const session = (c, s, name) => {
  const { hash, ...rest } = s, rows = { ...rest, user: name };
  return page({ ...c, at: 'admin/sessions' }, 'Session', `<div class="card"><ul>${Object.entries(rows).map(([k, v]) => `<li><span>${esc(k)}</span><span class="dim">${esc(v instanceof Date ? v.toISOString() : String(v))}</span></li>`).join('')}</ul></div>
${String(s._id) === String(c.session._id) ? '<p class="dim">this is your phone: use sign out.</p>' : `<form method="post" action="/admin/sessions"><div class="row"><button name="a" value="revoke:${s._id}">× sign out this phone</button></div></form>`}
<p><a href="/admin/sessions">← sessions</a></p>`);
};

// Account → Issues (yours) and Admin → Issues (everyone's): anyone writes a problem or idea; admins tick them off (a done one can be reopened)
const issues = (c, all, everyone, charts) => {
  const base = everyone ? '/admin/issues' : '/account/issues', admin = can(c.user, 'admin'), row = (i) => `<li><span><a href="${base}/${i._id}">${esc(i.text.length > 80 ? i.text.slice(0, 80) + '…' : i.text)}</a> <span class="dim">${esc(i.by.name)} · ${ago(i.at)}${i.doneAt ? ` · done ${ago(i.doneAt)}` : ''}</span></span>${everyone ? `<button type="button" class="tag dim" data-copy="${esc(i.text)}" data-icon aria-label="copy issue text">⧉</button>` : ''}${admin ? `<button class="tag dim" name="a" value="${i.doneAt ? 'reopen' : 'done'}:${i._id}">${i.doneAt ? '↺' : '✓'}</button>` : ''}</li>`;
  const open = all.filter((i) => !i.doneAt), done = all.filter((i) => i.doneAt);
  return page({ ...c, at: everyone ? 'admin/issues' : 'account/issues' }, 'Issues', `${error(c.msg)}<form method="post" action="${base}">
<label>what's wrong, or what would help?<textarea name="text" maxlength="500" rows="3" required></textarea></label>
<div class="row"><button name="a" value="add">+ add issue</button></div></form>
<h2>Open</h2><form method="post" action="${base}" class="card"><ul>${open.map(row).join('') || '<li class="dim">nothing open</li>'}</ul></form>
${charts ? `${columnChart({ title: 'Issues completed per day', unit: 'completed', sub: `last 30 days · ${total(charts.done)} total`, rows: dayRows(charts.done) })}
${columnChart({ title: 'Open issues at 5pm', unit: 'open', sub: `last 30 days · ${open.length} now`, rows: dayRows(charts.open) })}` : ''}
${done.length ? `<h2>Done</h2><form method="post" action="${base}" class="card"><ul>${done.map(row).join('')}</ul></form>` : ''}`);
};

// one issue: its writer or an admin can change the text or delete it; admins also mark it done
const issue = (c, i, everyone) => {
  const base = everyone ? '/admin/issues' : '/account/issues', admin = can(c.user, 'admin'), mine = String(i.by.userId) === String(c.user._id), url = `${base}/${i._id}`;
  return page({ ...c, at: everyone ? 'admin/issues' : 'account/issues' }, 'Issue', `${error(c.msg)}<div class="card"><p>${esc(i.text)}</p>
<p class="dim">${esc(i.by.name)} · ${ago(i.at)}${i.doneAt ? ` · done ${ago(i.doneAt)}` : ' · open'}</p></div>
${mine || admin ? `<form method="post" action="${url}"><label>text<textarea name="text" maxlength="500" rows="4" required>${esc(i.text)}</textarea></label>
<div class="row"><button name="a" value="save">↵ save</button>${everyone ? `<button type="button" data-copy="${esc(i.text)}">⧉ copy</button>` : ''}${admin ? `<button name="a" value="${i.doneAt ? 'reopen' : 'done'}">${i.doneAt ? '↺ reopen' : '✓ done'}</button>` : ''}<button name="a" value="delete">× delete</button></div></form>` : ''}
<p><a href="${base}">← issues</a></p>`);
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
    rename: `${by} renamed ${esc(e.from)} to ${esc(e.to)}`,
    'set phone': `${by} changed ${them}'s phone`,
    unlock: `${by} unlocked ${them}`,
    delete: `${by} deleted ${esc(e.name)} for good`,
    'password change': `${them} changed their password`,
    issue: `${by} ${e.done === true ? 'completed' : e.done === false ? 'reopened' : 'edited'} an issue`,
  }[e.what] || `${by}: ${esc(e.what)}`;
};
// a column chart, the template for the other charts. rows is [[label, value, tooltip date]], oldest first; the title names the
// single series, so there's no legend. thin columns (24px at most) with a rounded top and a 2px gap, hairline grid, y ticks at
// clean numbers, the peak labeled on its cap, a hover/focus tooltip on each column (its whole height is the target), a table view
// for the same numbers, and a date label every 4th column (the `every` option)
const columnChart = ({ title, sub, unit, rows, every = 4 }) => {
  const max = Math.max(...rows.map((r) => r[1]), 0);
  let top = 2; // 2, 4, 10, 20, 40, 100, ...: a clean top with a clean middle
  for (let p = 1; top < max; p *= 10) top = [2, 4, 10].map((s) => s * p).find((s) => s >= max) || top;
  const peak = rows.findIndex((r) => r[1] === max && max > 0), last = rows.length - 1, cell = (i) => (last - i) % every === 0;
  const grid = [[0, 'base'], [top / 2, ''], [top, '']].map(([v, cls]) => `<div class="grid ${cls}" style="bottom:${v / top * 100}%"><span>${v}</span></div>`).join('');
  const cols = rows.map(([label, v, date], i) => `<div class="col${i < 4 ? ' l' : i > last - 4 ? ' r' : ''}" tabindex="0" style="--h:${v / top * 100}%"><i${v ? '' : ' hidden'}>${i === peak ? `<b>${v}</b>` : ''}</i><span class="tip"><b>${v}</b> <span>${esc(unit)} · ${esc(date)}</span></span></div>`).join('');
  const xs = rows.map(([label], i) => `<span>${cell(i) ? `<b>${esc(label)}</b>` : ''}</span>`).join('');
  return `<figure class="chart card"><figcaption><b>${esc(title)}</b> <span class="dim">${esc(sub)}</span></figcaption>
<div class="plot">${grid}<div class="cols">${cols}</div></div><div class="xs">${xs}</div>
<details><summary>table</summary><ul>${rows.slice().reverse().map(([, v, date]) => `<li><span>${esc(date)}</span><span>${v}</span></li>`).join('')}</ul></details></figure>`;
};

// [[YYYY-MM-DD, n]] to chart rows: axis label, value, tooltip date
const dayRows = (days) => days.map(([k, n]) => { const d = new Date(k + 'T12:00Z'); return [d.toLocaleDateString('en-US', { timeZone: 'UTC', month: 'numeric', day: 'numeric' }), n, d.toLocaleDateString('en-US', { timeZone: 'UTC', weekday: 'short', month: 'numeric', day: 'numeric' })]; });
const total = (days) => days.reduce((a, d) => a + d[1], 0);

const events = (c, all, who, days) => page({ ...c, at: 'admin/events' }, 'Events', `
${columnChart({ title: 'Events per day', unit: 'events', sub: `last 30 days · ${total(days)} total`, rows: dayRows(days) })}
<div class="card"><ul>${all.map((e) => `<li><span>${said(e, who)}</span><time class="dim">${ago(e.at)}</time></li>`).join('') || '<li class="dim">nothing yet</li>'}</ul></div>
${all.length === 100 ? '<p class="dim">the last 100.</p>' : ''}`);

module.exports = { icon, manifest, landing, login, invite, inviteGone, invited, home, profile, users, person, mySessions, sessions, session, issues, issue, invites, events };
