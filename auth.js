// login helpers with no db: passwords, tokens, cookies, phone numbers, who can do what
const crypto = require('crypto');

const ROLES = ['crew', 'manager', 'admin'];
const SESSION_DAYS = 90;

// scrypt with a random salt, stored as "scrypt:<salt>:<key>" in hex
const hashPassword = (password) => new Promise((ok, no) => {
  const salt = crypto.randomBytes(16);
  crypto.scrypt(String(password), salt, 64, (e, key) => e ? no(e) : ok(`scrypt:${salt.toString('hex')}:${key.toString('hex')}`));
});
const checkPassword = (password, stored) => new Promise((ok) => {
  const [kind, salt, key] = String(stored || '').split(':');
  if (kind !== 'scrypt' || !salt || !key) return ok(false);
  const want = Buffer.from(key, 'hex');
  crypto.scrypt(String(password), Buffer.from(salt, 'hex'), want.length || 64, (e, got) => ok(!e && got.length === want.length && crypto.timingSafeEqual(got, want)));
});

// tokens go to the phone; only their sha256 goes in the db, so a leaked backup can't sign anyone in
const newToken = () => crypto.randomBytes(32).toString('base64url');
const sha256 = (s) => crypto.createHash('sha256').update(String(s)).digest('hex');

const cookie = (req, name) => {
  for (const part of (req.headers.cookie || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0 && part.slice(0, i).trim() === name) return part.slice(i + 1).trim();
  }
  return null;
};
// Secure everywhere but localhost, which runs on plain http. no token clears it
const local = (req) => /^(localhost|127\.0\.0\.1)(:\d+)?$/.test(req.headers.host || '');
const sessionCookie = (req, token) => `s=${token || ''}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${token ? SESSION_DAYS * 86400 : 0}${local(req) ? '' : '; Secure'}`;

// forms from other sites can't post here: browsers send Origin with every POST, and it must be us
const sameOrigin = (req) => {
  const o = req.headers.origin;
  if (!o) return true;
  try { return new URL(o).host === req.headers.host; } catch { return false; }
};

// any format in, 10 digits out (an 11th leading 1 dropped), or null if it isn't a US number
const phone = (s) => {
  const d = String(s ?? '').replace(/\D/g, '').replace(/^1(?=\d{10}$)/, '');
  return /^[2-9]\d{9}$/.test(d) ? d : null;
};
const showPhone = (d) => /^\d{10}$/.test(d) ? `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}` : String(d ?? '');

// the one place that says who can do what; an action not listed here is allowed to nobody
const RULES = {
  team: ['admin'],
};
const can = (user, action) => !!user && !user.disabledAt && (RULES[action] || []).some((r) => (user.roles || []).includes(r));

const device = (ua = '') => /iPhone/.test(ua) ? 'iPhone' : /iPad/.test(ua) ? 'iPad' : /Android/.test(ua) ? 'Android'
  : /Macintosh/.test(ua) ? 'Mac' : /Windows/.test(ua) ? 'Windows' : 'browser';

module.exports = { ROLES, SESSION_DAYS, hashPassword, checkPassword, newToken, sha256, cookie, sessionCookie, sameOrigin, phone, showPhone, can, device };
