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

async function team(req, res, c, f) {
  const by = { userId: c.user._id, name: c.user.name };
  const show = async (link, msg, status = 200) => {
    const [people, sessions, invites] = await Promise.all([
      db.users.find().sort({ createdAt: 1 }).toArray(),
      db.sessions.find({ expiresAt: { $gt: new Date() } }).sort({ seenAt: -1 }).toArray(),
      db.invites.find({ expiresAt: { $gt: new Date() } }).toArray(),
    ]);
    for (const p of people) {
      p.sessions = sessions.filter((s) => s.userId.equals(p._id)).map((s) => ({ ...s, current: s._id.equals(c.session._id) }));
      p.invite = invites.find((i) => i.userId.equals(p._id));
    }
    html(res, pages.team({ ...c, msg }, people, link), status);
  };
  if (!f) return show();
  const linkFor = async (user) => ({ name: user.name, url: `${c.origin}/invite/${await db.createInvite(user._id, by)}` });

  const [op, id, role, on] = (f.get('a') || '').split(':');
  if (op === 'add') {
    const name = (f.get('name') || '').trim().slice(0, 40), phone = auth.phone(f.get('phone'));
    if (!name || !phone) return show(null, 'type a name and a 10 digit phone number.', 400);
    const user = { name, phone, roles: [], hash: null, fails: 0, lockedUntil: null, createdAt: new Date(), createdBy: by, disabledAt: null };
    try { user._id = (await db.users.insertOne(user)).insertedId; } catch (e) {
      if (e.code === 11000) return show(null, `${auth.showPhone(phone)} is already on the team${(await db.users.findOne({ phone })).disabledAt ? ', under removed' : ''}.`, 409);
      throw e;
    }
    await db.logEvent(by, 'invite', user._id);
    return show(await linkFor(user));
  }
  if (op === 'revoke' && /^[0-9a-f]{24}$/.test(id)) {
    const s = await db.sessions.findOneAndDelete({ _id: new db.ObjectId(id) });
    if (s) await db.logEvent(by, 'revoke', s.userId, { device: s.device });
    db.forget();
    return go(res, '/team');
  }
  if (!/^[0-9a-f]{24}$/.test(id)) return go(res, '/team');
  const _id = new db.ObjectId(id), user = await db.users.findOne({ _id });
  if (!user) return go(res, '/team');
  if (op === 'invite' && !user.disabledAt) {
    await db.logEvent(by, 'invite', _id);
    return show(await linkFor(user));
  }
  // everything below changes someone else, never yourself
  if (_id.equals(c.user._id)) return go(res, '/team');
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
  db.forget();
  go(res, '/team');
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
      const [, route, arg] = url.pathname.split('/');

      if (route === 'invite' && arg) return await invite(req, res, c, arg, f);
      if (route === 'login') return me ? go(res, '/') : f ? await login(req, res, c, f) : html(res, pages.login(c));
      if (route === 'logout' && f) {
        if (me) await db.sessions.deleteOne({ _id: me.session._id });
        db.forget();
        return go(res, '/login', { 'Set-Cookie': auth.sessionCookie(req, '') });
      }
      if (!me) return go(res, '/login', token ? { 'Set-Cookie': auth.sessionCookie(req, '') } : {});

      if (route === '' && !f) return html(res, pages.home(c));
      if (route === 'team' && auth.can(c.user, 'team')) return await team(req, res, c, f);
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
