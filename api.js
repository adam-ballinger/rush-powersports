// json api for developers and Claude: read, update and complete issues. no key set (API_KEY env) = no api
//   GET   /api/issues            open issues, newest first (?all=1 adds done ones)
//   GET   /api/issues/:id        one issue
//   PATCH /api/issues/:id        {"text": "...", "done": true|false}: either or both; done:true completes, done:false reopens
// send  Authorization: Bearer <API_KEY>
const crypto = require('crypto');
const db = require('./db');

const ID = /^[0-9a-f]{24}$/;
const digest = (s) => crypto.createHash('sha256').update(s).digest(); // equal length, so timingSafeEqual can compare any two keys
const allowed = (req) => {
  const m = /^Bearer (.+)$/.exec(req.headers.authorization || '');
  return !!m && crypto.timingSafeEqual(digest(m[1]), digest(process.env.API_KEY));
};
const json = (res, status, body) => res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }).end(JSON.stringify(body));
const shape = (i) => ({ id: String(i._id), text: i.text, by: i.by.name, at: i.at, doneAt: i.doneAt });

async function body(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) if ((size += chunk.length) > 10000) return null; else chunks.push(chunk);
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { return null; }
}

module.exports = async (req, res, url) => {
  const [, , what, id] = url.pathname.split('/');
  if (!process.env.API_KEY || what !== 'issues') return json(res, 404, { error: 'not found' });
  if (!allowed(req)) return json(res, 401, { error: 'send Authorization: Bearer <API_KEY>' });

  if (!id) {
    if (req.method !== 'GET') return json(res, 405, { error: 'GET only' });
    const all = await db.issues.find(url.searchParams.get('all') ? {} : { doneAt: null }).sort({ at: -1 }).toArray();
    return json(res, 200, all.map(shape));
  }

  const i = ID.test(id) && await db.issues.findOne({ _id: new db.ObjectId(id) });
  if (!i) return json(res, 404, { error: 'no such issue' });
  if (req.method === 'GET') return json(res, 200, shape(i));
  if (req.method !== 'PATCH') return json(res, 405, { error: 'GET or PATCH' });

  const b = await body(req), set = {};
  if (!b || typeof b !== 'object') return json(res, 400, { error: 'send json: {"text": "...", "done": true}' });
  if ('text' in b) {
    const text = typeof b.text === 'string' && b.text.trim().slice(0, 500);
    if (!text) return json(res, 400, { error: 'text must be a non-empty string' });
    set.text = text;
  }
  if ('done' in b) {
    if (typeof b.done !== 'boolean') return json(res, 400, { error: 'done must be true or false' });
    set.doneAt = b.done ? (i.doneAt || new Date()) : null;
  }
  if (!Object.keys(set).length) return json(res, 400, { error: 'nothing to change: send text and/or done' });
  await db.issues.updateOne({ _id: i._id }, { $set: set });
  await db.logEvent({ userId: null, name: 'api' }, 'issue', null, { issue: i._id, ...('done' in set || 'doneAt' in set ? { done: !!set.doneAt } : {}) });
  json(res, 200, shape({ ...i, ...set }));
};
