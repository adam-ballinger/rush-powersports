// node server.js                                          start the server
// node server.js invite <name> <phone> [crew] [manager] [admin]   print a login link (adds the person if the phone is new)
const http = require('http');
const db = require('./db');
const auth = require('./auth');
const pages = require('./pages');
const qr = require('./qr');

const ORIGIN = { dev: 'https://dev.rush.rxtm.net', prod: 'https://rush.rxtm.net' }[db.name] || `http://localhost:${process.env.PORT || 3000}`;
const MINUTE = 60000;

const html = (res, body, status = 200, headers = {}) => res.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', ...headers }).end(body);
const go = (res, to, headers = {}) => res.writeHead(303, { Location: to, ...headers }).end();

async function form(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) if ((size += chunk.length) > 10000) return null; else chunks.push(chunk);
  return new URLSearchParams(Buffer.concat(chunks).toString('utf8'));
}

// wrong password 5 times locks that phone for 15 minutes. an unknown phone still hashes, so it takes as long as a known one
async function login(req, res, c, f) {
  const phone = auth.phone(f.get('phone')), password = f.get('password') || '';
  const user = phone && await db.users.findOne({ phone, disabledAt: null });
  const again = (msg) => html(res, pages.login(c, { phone: f.get('phone'), msg }), 401);
  if (user && user.lockedUntil > new Date()) return again('too many wrong tries. wait 15 minutes, then try again.');
  const ok = user && user.hash ? await auth.checkPassword(password, user.hash) : (await auth.hashPassword(password), false);
  if (!ok) {
    if (user) {
      const u = await db.users.findOneAndUpdate({ _id: user._id }, { $inc: { fails: 1 } }, { returnDocument: 'after' });
      if (u && u.fails >= 5) await db.users.updateOne({ _id: user._id }, { $set: { fails: 0, lockedUntil: new Date(Date.now() + 15 * MINUTE) } });
    }
    return again('wrong phone or password.');
  }
  await db.users.updateOne({ _id: user._id }, { $set: { fails: 0, lockedUntil: null } });
  const token = await db.createSession(user._id, auth.device(req.headers['user-agent']));
  await db.logEvent({ userId: user._id, name: user.name }, 'login', user._id);
  go(res, '/', { 'Set-Cookie': auth.sessionCookie(req, token) });
}

// the link opens in Safari: set a password there, which also signs that browser in
async function invite(req, res, c, token, f) {
  const inv = await db.findInvite(token);
  const user = inv && await db.users.findOne({ _id: inv.userId, disabledAt: null });
  if (!user) return html(res, pages.inviteGone(c), 404);
  if (!f) return html(res, pages.invite(c, user, token));
  const password = f.get('password') || '';
  if (password.length < 8 || password.length > 200) return html(res, pages.invite(c, user, token, 'use 8 or more characters.'), 400);
  if (!await db.useInvite(inv)) return html(res, pages.inviteGone(c), 404);
  await db.users.updateOne({ _id: user._id }, { $set: { hash: await auth.hashPassword(password), fails: 0, lockedUntil: null } });
  const session = await db.createSession(user._id, auth.device(req.headers['user-agent']));
  await db.logEvent({ userId: user._id, name: user.name }, 'password set', user._id);
  html(res, pages.invited({ ...c, user }), 200, { 'Set-Cookie': auth.sessionCookie(req, session) });
}

const ID = /^[0-9a-f]{24}$/;
// user id -> name, for lists that only store ids
const names = async () => {
  const all = await db.users.find({}, { projection: { name: 1 } }).toArray(), m = new Map(all.map((u) => [String(u._id), u.name]));
  return (id) => m.get(String(id)) || 'someone';
};

// a fresh login link for someone; shown once
const linkFor = async (c, by, user) => ({ name: user.name, url: `${c.origin}/invite/${await db.createInvite(user._id, by)}` });

// role, remove, restore, unlock, delete on someone else (the caller makes sure it isn't you)
async function act(by, user, op, role, on) {
  const _id = user._id;
  if (op === 'role' && auth.ROLES.includes(role)) {
    await db.users.updateOne({ _id }, on === '1' ? { $addToSet: { roles: role } } : { $pull: { roles: role } });
    await db.logEvent(by, 'roles', _id, { role, on: on === '1' });
  }
  if (op === 'remove') {
    await db.users.updateOne({ _id }, { $set: { disabledAt: new Date() } });
    await Promise.all([db.sessions.deleteMany({ userId: _id }), db.invites.deleteMany({ userId: _id })]);
    await db.logEvent(by, 'remove', _id);
  }
  if (op === 'restore') {
    await db.users.updateOne({ _id }, { $set: { disabledAt: null } });
    await db.logEvent(by, 'restore', _id);
  }
  if (op === 'unlock') {
    await db.users.updateOne({ _id }, { $set: { fails: 0, lockedUntil: null } });
    await db.logEvent(by, 'unlock', _id);
  }
  // only a removed person can be deleted for good; their events stay, under "someone"
  if (op === 'delete' && user.disabledAt) {
    await Promise.all([db.users.deleteOne({ _id }), db.sessions.deleteMany({ userId: _id }), db.invites.deleteMany({ userId: _id })]);
    await db.logEvent(by, 'delete', _id, { name: user.name });
  }
  db.forget();
}

async function users(req, res, c, f) {
  const by = { userId: c.user._id, name: c.user.name };
  const show = async (link, msg, status = 200) => {
    const [all, invites] = await Promise.all([db.users.find().sort({ createdAt: 1 }).toArray(), db.invites.find({ expiresAt: { $gt: new Date() } }).toArray()]);
    for (const u of all) u.invite = invites.find((i) => i.userId.equals(u._id));
    html(res, pages.users({ ...c, msg }, all, link), status);
  };
  if (!f) return show();

  const [op, id, role, on] = (f.get('a') || '').split(':');
  if (op === 'add') {
    const name = (f.get('name') || '').trim().slice(0, 40), phone = auth.phone(f.get('phone'));
    if (!name || !phone) return show(null, 'type a name and a 10 digit phone number.', 400);
    const user = { name, phone, roles: [], hash: null, fails: 0, lockedUntil: null, createdAt: new Date(), createdBy: by, disabledAt: null };
    try { user._id = (await db.users.insertOne(user)).insertedId; } catch (e) {
      if (e.code === 11000) return show(null, `${auth.showPhone(phone)} is already a user${(await db.users.findOne({ phone })).disabledAt ? ', under removed' : ''}.`, 409);
      throw e;
    }
    await db.logEvent(by, 'invite', user._id);
    return show(await linkFor(c, by, user));
  }
  if (!ID.test(id)) return go(res, '/admin/users');
  const _id = new db.ObjectId(id), user = await db.users.findOne({ _id });
  if (!user) return go(res, '/admin/users');
  if (op === 'invite' && !user.disabledAt) {
    await db.logEvent(by, 'invite', _id);
    return show(await linkFor(c, by, user));
  }
  // everything below changes someone else, never yourself
  if (_id.equals(c.user._id)) return go(res, '/admin/users');
  await act(by, user, op, role, on);
  go(res, '/admin/users');
}

// one person: change name and phone, roles, login link, remove / restore / delete, unlock. you can't change your own roles or remove yourself
async function person(res, c, id, f) {
  const u = ID.test(id) && await db.users.findOne({ _id: new db.ObjectId(id) });
  if (!u) return go(res, '/admin/users');
  const by = { userId: c.user._id, name: c.user.name }, own = u._id.equals(c.user._id);
  const show = async (link, msg, status = 200) => {
    const [fresh, ss] = await Promise.all([db.users.findOne({ _id: u._id }), db.sessions.find({ userId: u._id, expiresAt: { $gt: new Date() } }).sort({ seenAt: -1 }).toArray()]);
    html(res, pages.person({ ...c, msg }, fresh, ss, link), status);
  };
  if (!f) return show();
  const [op, , role, on] = (f.get('a') || '').split(':');
  if (op === 'save') {
    const name = (f.get('name') || '').trim().slice(0, 40), phone = auth.phone(f.get('phone'));
    if (!name || !phone) return show(null, 'type a name and a 10 digit phone number.', 400);
    try { await db.users.updateOne({ _id: u._id }, { $set: { name, phone } }); } catch (e) {
      if (e.code === 11000) return show(null, `${auth.showPhone(phone)} belongs to someone else.`, 409);
      throw e;
    }
    if (name !== u.name) await db.logEvent(by, 'rename', u._id, { from: u.name, to: name });
    if (phone !== u.phone) await db.logEvent(by, 'set phone', u._id);
    db.forget();
  }
  if (op === 'invite' && !u.disabledAt) {
    await db.logEvent(by, 'invite', u._id);
    return show(await linkFor(c, by, u));
  }
  if (!own || op === 'unlock') await act(by, u, op, role, on);
  go(res, op === 'delete' && !own && u.disabledAt ? '/admin/users' : '/admin/users/' + id);
}

// every signed-in phone; × signs it out (yours can't be, use sign out)
async function sessions(req, res, c, f) {
  const [op, id] = f ? (f.get('a') || '').split(':') : [];
  if (op === 'revoke' && ID.test(id) && id !== String(c.session._id)) {
    const s = await db.sessions.findOneAndDelete({ _id: new db.ObjectId(id) });
    if (s) await db.logEvent({ userId: c.user._id, name: c.user.name }, 'revoke', s.userId, { device: s.device });
    db.forget();
  }
  if (f) return go(res, '/admin/sessions');
  const [all, who] = await Promise.all([db.sessions.find({ expiresAt: { $gt: new Date() } }).sort({ seenAt: -1 }).toArray(), names()]);
  html(res, pages.sessions(c, all, who));
}

// one session's fields (not its token hash)
async function session(res, c, id) {
  const s = ID.test(id) && await db.sessions.findOne({ _id: new db.ObjectId(id) });
  if (!s) return go(res, '/admin/sessions');
  const who = await names();
  html(res, pages.session(c, s, who(s.userId)));
}

// anyone adds an issue; admins mark them done or reopen them
async function issues(req, res, c, f) {
  const [op, id] = f ? (f.get('a') || '').split(':') : [];
  const text = f && (f.get('text') || '').trim().slice(0, 500);
  if (op === 'add' && !text) return html(res, pages.issues({ ...c, msg: 'type something.' }, await db.issues.find().sort({ at: -1 }).toArray()), 400);
  if (op === 'add') await db.issues.insertOne({ text, by: { userId: c.user._id, name: c.user.name }, at: new Date(), doneAt: null });
  if ((op === 'done' || op === 'reopen') && ID.test(id) && auth.can(c.user, 'admin')) {
    await db.issues.updateOne({ _id: new db.ObjectId(id) }, { $set: { doneAt: op === 'done' ? new Date() : null } });
  }
  if (f) return go(res, '/account/issues');
  html(res, pages.issues(c, await db.issues.find().sort({ at: -1 }).toArray()));
}

// one issue. writer or admin: save, delete. admin: done, reopen
async function issue(res, c, id, f) {
  const i = ID.test(id) && await db.issues.findOne({ _id: new db.ObjectId(id) });
  if (!i) return go(res, '/account/issues');
  const admin = auth.can(c.user, 'admin'), mine = String(i.by.userId) === String(c.user._id), a = f && f.get('a');
  const set = (x) => db.issues.updateOne({ _id: i._id }, { $set: x });
  if (a === 'save' && (mine || admin)) {
    const text = (f.get('text') || '').trim().slice(0, 500);
    if (!text) return html(res, pages.issue({ ...c, msg: 'type something.' }, i), 400);
    await set({ text });
  }
  if (a === 'delete' && (mine || admin)) { await db.issues.deleteOne({ _id: i._id }); return go(res, '/account/issues'); }
  if ((a === 'done' || a === 'reopen') && admin) await set({ doneAt: a === 'done' ? new Date() : null });
  if (f) return go(res, '/account/issues/' + id);
  html(res, pages.issue(c, i));
}

// your own signed-in phones; × signs one out (this one can't be, use sign out)
async function mySessions(req, res, c, f) {
  const [op, id] = f ? (f.get('a') || '').split(':') : [];
  if (op === 'revoke' && ID.test(id) && id !== String(c.session._id)) {
    const s = await db.sessions.findOneAndDelete({ _id: new db.ObjectId(id), userId: c.user._id });
    if (s) await db.logEvent({ userId: c.user._id, name: c.user.name }, 'revoke', c.user._id, { device: s.device });
    db.forget();
  }
  if (f) return go(res, '/account/sessions');
  html(res, pages.mySessions(c, await db.sessions.find({ userId: c.user._id, expiresAt: { $gt: new Date() } }).sort({ seenAt: -1 }).toArray()));
}

// login links not used yet; × cancels one so it stops working
async function invites(req, res, c, f) {
  const [op, id] = f ? (f.get('a') || '').split(':') : [];
  if (op === 'cancel' && ID.test(id)) {
    const i = await db.invites.findOneAndDelete({ _id: new db.ObjectId(id) });
    if (i) await db.logEvent({ userId: c.user._id, name: c.user.name }, 'cancel', i.userId);
  }
  if (f) return go(res, '/admin/invites');
  const [all, who] = await Promise.all([db.invites.find({ expiresAt: { $gt: new Date() } }).sort({ expiresAt: -1 }).toArray(), names()]);
  html(res, pages.invites(c, all, who));
}

// your own name, phone and password. the page comes back with a message under the form you used
async function profile(req, res, c, f) {
  if (!f) return html(res, pages.profile(c));
  const me = c.user, by = { userId: me._id, name: me.name }, a = f.get('a');
  const done = async (text, ok = true, status = 200) => {
    db.forget();
    html(res, pages.profile({ ...c, user: await db.users.findOne({ _id: me._id }), msg: [a, text, ok] }), status);
  };
  if (a === 'name') {
    const name = (f.get('name') || '').trim().slice(0, 40);
    if (!name) return done('type a name.', false, 400);
    if (name === me.name) return done('saved.');
    await db.users.updateOne({ _id: me._id }, { $set: { name } });
    await db.logEvent({ ...by, name }, 'name', me._id, { from: me.name, to: name });
    return done('saved.');
  }
  if (a !== 'phone' && a !== 'password') return go(res, '/account/profile');
  if (!await auth.checkPassword(f.get('current') || '', me.hash)) return done('your current password is wrong.', false, 401);
  if (a === 'phone') {
    const phone = auth.phone(f.get('phone'));
    if (!phone) return done('type a 10 digit phone number.', false, 400);
    try { await db.users.updateOne({ _id: me._id }, { $set: { phone } }); } catch (e) {
      if (e.code === 11000) return done(`${auth.showPhone(phone)} belongs to someone else.`, false, 409);
      throw e;
    }
    await db.logEvent(by, 'phone', me._id);
    return done(`saved. sign in with ${auth.showPhone(phone)} from now on.`);
  }
  const password = f.get('password') || '';
  if (password.length < 8 || password.length > 200) return done('use 8 or more characters.', false, 400);
  await db.users.updateOne({ _id: me._id }, { $set: { hash: await auth.hashPassword(password) } });
  const out = await db.sessions.deleteMany({ userId: me._id, _id: { $ne: c.session._id } });
  await db.logEvent(by, 'password change', me._id);
  done(`saved.${out.deletedCount ? ` signed out ${out.deletedCount} other phone${out.deletedCount > 1 ? 's' : ''}.` : ''}`);
}

async function events(res, c) {
  // events per day for the last 30 days (Chicago days, today last), zeros included
  const base = Date.parse(new Date().toLocaleDateString('en-CA', { timeZone: 'America/Chicago' }));
  const [all, who, perDay] = await Promise.all([
    db.events.find().sort({ at: -1 }).limit(100).toArray(), names(),
    db.events.aggregate([
      { $match: { at: { $gte: new Date(base - 32 * 864e5) } } },
      { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$at', timezone: 'America/Chicago' } }, n: { $sum: 1 } } },
    ]).toArray(),
  ]);
  const n = new Map(perDay.map((d) => [d._id, d.n]));
  const days = [...Array(30)].map((_, i) => { const k = new Date(base - (29 - i) * 864e5).toISOString().slice(0, 10); return [k, n.get(k) || 0]; });
  html(res, pages.events(c, all, who, days));
}

async function serve() {
  await db.connect();
  const port = process.env.PORT || 3000;
  http.createServer(async (req, res) => {
    try {
      const t0 = Date.now(), url = new URL(req.url, 'http://x');
      // phones ask for these on their own, signed in or not. pages link them with ?v=<fingerprint>, so those copies keep for good;
      // a bare request (phones guessing /apple-touch-icon.png) only keeps for 5 minutes
      const keep = { 'Cache-Control': url.searchParams.get('v') ? 'public, max-age=31536000, immutable' : 'public, max-age=300' };
      if (/^\/(icon\.png|favicon\.ico|apple-touch-icon[\w-]*\.png)$/.test(url.pathname)) return res.writeHead(200, { 'Content-Type': 'image/png', ...keep }).end(pages.icon);
      if (url.pathname === '/manifest.json') return res.writeHead(200, { 'Content-Type': 'application/manifest+json', ...keep }).end(pages.manifest);

      if (req.method === 'POST' && !auth.sameOrigin(req)) return res.writeHead(403).end();
      const f = req.method === 'POST' ? await form(req) : null;
      if (req.method === 'POST' && !f) return res.writeHead(413).end();
      const token = auth.cookie(req, 's'), me = token && await db.findSession(token);
      const c = { t0, origin: `${req.headers['x-forwarded-proto'] || 'http'}://${req.headers.host}`, ...me };
      const [, route, arg, sub] = url.pathname.split('/');

      if (route === 'invite' && arg) return await invite(req, res, c, arg, f);
      if (route === 'login') return me ? go(res, '/') : f ? await login(req, res, c, f) : html(res, pages.login(c));
      if (route === 'logout' && f) {
        if (me) await db.sessions.deleteOne({ _id: me.session._id });
        db.forget();
        return go(res, '/login', { 'Set-Cookie': auth.sessionCookie(req, '') });
      }
      if (!me) return go(res, '/login', token ? { 'Set-Cookie': auth.sessionCookie(req, '') } : {});

      // / and /<section> land on the first page you can use. pages are /<section>/<page>, each checked with can()
      if (route === '') return go(res, pages.landing(c.user));
      if (!arg && pages.landing(c.user, route)) return go(res, pages.landing(c.user, route));
      if (route === 'account' && arg === 'home' && !f) return html(res, pages.home(c));
      if (route === 'account' && arg === 'issues' && sub) return await issue(res, c, sub, f);
      if (route === 'account' && arg === 'issues') return await issues(req, res, c, f);
      if (route === 'account' && arg === 'sessions') return await mySessions(req, res, c, f);
      if (route === 'account' && arg === 'profile') return await profile(req, res, c, f);
      if (route === 'admin' && auth.can(c.user, 'admin')) {
        if (arg === 'users' && sub) return await person(res, c, sub, f);
        if (arg === 'users') return await users(req, res, c, f);
        if (arg === 'sessions' && sub && !f) return await session(res, c, sub);
        if (arg === 'sessions') return await sessions(req, res, c, f);
        if (arg === 'invites') return await invites(req, res, c, f);
        if (arg === 'events' && !f) return await events(res, c);
      }
      res.writeHead(404).end();
    } catch (e) {
      console.error(e);
      if (!res.headersSent) res.writeHead(500);
      res.end();
    }
  }).listen(port, () => console.log(`serving on port ${port}`));
}

// the first admin can't be invited from the app, so this makes the link from the command line
async function inviteCommand(name, phoneIn, roles) {
  const phone = auth.phone(phoneIn);
  if (!name || !phone) throw new Error('usage: node server.js invite <name> <phone> [crew] [manager] [admin]');
  await db.connect();
  const by = { userId: null, name: 'command line' };
  let user = await db.users.findOne({ phone });
  if (!user) {
    user = { name, phone, roles, hash: null, fails: 0, lockedUntil: null, createdAt: new Date(), createdBy: by, disabledAt: null };
    user._id = (await db.users.insertOne(user)).insertedId;
  } else if (roles.length) await db.users.updateOne({ _id: user._id }, { $addToSet: { roles: { $each: roles } } });
  await db.logEvent(by, 'invite', user._id);
  const link = `${ORIGIN}/invite/${await db.createInvite(user._id, by)}`;
  console.log(`${qr.terminal(link)}\n\n${user.name} (${auth.showPhone(phone)}, db ${db.name}), works once for 7 days:\n${link}`);
}

const [cmd, ...args] = process.argv.slice(2);
(cmd === 'invite' ? inviteCommand(args[0], args[1], args.slice(2).filter((r) => auth.ROLES.includes(r))).finally(() => db.close()) : serve())
  .catch((e) => { console.error(e.message || e); process.exitCode = 1; });
