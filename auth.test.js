// npm test
const test = require('node:test');
const assert = require('node:assert');
const auth = require('./auth');

test('passwords: right one passes, wrong or tampered fails', async () => {
  const stored = await auth.hashPassword('correct horse');
  assert.match(stored, /^scrypt:[0-9a-f]{32}:[0-9a-f]{128}$/);
  assert.notEqual(stored, await auth.hashPassword('correct horse'), 'salted, so the same password hashes differently');
  assert.equal(await auth.checkPassword('correct horse', stored), true);
  assert.equal(await auth.checkPassword('correct horsf', stored), false);
  assert.equal(await auth.checkPassword('correct horse', stored.slice(0, -2) + '00'), false);
  for (const bad of [null, '', 'scrypt', 'scrypt::', 'bcrypt:aa:bb', 'scrypt:zz:zz']) assert.equal(await auth.checkPassword('x', bad), false, bad);
});

test('tokens: long, random, and only the hash is stored', () => {
  const a = auth.newToken(), b = auth.newToken();
  assert.notEqual(a, b);
  assert.match(a, /^[\w-]{43}$/);
  assert.equal(auth.sha256(a), auth.sha256(a));
  assert.notEqual(auth.sha256(a), a);
});

test('phone numbers: any format in, 10 digits out', () => {
  for (const s of ['(405) 555-0123', '405.555.0123', '4055550123', '1-405-555-0123', '+1 405 555 0123']) assert.equal(auth.phone(s), '4055550123', s);
  for (const s of ['', null, '555-0123', '011 405 555 0123', '105-555-0123', '405-555-01235']) assert.equal(auth.phone(s), null, s);
  assert.equal(auth.showPhone('4055550123'), '405-555-0123');
});

test('cookies: read by name, Secure except on localhost', () => {
  const req = (cookie, host = 'dev.rush.rxtm.net') => ({ headers: { cookie, host } });
  assert.equal(auth.cookie(req('a=1; s=tok; b=2'), 's'), 'tok');
  assert.equal(auth.cookie(req('ss=no'), 's'), null);
  assert.equal(auth.cookie(req(undefined), 's'), null);
  assert.match(auth.sessionCookie(req(''), 'tok'), /^s=tok; HttpOnly; SameSite=Lax; Path=\/; Max-Age=7776000; Secure$/);
  assert.doesNotMatch(auth.sessionCookie(req('', 'localhost:3002'), 'tok'), /Secure/);
  assert.match(auth.sessionCookie(req(''), ''), /^s=; .*Max-Age=0/);
});

test('posts only from our own pages', () => {
  const req = (origin) => ({ headers: { origin, host: 'dev.rush.rxtm.net' } });
  assert.equal(auth.sameOrigin(req('https://dev.rush.rxtm.net')), true);
  assert.equal(auth.sameOrigin(req(undefined)), true);
  assert.equal(auth.sameOrigin(req('https://evil.example')), false);
  assert.equal(auth.sameOrigin(req('null')), false);
});

test('can: only admins manage the team; removed people can do nothing', () => {
  assert.equal(auth.can({ roles: ['admin'] }, 'team'), true);
  for (const roles of [[], ['crew'], ['manager']]) assert.equal(auth.can({ roles }, 'team'), false, roles.join());
  assert.equal(auth.can({ roles: ['admin'], disabledAt: new Date() }, 'team'), false);
  assert.equal(auth.can(null, 'team'), false);
  assert.equal(auth.can({ roles: ['admin'] }, 'not a real action'), false);
});
