// one mongo connection for the whole app; MONGODB_DB is `dev` or `prod`
const fs = require('fs');
const path = require('path');
const { MongoClient, ObjectId } = require('mongodb');
const { sha256, newToken, SESSION_DAYS } = require('./auth');

const env = path.join(__dirname, '.env');
if (!process.env.MONGODB_URI && fs.existsSync(env)) process.loadEnvFile(env);
if (!process.env.MONGODB_URI || !process.env.MONGODB_DB) {
  console.error('set MONGODB_URI and MONGODB_DB');
  process.exit(1);
}

const name = process.env.MONGODB_DB;
const client = new MongoClient(process.env.MONGODB_URI, { minPoolSize: 2 }); // warm connections so parallel queries skip the handshake
const db = client.db(name);
const users = db.collection('users'), invites = db.collection('invites'), sessions = db.collection('sessions'), events = db.collection('events');
const DAY = 864e5;

// expiresAt indexes are TTL: mongo deletes those docs on its own, within a minute or so of expiring
async function connect() {
  await client.connect();
  await Promise.all([
    users.createIndex({ phone: 1 }, { unique: true }),
    invites.createIndex({ hash: 1 }, { unique: true }),
    invites.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
    invites.createIndex({ userId: 1 }),
    sessions.createIndex({ hash: 1 }, { unique: true }),
    sessions.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
    sessions.createIndex({ userId: 1 }),
    events.createIndex({ at: -1 }),
  ]);
}

// sessions barely change, so skip the db round trip for a minute. forget() after revoking or changing roles;
// other Cloud Run instances catch up within the minute
const cache = new Map();
const forget = () => cache.clear();

async function findSession(token) {
  const hash = sha256(token), hit = cache.get(hash);
  if (hit && Date.now() - hit.at < 60000) return hit.me;
  const s = await sessions.findOne({ hash, expiresAt: { $gt: new Date() } });
  const user = s && await users.findOne({ _id: s.userId, disabledAt: null });
  if (!user) return null;
  // sliding expiry: used at least once in 90 days keeps you signed in. at most one write an hour per phone
  if (Date.now() - s.seenAt > DAY / 24) {
    Object.assign(s, { seenAt: new Date(), expiresAt: new Date(Date.now() + SESSION_DAYS * DAY) });
    await sessions.updateOne({ _id: s._id }, { $set: { seenAt: s.seenAt, expiresAt: s.expiresAt } });
  }
  if (cache.size > 1000) forget();
  const me = { session: s, user };
  cache.set(hash, { me, at: Date.now() });
  return me;
}

async function createSession(userId, device) {
  const token = newToken(), now = new Date();
  await sessions.insertOne({ hash: sha256(token), userId, device, createdAt: now, seenAt: now, expiresAt: new Date(+now + SESSION_DAYS * DAY) });
  return token;
}

// one open invite per person: a new one replaces the old. works once, for 7 days
async function createInvite(userId, by) {
  const token = newToken();
  await invites.deleteMany({ userId });
  await invites.insertOne({ hash: sha256(token), userId, createdBy: by, expiresAt: new Date(Date.now() + 7 * DAY) });
  return token;
}
const findInvite = (token) => invites.findOne({ hash: sha256(token), expiresAt: { $gt: new Date() } });
// null if someone else used it first
const useInvite = (invite) => invites.findOneAndDelete({ _id: invite._id });

// append-only: who did what to whom. by is { userId, name }
const logEvent = (by, what, userId, more = {}) => events.insertOne({ at: new Date(), by, what, userId, ...more });

module.exports = {
  name, db, ObjectId, users, invites, sessions, events,
  connect, close: () => client.close(), forget,
  findSession, createSession, createInvite, findInvite, useInvite, logEvent,
};
