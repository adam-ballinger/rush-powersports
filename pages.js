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
ol{margin:var(--s2) 0 0;padding-left:2.5ch}
label{display:block;margin-top:var(--s3);color:var(--dim)}
/* 16px inputs, or iPhone zooms in on tap */
input{display:block;width:100%;padding:var(--s2) 0;background:none;color:var(--fg);font:inherit;font-size:16px;border:0;border-bottom:1px solid var(--line);border-radius:0;caret-color:var(--c)}
input:focus{outline:0;border-color:var(--c)}
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
footer{margin-top:48px;padding-top:var(--s3);border-top:1px solid var(--line);color:var(--dim);font-size:12px}
footer b{color:var(--fg);font-weight:normal}
#logo i{font-style:normal}#logo .m{color:#ff3fb4}#logo .y{color:#f2b705}#logo .c{color:#12b5c4}`;

// runs in the browser: share sheet where there is one (phones), copy everywhere
function browser() {
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

// c: { user, t0 } for the footer; user is missing on signed-out pages
const page = (c, title, body) => `<!doctype html><html lang="en"><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="referrer" content="same-origin"><meta name="theme-color" content="#f6f4ef"><meta name="apple-mobile-web-app-title" content="${APP}">
<title>${esc(title)} · ${APP}</title>
<link rel="manifest" href="${manifestUrl}"><link rel="apple-touch-icon" href="${iconUrl}"><link rel="icon" href="${tabIcon}">
<style>${css}</style><main><h1>Rush Powersports</h1>
${body}
<footer><div>${logo} <b>Resource Automation</b></div>
<div>${c.user ? `user ${esc(c.user.name)} · ` : ''}db ${esc(process.env.MONGODB_DB)} · server ${Date.now() - c.t0}ms · rev ${esc(REV)}</div>
</footer></main><script>(${browser})()</script>`;

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

const home = (c) => page(c, 'Home', `<h2>Hi ${esc(c.user.name)}</h2>
<p class="dim">${c.user.roles.length ? esc(c.user.roles.join(' · ')) : 'no roles yet'}</p>
<p>jobs, parts and tasks come next.</p>
<div class="row">${can(c.user, 'team') ? '<a class="btn" href="/team">team →</a>' : ''}<form method="post" action="/logout"><button>sign out</button></form></div>`);

// shown once, right after it's made: only its hash is kept, so it can't be shown again later
const inviteBox = (link) => `<h2>Login link for ${esc(link.name)}</h2><div class="card">
<p>send this to ${esc(link.name)}. it works once, for 7 days.</p>
<p class="dim">${esc(link.url)}</p>
<div class="row"><button type="button" data-share="${esc(link.url)}" data-text="${esc(`${link.name}, here's your Rush Powersports login link. It works once, for 7 days.`)}" hidden>↗ share</button><button type="button" data-copy="${esc(link.url)}">⧉ copy</button></div></div>`;

// your own card can't change your roles or remove you, so you can't lock yourself out
const person = (c, p) => {
  const own = String(p._id) === String(c.user._id);
  const status = p.hash ? '' : p.invite ? `<div class="y">login link open until ${day(p.invite.expiresAt)}</div>` : '<div class="m">no password yet</div>';
  return `<form method="post" action="/team" class="card"><b>${esc(p.name)}</b> <span class="dim">${esc(showPhone(p.phone))}${own ? ' · you' : ''}</span>${status}
<div class="row">${ROLES.map((r) => {
    const on = p.roles.includes(r);
    return `<button class="tag ${on ? 'c' : 'dim'}" name="a" value="role:${p._id}:${r}:${on ? 0 : 1}"${own ? ' disabled' : ''}>${on ? '[x]' : '[ ]'} ${r}</button>`;
  }).join('')}</div>
<ul>${p.sessions.map((s) => `<li><span>${esc(s.device)} <span class="dim">· seen ${ago(s.seenAt)}${s.current ? ' · this one' : ''}</span></span>${s.current ? '' : `<button class="tag dim" name="a" value="revoke:${s._id}" aria-label="sign out this ${esc(s.device)}">×</button>`}</li>`).join('') || '<li class="dim">not signed in anywhere</li>'}</ul>
<div class="row"><button name="a" value="invite:${p._id}">↗ ${p.hash ? 'new login link' : 'login link'}</button>${own ? '' : `<button name="a" value="remove:${p._id}">× remove</button>`}</div></form>`;
};

const team = (c, people, link) => {
  const active = people.filter((p) => !p.disabledAt), removed = people.filter((p) => p.disabledAt);
  return page(c, 'Team', `${link ? inviteBox(link) : ''}
<h2>Add someone</h2>${error(c.msg)}<form method="post" action="/team">
<label>name<input name="name" maxlength="40" required placeholder="Brad"></label>
<label>phone<input name="phone" type="tel" inputmode="tel" required placeholder="405-555-0123"></label>
<div class="row"><button name="a" value="add">+ add and make login link</button></div></form>
<h2>Team</h2><div class="cards">${active.map((p) => person(c, p)).join('\n')}</div>
${removed.length ? `<h2>Removed</h2><form method="post" action="/team" class="card"><ul>${removed.map((p) => `<li><span>${esc(p.name)} <span class="dim">${esc(showPhone(p.phone))}</span></span><button class="tag c" name="a" value="restore:${p._id}">↺ restore</button></li>`).join('')}</ul></form>` : ''}
<div class="row"><a class="btn" href="/">← home</a></div>`);
};

module.exports = { icon, manifest, login, invite, inviteGone, invited, home, team };
